<!-- cspell:disable -->

# 08: Storage for the exit/enter model

Status: decision proposal, not yet agreed with the owner. Read-only research on `timeline/ownership-transfer-design` (a23c766e). The scope is storage only. Link semantics, authoring UX and ghost rendering are in 05, 06 and 07. Where this doc assumes something about them, it says so.

## 0. Summary

- **Recommendation: O, override storage.** Keep `timeline_assignments` and `layer` unchanged, and add two tables: `timeline_slot_origins` (ghost starts) and `timeline_links` (live destinations). Group rows always stay **whole**. An exit is a mover row one layer up. A return or an enter is a mover whose destination is a link onto the host's planned path. The host row underneath carries on **on its path** from the link beat.
  - This was the lead's first recommendation (README "Lead recommendation" 1). It wasn't one of the three options I was asked to compare, so I compare it against them below.
- **The lead's "open consequence" needs a correction.** Implicit resume is only bad when it is **unlinked**: today's resume snaps back by rebasing (D-12). When the return move's destination is linked to the host path at beat r, the resume from r is exactly on the host's path for `direct` (proof in §2.3). `arc` and FTL get the same result from one new resolver rule.
  - So layers still mean one clear thing, "this row is the host underneath". What stops being produced by default is the unlinked resume.
- **Why O beats trims (L, H, S):**
  - Every app-authored row keeps spanning its transition, so exits and enters create **no seam** with the host.
  - It needs no change to `timeline_assignments`, no table rebuild, and no I-A4/I-A5 relaxation (trims need one for exit + return into the same host).
  - Legacy data needs no migration.
  - Deleting a detour gives the group move back instead of leaving a hold gap.
  - `isPageMove` (ripple page delete) keeps working.
- **What is orthogonal to the storage choice.** Ghost starts, links and the resolver's linked-span rule cost the same in every option. That matches B's own verdict (04 §9).
- **Cost** (storage, resolver and write path; ghost rendering and strip UX excluded):

  | Option                | Developer-weeks |
  | --------------------- | --------------- |
  | O                     | 3–4             |
  | L                     | 4–5             |
  | H                     | 5–6             |
  | S                     | 6–8             |
  | S2 (breakpoint track) | 7–9             |

- **Ship order.** A first step needs no schema change. A purely additive migration then follows. Since no public release reads user version 8 (§6), the file format is still free to change.

## 1. Facts this rests on

- **Current tables** (schema.ts:551-592):
  - `timeline_assignments` holds `layer` in [-1000, 1000], `UNIQUE(transition_id, slot_index)` (I-A4) and `UNIQUE(transition_id, marcher_id)` (I-A5), spec.md:199-200 and 424-425.
  - I-A3 only forbids overlap **at the same layer** (triggers.ts:187-199, spec.md:423).
- **Triggers only check; nothing rewrites** (U-1..U-4, spec.md:476-479; D-17, spec.md:128).
  - The commit-time view `timeline_commit_violations` holds E-T6 and C-11's E-T1 (triggers.ts:123-139).
  - Change-log triggers are generated from a table list (triggers.ts:311-364).
  - History tables are listed in `tablesWithHistory` (historyTriggers.ts:15-36).
  - The query-key map returns `[]` for timeline tables (hooks/queries/utils.ts:47-52).
- **Strict typing.** Drizzle can't emit `STRICT`, so `typeof` CHECKs stand in (ADR 0001 §2, C-3). The DDL below says "STRICT" in the spec's sense and is written with those CHECKs.
- **Where layered rows come from today.** UI-9's add path refuses partial overlaps and "inside" windows (timelineMembership.ts:236-245). It puts new rows one layer above anything overlapping (`stealLayer`, timelineCommands.ts:251-279). Layered rows exist **only** in files authored with the dev flag. The converter writes one N-slot transition per page, with rows at layer 0 that cover it (convertPagesInTransaction.ts:239-247).
- **Ripple (timelineRipple.ts:38-41).** A start edge follows its beat, and an end edge stays at the end of the beat before it. So inserting k beats at a non-page beat p where one row ends and the next starts opens a k-beat **hold** between them. Page deletes remove only `isPageMove` transitions, whose rows are all at layer 0 **and cover the transition** (timelineRipple.ts:284-302). A trimmed host stops being a page move, so its page delete is refused.
- **Phase 9 and file versions.**
  - P9.3 and P9.10 (the converter) are done. P9.4, which removes the flag, is blocked (phases/09-flip.md).
  - `NEW_FILE_USER_VERSION` is still 7 (fileVersion.ts:25), and `MAX_SUPPORTED_USER_VERSION = 8` (fileVersion.ts:23).
  - The version guard 84ea6191 (P3.9) is in no release tag; v0.1.7 predates it. So **no released build opens version-8 files**.
  - Drizzle migrations run on 7 and 8 without changing the version (DrizzleMigrationService.ts:73-85).
