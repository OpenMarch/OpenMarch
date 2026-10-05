<!-- cspell:disable -->

# How the current timeline model handles steal-out and join-in

Checkout read: `timeline/p8-17-core-loop` (HEAD 7818f4b3), not `timeline-try-2`. HEAD is ahead of `timeline-try-2` by the P8.17 WIP: UI-10 in ui.md and `moveMarchersInRangeInTransaction` in timelineMoves.ts. Nothing else under core or db-functions differs. Nothing was edited.

## 1. Storage and resolution

### Schema

The schema is spec §5.1 (spec.md:141-245), stored as the `timeline_*` tables (ADR 0001 §2).

- **`timelines(start_beat, end_beat)`.** A container only. The resolver must not read it (R-1, spec.md:511-513).
  - App restriction C-11 (implementation-plan.md:147-163): every transition spans its timeline exactly.
  - App restriction C-12: at most one timeline per range.
- **`transitions`.** Columns: `timeline_id`, `dest_shape_id` (nullable), `path_style` (direct, arc or FTL), `path_params` (bulge or waypoints), `order_mode`, `slot_count`, `start_beat`, `end_beat`.
  - **There is no origin column.** The glossary says a transition "does **not** store where marchers start" (spec.md:62; §3 at spec.md:104: "its start state is an input to resolution").
- **`slot_destinations(transition_id, slot_index, x, y)`** holds individual destinations (D-16). When a transition has a shape, its destinations are sampled from the shape (R-13, spec.md:666-681).
- **`assignments(marcher, transition, slot_index, start_beat, end_beat, layer)`.** This is the only link between a marcher and a slot.
  - I-A1: an assignment lies inside its own transition (trigger `asn_bounds_*`, plus `tr_range_check`).
  - I-A3: no overlap for the same marcher **at the same layer** (`asn_overlap_*`).
  - The DB has no rule about overlaps across layers or timelines.
- **Progress is never stored.** Positions are derived (D-2), and only span-start origins are cached (D-3, D-10).

### Resolution