- **Resolver inputs** are `TimelineSnapshot {marchers, shapes, transitions, assignments}` (core types.ts:204-209; ADR 0001 §4). R-1 forbids reading timelines (spec.md:511-513). A destination is reached at `T.end_beat` (D-7, R-5, spec.md:566-578).

## 2. Additions common to every option

Every option needs these. Only the storage around them differs.

### 2.1 Ghost starts

```sql
CREATE TABLE timeline_slot_origins (
  id            INTEGER PRIMARY KEY,                       -- C-2: undo restores the rowid
  transition_id INTEGER NOT NULL CHECK (typeof(transition_id) = 'integer')
                REFERENCES timeline_transitions(id) ON DELETE RESTRICT,   -- C-1: child-first deletes
  slot_index    INTEGER NOT NULL CHECK (typeof(slot_index) = 'integer' AND slot_index >= 0),
  x REAL NOT NULL CHECK (typeof(x) IN ('integer','real') AND abs(x) <= 1e6),
  y REAL NOT NULL CHECK (typeof(y) IN ('integer','real') AND abs(y) <= 1e6),
  UNIQUE (transition_id, slot_index)
);
```

- **Meaning.** This is the slot's planned origin, used **only when the slot has no founding span**. A founded slot uses its founder's actual origin (R-4), so a leftover row is harmless.
- **No invariant** ties these rows to founding. I chose that on purpose. B's S-3 ("a founded slot has none") would make deleting a mover fail, or force extra statements in every edit. Procedures tidy stale rows instead.
- **Row triggers** (`timeline_so_ins` / `timeline_so_upd`): the transition exists and `slot_index < slot_count`. This is the I-T6 pattern.
- **Transition-side trigger:** extend `tr_slots_upd` so `slot_count` can't shrink below an origin row (U-3).
- **"Follow the group"** is not stored as a relation. Gestures that move founders' starts also UPDATE these rows in the same edit, as explicit statements. That keeps D-5 (absolute storage) and is undo-safe (D-17).

### 2.2 Live links

```sql
CREATE TABLE timeline_links (
  id                 INTEGER PRIMARY KEY,
  transition_id      INTEGER NOT NULL CHECK (typeof(transition_id) = 'integer')        -- the feeder
                     REFERENCES timeline_transitions(id) ON DELETE RESTRICT,
  slot_index         INTEGER NOT NULL CHECK (typeof(slot_index) = 'integer' AND slot_index >= 0),
  host_transition_id INTEGER NOT NULL CHECK (typeof(host_transition_id) = 'integer')
                     REFERENCES timeline_transitions(id) ON DELETE RESTRICT,
  host_slot_index    INTEGER NOT NULL CHECK (typeof(host_slot_index) = 'integer' AND host_slot_index >= 0),
  CHECK (host_transition_id <> transition_id),
  UNIQUE (transition_id, slot_index)
);
CREATE INDEX timeline_idx_link_host ON timeline_links (host_transition_id, host_slot_index);
```

**Column on `slot_destinations`, or a separate table? A separate table.**

- A `source`/`linked` column (B §2) has three problems:
  - It keeps a stale x/y in the row as a "cache", which is a second source of truth (D-2).
  - It has nowhere clean to put the host reference.
  - Through `slot_destinations`' logging under the transition id (triggers.ts:356-362), every link edit would look like a destination edit.
- A link is a **third destination source** (D-16 has shape and points). Rule: each slot of a shapeless transition has **exactly one** destination row or link row.
  - The I-T6 completeness check in `timeline_commit_violations` counts both kinds of row.
  - `sd_ins` refuses a destination row where a link exists, and the link triggers refuse the reverse.
  - Unlink is one edit: DELETE the link, then INSERT a destination row at the resolved point. Its undo reverses validly, because completeness is only checked at commit.

**Where is the beat? It isn't stored.**

- The enter beat is `j = feeder.end_beat`. A destination is reached at T.end (D-7), so "the feeder's destination is the host at j" can only mean j = F.end.
- Storing j would add one more beat that has to stay glued to F.end. Deriving it removes that seam outright.
- Row checks (`timeline_link_ins` / `timeline_link_upd`, U-2: they read only the resulting state):
  - The feeder exists, has no shape, and `slot_index < slot_count`.
  - The host exists, `host_slot_index < host.slot_count`, and the host is not `follow_the_leader` (E-L1, v1; see Q-5).
  - `host.start_beat < F.end_beat < host.end_beat` (E-L2).
- Other sides (U-3):
  - `tr_range_check` gains: no link may be left with `F.end` outside `(H.start, H.end)`, whether the edited transition is the feeder or the host.
  - `tr_slots_*` gains: `slot_count` can't shrink below a link slot on either side.
  - `tr_shape_set` gains: a feeder that has a link can't get a shape.
  - `tr_dest_upd` gains: no `path_style → follow_the_leader` on a host.

**Acyclicity comes free of the check above.**

- A link's target is the host's planned point at F.end. That point depends only on:
  - stored host data;
  - the host's founding origin at H.start, which is earlier than F.end;
  - the host's own destination, which may itself be linked at H.end, which is later than F.end.
- So link chains point strictly forward in time, and §9.3's timestamp argument extends with a node at `(F.end, -1)`.
- 05 owns the full proof and what happens on host shrink or delete. The FKs are RESTRICT, so a host delete must first delete or convert its incoming links (C-1).

**Same marcher?** A slot-to-slot link with different marchers at the two ends is still well defined (D-4), so I'd emit a diagnostic rather than refuse. Owner question Q-4.

### 2.3 The resolver rule all options need

- Define `intent(T,i,b) = style(o_i, dest_i, (b - T.start)/(T.end - T.start))`, where `o_i` is the founding origin, or the `slot_origins` row when the slot isn't founded.
- A **linked span** is a join or resume span `s` in `(T,i)` whose predecessor span is in feeder F, where F's slot is linked to `(T,i)` and `s.start = F.end`. A linked span evaluates `intent(T,i,b)`. Every other non-founding span keeps the D-12 rebase.
- **Continuity is exact by construction.** `origin(s) = eval(pred, F.end) = dest_F = intent(T,i,F.end)`.
- **For `direct`, the rule changes nothing.** Rebasing from a point on the line gives the same line at the same speed:
  `lerp(P_j, D, (b-j)/(e-j)) = lerp(O, D, (b-s)/(e-s))`.
  It changes `arc` (a sub-arc with the same bulge is a different arc), and it lets a linked return into an FTL host stay on its trail (a later R-11 amendment).
- **New resolver work:**
  - R-1 reads two more tables.
  - R-13 gains the link source.
  - A new cascading cache node, `linkedDest[F, slot]`.
  - A new walk rule W-5: any change to a host's destinations, origin rows, range, style or parameters, or to its founding origins, dirties every incoming link's feeder spans.

## 3. The options

### O: override storage (recommended)

- **Schema:** §2 only. `timeline_assignments` is untouched.
- **Encoding** (green [0,16) at L0):

  | Case               | Rows                                                                                                                                                                      |
  | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Steal-out          | Yellow [8,24) at L1, unlinked. No change to green.                                                                                                                        |
  | Exit + auto return | Yellow [8,12) at L1, then pink [12,14) at L1 with a link to (green, slot). Green resumes at 14 as a linked span.                                                          |
  | Overrun            | Yellow [8,24) at L1, linked to (blue, slot). Blue's row [16,32) is overridden at its start, so it is a join (QA-FL-03), with a ghost origin. It is a linked span from 24. |
  | Join               | Feeder Y [1,7) at L1 over green [1,17) at L0. Y is linked, and green's slot has a ghost origin.                                                                           |