- **R-2:** flatten each marcher's rows. For each beat the highest layer wins; gaps become holds.
- **R-3:** classify each span as founding (`s.start == T.start`), join (the row's first span is not founding) or resume.
- **R-4:** `origin(s)` is the position where the previous span ends.
- **R-5 and D-7:** `p = clamp01((b - s.start)/(T.end - s.start))`. Then:
  - direct: `lerp(origin, dest[slot], p)` (R-7)
  - arc: `arcPoint` (R-8)
  - FTL: founding spans use the trail (R-9, R-10); joins and resumes fall back to direct (R-11, Q-3).
- **D-12 (status: Proposed).** Joins and resumes rebase: the remaining distance is covered in the transition's remaining time.
- **Code:** `packages/core/src/timeline/resolver.ts:491-517` (`progress`, `evalSpan`).
- **Public API** (types.ts:107-131, index.ts): `positionAt`, `positionsAt`, `explain` (span, origin, progress, diagnostics), `spanInfos`, `ftlEntry`, `diagnostics`.
  - `geom.ts`, which holds `lerp` and `arcPoint`, is internal.
  - Destinations are not exposed, although the app has them in its snapshot (`readTimelineTables`).

### What a group move is in the app today

UI-9 and C-12 (ui.md:144, 212-222; implementation-plan.md:186-191) set this up:

- Every added marcher gets **its own one-slot shapeless `direct` transition** spanning the timeline (`createOwnTransitionsInTransaction`, timelineMembership.ts:127-160).
- So "the group move" is N independent transitions that share one timeline row. The timeline row has no effect on motion.
- N-slot shape transitions (D-4) exist only through the inspector and the converter.
- Dragging a marcher in a shape-backed transition converts it to individual points (P7.2, the Q-14 workaround).

## 2. Origin, destination and ghost paths

- **Destination:** one absolute point per slot (D-5, D-16). For this app it is one point per marcher-transition.
- **Origin:** per span and derived. A founding span's origin is wherever the marcher is at `T.start`.

**The nominal (unstolen) path is computable for founding members** without new data:

- For direct: `lerp(explain(m, T.start).origin, dest, (b - T.start)/(T.end - T.start))`. This is exactly what R-5 already evaluates during the founding span (D-7). Stealing doesn't change it; it only clips it.
- For arc, the app would need `arcPoint`, which isn't exported.
- For FTL, the app would need the trail, which `FtlEntryInfo` doesn't expose.
- **Easiest route for every style:** build a throwaway resolver over the snapshot with the stealing rows removed, and sample `positionAt`. timelineMoves.ts:91-130 `sampleShape` already uses this pattern. This is an app-side computation and needs no schema change.

**Joiners and resumers have no nominal path.**

- A join's origin is where the joiner actually is, and its motion rebases toward its destination (G5, spec.md:1167). Nothing says where it "would have" started.
- So "ghost start dots" have **no data source today.** They would need either:
  - a new stored per-slot origin, which changes the schema and the file format and breaks "transitions don't store starts", or
  - a derivation rule, for example a ghost start extrapolated backward from the destination through the join point, or the group's offset.
- In the current UI the green arrows to the joiners' destinations would be rebased chords, not parallel lanes.

**Existing rendering to build on**

- `timelinePaths.ts` `sampleTimelinePath` (lines 74-102) samples actual paths from the resolver between two beats.
- `useTimelinePathRender.ts` draws previous and next paths around the selected page.
- `OpenMarchCanvas.renderTimelinePathVisuals` (OpenMarchCanvas.ts:1562-1619) and the `TimelinePathway` polyline class do the drawing.
- `MarcherVisualGroup` provides previous and next `Endpoint`/`Midpoint` dots per marcher (MarcherVisualGroup.ts:20-30).
- There is **no ghost or onion-skin rendering yet.**
  - UI-10 Dimming (ui.md:315-317) defers "showing who moves" to "the ghosts-and-paths work (report H1)".
  - `TimelineSelectionStore.ts:215` says the same.
  - The "Origin and Arrival" report and the P8.17 log are not in the repo.
- Paths are still keyed to page pairs (`selectedPage`), not to a focused transition.

## 3. Scenario 1: steal-out partly past the end

**Setup.** The group is in page timeline [1,17) at layer 0. Pin S at 9, put P at 21, and drag the outer marchers.

**Path through the code.** `moveMarchersInTarget` takes the `range` branch to `moveMarchersInRangeInTransaction` (timelineMoves.ts:494-526), which calls `addMarchersToTimelineInTransaction`.

**It is refused at timelineMembership.ts:236-240** with "F1 is in a timeline over beats [1, 17), which only partly overlaps [9, 21)" (E-ARGS).

- This is the **app (UI-9 Layers) rule only**. ui.md:236-238 says outright: "the database wouldn't refuse it, since the new row is a layer up."
- The same rule appears in C-12 (implementation-plan.md:191) and P8.14 (phases/08-authoring-ui.md:170).
- `timelineMarchers.ts:136-148` also skips partly overlapping timelines when new marchers join.
- If page 2's timeline [17,33) is stored, it partly overlaps [9,21) too and would also refuse.

**If the refusal were lifted:**

- **Database:** fine. The new transition [9,21) is valid against its own timeline (I-A1). `stealLayer` (timelineCommands.ts:251-279) puts it one above the highest overlapping row, so I-A3 holds.
- **Resolver:** fine, and it already gives requirement 3. The spans become A[1,9) founding, then B[9,21) founding.
  - B's origin is the position on A at beat 9, which is A's own progress 8/16 (D-7, golden G2).
  - Editing A's destination moves the beat-9 point, and B re-originates from it (R-4). No resume happens, because A ends inside B.
- **What breaks or degrades:**
  - **Page 2's move is affected.** F1's page-2 row [17,33) is stolen over [17,21). It then **resumes** from B's endpoint and catches up to page 2's destination (rebase, D-12).
  - **Dragging stolen members in A is refused.** At P=17 in [1,17), `moveMarchersInTimelineInTransaction` (timelineMoves.ts:432-436) refuses with "is in a move on a higher layer at beat 17 … Select that move's timeline instead". So "edit the destination as if all marchers still go there" fails for any selection that includes stolen marchers.
  - **No handle to edit A's end for stolen marchers.** The canvas draws them on B, so their A destination has nowhere to be grabbed.
  - **Timeline drawing:** two partly overlapping timelines both draw. [9,21) is off the page boxes, so it gets a clip (UI-10).
  - **Beat edits already produce this state.** The ui.md backlog (552-555) notes that beat edits, clip shifts and range edits can already create partial overlaps; UI-9 checks them only when adding.

## 4. Scenario 2: join-in

**Setup.** Joiners J have their own move Y [1,7) into the green group's lane. Then J should follow green [1,17).

**Order matters (backlog, ui.md:559-560).**

- **Y first, then J into green.** Adding J to [1,17) is refused at timelineMembership.ts:241-245 ("…inside [1,17); adding it would replace that move"). If allowed, `stealLayer` would put green _above_ Y and steal it entirely.
- **J into green first, then Y.** Y is wholly inside green, so it is allowed at layer 1 and steals [1,7). J's green row becomes a **join** at 7 (R-3; it is not founding because the row is overridden at `T.start`, QA-FL-03).
  - J goes **directly** from Y's end to J's green destination over [7,17), rebased (R-5, D-12), with an info diagnostic `D-REBASE`.
  - Y's destination is absolute (D-5). Editing green's start or destination doesn't move Y's endpoint, so J lands where Y said and then cuts a chord: the "merge" isn't kept.
- **FTL joins** use the direct fallback with a diagnostic (R-11, Q-3).
- **The lead default** "more than one row" (ui.md:257-260) refuses canvas edits of a marcher with two rows in a timeline.

## 5. Spec rules, open questions and decisions that touch this

**Spec rules**

- R-2, R-3, R-4, R-5, R-11
- D-5 (absolute destinations; nothing is relative to upstream geometry)
- D-6 (explicit layer)
- D-7 (Decided)
- D-12 (Proposed)
- D-16
- I-A1, I-A3
- G2 (steal), G3 (stacked steals and resume), G5 (join), G11 and G12 (FTL join and resume)

**Spec open questions**

- Q-1: ripple and inherit bounds
- Q-2: absolute versus relative beats
- Q-3: FTL joins
- Q-8: how to show layers in the UI (spec.md:1429). It was not specified.
- Q-10: explicit holds
- Q-14: shape plus overrides

**UI decisions and questions**

- UI-1: dashed means stolen
- UI-4
- UI-6 and UI-7: the steal layer is one above the highest; casting the stolen
- UI-8 and C-11
- UI-9: Layers, One transition per marcher, More than one row
- UI-10: Dimming defers to ghosts (H1)
- U-Q3: layers shown only in the inspector and as dashed spans
- U-Q5 TODO: editing anywhere in a timeline

**ui.md backlog (552-570)**

- partial overlaps caused by beat edits
- adding over non-linear moves or over steals (the new direct row becomes a chord)
- moving marchers between timelines (order matters)
- ripple holds by layer

## 6. Constraints any redesign must respect

Sources: docs/conventions/architecture-decisions.md, ADR 0001, spec §6.1.

1. **Schema and file format.**
   - Any new column or table (such as stored ghost origins or a group or "split" entity) changes the persistent schema and the `.dots` file format.
   - It needs an ADR 0001 update, a `pnpm run migrate` migration with the generated SQL inspected, and the `timeline_` prefix.
   - It needs CHECK-based strict typing (C-3), triggers in `triggers.ts`, and a `timeline_change_log` logging trigger.
   - User version 8 handling and the converter (Phase 9) must stay valid.
2. **Undo (spec §6.1).** Rules U-1 to U-4 apply:
   - Triggers only check; they never rewrite.
   - Checks read the resulting state, never compare NEW with OLD.
   - Every invariant is checked from every side.
   - Foreign keys use RESTRICT with child-first deletes (C-1).
   - A new table must join `tablesWithHistory` and the query-key invalidation map.
   - Multi-row edits must be app procedures, ordered so that every intermediate state is valid (R-E1 pattern, D-17).
   - Verify with `test:history` and the e2e fuzzer (QA-UNDO-9).
3. **Core public API (ADR 0001 §4).**
   - The resolver API is spec §10.1 plus amendments such as `spanInfos`.
   - Exporting a nominal-path method, destinations or `arcPoint` is a public-API change, so it needs an ADR amendment.
   - The oracle, the golden vectors and the `ref/` scripts must agree (spec §8 is normative).
   - R-1 means the resolver can't read timelines, so a group or split concept that affects motion must live in transitions or assignments, or as an app-side derivation.
4. **Write path.**
   - One edit is one `transactionWithHistory`.
   - All refusals are decided before the first write.
   - Error codes come from `timelineErrors.ts` and messages from `timelineErrorMessages.ts`.
   - db-functions run in the renderer through the Drizzle SQL proxy over IPC (`src/global/database/db.ts`). A new IPC channel needs an ADR.
5. **Spec invariants still bind.**
   - I-A1: the steal row must sit in its own transition, so a steal past the end has to be a new transition.
   - I-A3 and the layer range [-1000, 1000].
   - D-5 (destinations are absolute) and §8.11 (minor arcs keep derived positions bounded).
   - Making a joiner's lead-in relative to the group's path would contradict D-5 and needs a spec amendment.
6. **C-11 and C-12 are owner decisions recorded in ADR 0001.** "Transitions span the timeline" and "one timeline per range" can change only through the owner and the ADR.