- **Invariants:** unchanged (I-A1..I-A6), plus E-L1, E-L2 and the I-T6 completeness extension from §2. Every one is a row trigger except I-T6 completeness, which stays commit-time. No new commit-time row is needed: the host row is whole, so there is no seam to check.
- **The seam: none against the host.**
  - Every app-authored row still spans its transition (UI-9's rule stays). R-E1 anchoring and ripple move host rows with their transitions.
  - Inserting beats at an exit beat grows the host row (it strictly contains the beat) and shifts the mover. The marcher stays with the group k beats longer and leaves at the shifted beat, which is sensible.
  - **One residual seam is between consecutive movers at the same layer** (yellow's end equals pink's start). If it opens, the host shows through as an unlinked resume (continuous; it moves toward the host's destination). If it closes, E-A3 refuses.
  - Mitigation: one ripple rule that maps "a row end equal to the same marcher's next row start at the same layer" as a single handoff edge.
- **The hidden-integer cost:**
  - Adding a host **under** an existing mover (a join authored with Y first; ui.md backlog) needs a layer above the rows that contain it and below the ones inside it.
  - When no integer is free, the procedure renumbers the inside rows upward, top-down, with explicit UPDATEs. That is undo-safe, but it is new code.
  - `stealLayer`'s "one above highest" stays for movers.
- **Legacy data:** layered steals are already valid O data (unlinked overrides), so they resolve bit-identically.
- **Exit and hold** (opt-in) is the only trim: the host row's end moves to the exit beat, with nothing to glue on the other side.

### L: trims at one layer, with links and ghosts (A's model)

- **Schema:** §2 plus a rebuild of `timeline_assignments` that **drops I-A4 and I-A5**.
  - Exit + return needs a second row of the same marcher in the same host slot, for example green [0,8) and [14,16).
  - Replace them with triggers:
    - `asn_slot_owner_*`: every row of a (transition, slot) belongs to one marcher (E-A4′);
    - `asn_marcher_slot_*`: every row of a (transition, marcher) uses one slot (E-A5′).
  - SQLite can't drop a UNIQUE without a rebuild. Drizzle generates one; inspect it, and its history triggers are recreated (ADR §2, C-5 note).
  - R-9 step 5 has to count distinct marchers instead of rows (spec.md:627-628).
- **Layers stay legal** for legacy data and opt-in detours, so every procedure handles both trims and overrides.
- **Seams:** exit (host end = mover start) and enter (feeder end = host row start).
  - The link makes the enter seam _checkable_: a commit-time row `E-L3` where the host slot's row doesn't start at F.end. It doesn't remove it.
  - The exit seam stays implicit. A gap is a silent hold.
  - Ripple's asymmetric edge rule (timelineRipple.ts:38-41) opens exactly these gaps. `isPageMove` fails for trimmed hosts (timelineRipple.ts:296-301), so page deletes start refusing.
  - Every range procedure needs A's seam anchoring (A §6, §8.1).
- **Deleting a mover** leaves a hold gap inside the host, followed by a join that rebases. That's worse than today.

### H: hybrid, fixing layer = 0 (a staged path to S)

- **Schema:** L's rebuild, plus `CHECK (layer = 0)` in the same rebuild. The `asn_overlap_*` triggers lose `a.layer = NEW.layer`, so no marcher may have two overlapping rows at all (I-A3′).
- **Migration:** a post-migration normalization step on open flattens legacy layered rows through R-2. This is main-process work in one transaction, like convert-on-open, with history cleared.
  - Each resume span becomes its own row in the same (T, slot).
  - Resolution stays bit-identical: a resume becomes a join with the same R-5 formula. The one caveat is FTL targets, which need the R-9 dedupe.
- **The resolver keeps R-2.** On non-overlapping rows it is the identity, so the core and the golden vectors survive and only links are new.
- **Seams, gap-on-delete and `isPageMove`** behave exactly as in L.
- **Gain over L:** a single code path (no layers). The step to S is cosmetic: drop the column, stop flattening.

### S: per-marcher segments (B)

- **Schema:** B §2, renamed `timeline_segments`, with the same relaxed-uniqueness and no-overlap triggers as H. Its `entry` column is **dropped**: founding, linked and rebase are all derivable (§2.3).
  - `timeline_assignments` is dropped.
  - The change-log logical name becomes `segments`, which is a core API change.
- **Seams, migration and FTL:** as in H.
- **Extra cost:** rewriting R-2/R-3, `ref/`, the golden vectors, the ~71 desktop timeline files that mention layers, and QA-FL.

### S2: breakpoint track

This is the only representation that **removes** seams outright.

- **Schema:** `timeline_track_breaks(id, marcher_id, beat, transition_id NULL, slot_index NULL, UNIQUE(marcher_id, beat))`. A segment ends where the marcher's next break starts. A NULL transition is an explicit hold.
- **Every handoff is one stored beat,** so nothing can come unglued, and an exit is a single INSERT.
- **Costs:**
  - Holds become rows.
  - Every I-A1 check needs a correlated "next break" subquery, from four sides.
  - Ripple's end rule is gone; transitions keep their own edges (C-11) that breaks must respect.
  - It is a full B-scale rewrite.
- Rejected on cost. It isn't needed, because O has no host seams.

## 4. Undo, history and tests (per option)

- **All options:**
  - Add both new tables to `tablesWithHistory` and the query-key map (returning `[]`).
  - Add change-log triggers with logical names `slot_origins` and `links`. Log each row under its transition id, the feeder's for links, as `slot_destinations` does, so W-3 and W-5 seed per transition.
  - Child-first deletes:
    - deleting a transition first deletes its origin rows;
    - it deletes links where it is the feeder;
    - it deletes or converts links where it is the host.
  - `test:history` round trips:
    - link create and unlink;
    - ghost drag;
    - group-start drag that moves the ghosts;
    - deleting a host that has incoming links;
    - exit + return as one edit.
  - E2E fuzzer (timelineE2eFuzz.test.ts:250-252 lists the compared tables): add the two tables and ops for link, unlink, origin set and origin delete, and give its oracle links. Add property P-1 (continuity) across linked spans, and "a linked span equals intent" as a new QA-P.
- **O:** no new kind of multi-row ordering, apart from layer renumbering (ordered top-down so no intermediate state has a same-layer overlap).
- **L, H and S:** every range procedure (R-E1, clip move, flag move, ripple, beat insert and delete) needs seam-partner ordering ("shrink before grow" across two timelines). The fuzzer needs an invariant that no edit opens a handoff unless it says so. H and S also need the normalization step to be tested as a non-history write that ends in a `reset` (ADR §5).

## 5. Resolver, `ref/` and golden vectors

|                        | O                                                                                 | L                               | H                                | S                               |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------- | -------------------------------- | ------------------------------- |
| R-2 flattening         | unchanged                                                                         | unchanged                       | unchanged (identity on new data) | replaced                        |
| New inputs (R-1)       | origins, links                                                                    | same                            | same                             | same + segments                 |
| R-9 dedupe by marcher  | no                                                                                | yes                             | yes                              | yes                             |
| Existing golden G1–G12 | unchanged                                                                         | unchanged                       | unchanged                        | rewritten as migration equality |
| New golden             | linked return (direct, arc), overrun into blue, join with ghost, unlink fallback  | same + return-in-same-host rows | same as L                        | same as L                       |
| `ref/`                 | resolver, oracle, schema.sql, history.py (18 → 24 triggers), db_tests, fuzz/props | same                            | same + normalization             | everything                      |

The core API change, `TimelineSnapshot` gaining `slotOrigins` and `links` and `ChangeBatch` gaining two logical names, is the same in every option.

## 6. File format, migration and the converter

- **Version.** No released build reads version 8 (§1), so the format can still change under 8 if this lands before P9.4. Version-8 files from older dev builds then open, migrate and resolve correctly: O is purely additive, and H/S normalize on open.
  - An **older dev build** that opens a migrated file drops and recreates only its own triggers, so the new tables lose their history and change-log triggers until a newer build reopens it.
  - That is acceptable for dev builds. If any build that accepts 8 ships before this work, bump to 9 instead: change the `fileVersion.ts` constants and tests, about half a day.
- **Migration:** O and L add migration 0018 (two tables). H and S rebuild `timeline_assignments` (or replace it) and need the normalization step.
- **Converter (P9.10):** unchanged in O, L and H. It already writes covering layer-0 rows. S writes segments instead.

## 7. Cost (developer-weeks, one developer) and the riskiest parts

|     | Schema, triggers, history    | Resolver, oracle, `ref/`, golden | Write path             | Spec + ADR | Fuzz, history tests | Total   |
| --- | ---------------------------- | -------------------------------- | ---------------------- | ---------- | ------------------- | ------- |
| O   | 0.5                          | 1.25                             | 1–1.5                  | 0.5        | 0.5                 | **3–4** |
| L   | 1                            | 1.5                              | 1.5–2 (seam anchoring) | 0.5        | 0.5–1               | **4–5** |
| H   | 1.5 (rebuild, normalization) | 1.5                              | 1.5–2                  | 0.75       | 1                   | **5–6** |
| S   | 1.5                          | 2.5                              | 2–2.5                  | 1.5        | 1                   | **6–8** |
| S2  | 2                            | 2.5                              | 2.5–3                  | 1.5        | 1                   | **7–9** |

**Riskiest parts:**

1. **W-5 invalidation.** It is the first dependency between transitions that isn't carried by a marcher's own spans. A missed dirtying shows as a stale feeder, and only the fuzzer-vs-oracle comparison catches it. Applies to all options.
2. **Seam maintenance** across ripple, R-E1, clip and flag moves (L, H, S only). A missed path opens a silent hold.
3. **Layer renumbering** for hosts added under movers (O only).
4. **Normalization equality,** including FTL targets (H, S).
5. **The drizzle table rebuild** of `timeline_assignments`: constraint names, history trigger recreation, and C-2 rowids (L, H, S).

## 8. Recommendation and staged work packages (O)

**WP-0: no schema change; can ship first.**

- Replace UI-9's partial-overlap refusal (timelineMembership.ts:236-240) with "mover above the host" whenever the window starts inside a host and nothing stored follows it.
- Allow drags on stolen members' host destinations, using app-side throwaway resolvers for ghost remainder positions (01 §2).
- Until WP-3, overrun into a stored next move and "exit + return" keep today's behavior (catch-up and resume).

**WP-1: spec amendment and ADR draft.** Covers §2.3, I-L1..I-L4, D-5/D-12/D-16, and §9.2–9.4 W-5. Owner sign-off happens here (architecture-decisions.md).

**WP-2: core, behind the existing schema.**

- Optional snapshot fields, the resolver, the oracle, `ref/` and the new golden vectors.
- Empty arrays mean today's behavior, so this lands with no visible change.

**WP-3: migration 0018.**

- Tables, triggers, the view extension, change-log and history triggers, the query map, readTimelineTables and the snapshot.
- QA-DB and QA-UNDO tests.

**WP-4: write procedures.**

- Link, unlink, ghost set and ghost reset.
- Ghosts that follow the group start.
- Child-first deletes that handle links.
- Range edits that keep E-L2 valid. 05 decides between refusing and re-targeting.

**WP-5: authoring defaults** (with 06):

- exit + auto return;
- overrun = exit + enter;
- join (layer-between insertion);
- opt-in exit-and-hold (a trim).

**WP-6:** fuzzer and `test:history` extension, plus the P-1 property across links.

**Later (optional, Phase 10 or never): H as cleanup.** Do it only if real data shows layers are only ever "host below mover" and the owner wants explicit ownership.

**ADR 0001 amendments:**

- §2: two new tables; I-T6 completeness extended; E-L codes.
- §3: RESTRICT and child-first deletes for both link FKs and for origins; surrogate ids; `tablesWithHistory`.
- §4: `TimelineSnapshot.slotOrigins` and `.links`; `ChangeBatch` names; any intent or ghost query that 07 needs, such as `intentAt(T, slot, b)`.
- §5: the logged-table list.
- §6: the version decision.
- C-12 bullet "Partial overlaps are refused": replaced.

**Spec changes:**

- R-1: new inputs.
- R-3: the "linked" qualifier on join and resume.
- R-5: on-rails for linked spans; D-12 rebase only for unlinked spans.
- R-8 and R-11: linked arc, and later FTL.
- R-13: the third source.
- A new §8 definition of `intent`.
- I-T6, and new I-L1..I-L4.
- §9.2 (`linkedDest`), §9.3 (edges and timestamps), §9.4 (W-5).
- §12: QA-DB, QA-UNDO and golden vectors.
- D-5: "nothing is relative to upstream geometry **except an explicit link to a host's planned path**".
- D-6 rationale: a layer means "overrides the host beneath it"; the app no longer produces unlinked resumes by default.
- D-16: the third source.
- ui.md: UI-7 (layer-between) and UI-9.

## 9. Open questions for the owner

1. **Do layers stay?** Do you accept keeping them as hidden "group underneath" storage, against the synthesis that they should go? Nothing in the UI would show layer numbers.
2. **Deleting a return move:** should the marcher snap back into the group (today's resume, the O default), or should the edit turn into exit-and-hold?
3. **File version:** land before P9.4 and keep user version 8, or bump to 9?
4. **A link whose two ends hold different marchers:** a warning or a refusal?
5. **FTL hosts:** refuse links into them in v1? A linked return onto a follow-the-leader trail would come later.
6. **Exit-and-hold:** stored as a trim of the group row, or as a separate holding move?

## Critical files for implementation

- `apps/desktop/electron/database/migrations/schema.ts`
- `apps/desktop/electron/database/migrations/triggers.ts`
- `packages/core/src/timeline/resolver.ts` (and `types.ts`)
- `apps/desktop/src/db-functions/timelineMembership.ts` (with `timelineCommands.ts` `stealLayer`, `timelineRipple.ts`)
- `docs/timeline/spec.md` (§5, §6, §8, §9) and `docs/adr/0001-timeline-motion-model.md`
