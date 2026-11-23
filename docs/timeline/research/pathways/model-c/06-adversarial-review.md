<!-- cspell:disable -->

# 06: Adversarial review of model C (lanes on slots)

2026-11-05. Reviewer: independent, not anchored on 04 (I did not read `04-evaluation.md`; note that
`05-model-c-for-review.md` itself opens with the 04 header and carries §1.2/§2.6/§5–§8 of it, which I
treated as the proposal).
Inputs: `BRIEF.md`, `01-current-model.md`, `02-scenarios.md`, `05-model-c-for-review.md`.
Repo read-only at `/mnt/data/worktrees/t3/OpenMarch/t3-fc7b6ac6` (`46cd0cbf6`, pathways/host-656),
plus fork `timeline/main` (`4016c68a5`) where it matters for migration. `core/` =
`packages/core/src/timeline/`, `db/` = `apps/desktop/src/db-functions/`, spec = `docs/timeline/spec.md`.

**Verdict.** I found **no BLOCKER**. The core choice (a lane row keyed by `(transition, slot)`,
pointing at a route, with destinations untouched) holds up. But the claim "passes all 48 scenarios"
does not. **Eleven MAJOR** findings need rule changes. They cluster in four places:

1. Facts about one **occupancy** are stored per **slot**, which breaks once K3 lets one slot have
   several occupants.
2. **Jumps** (P-1) can still happen at handoff and Adjust boundaries.
3. **Split at the playhead** is not specified for joins, resumes or takeovers.
4. **Frozen `o_e`** fails S-22.

The "bit-identical to today" claim holds for founding spans only.

---

## A. Findings, most severe first

### MAJOR-1: Per-person edits on a multi-occupant lane leak to the other occupants (R-other)

- **Scenario.** S-20 setup after K3 (M7): slot 7 of T holds m7 over `[0,6)` and m3 over `[10,16)`.
  The designer selects **m7** and draws "one marcher's path" (AP-R1′: "insert or update the lane on
  the marcher's **current** slot").
  1. The lane `(T,7)` becomes an own lane.
  2. m3, which rides lane 7 from 10, now walks m7's own path (via K2 entry onto it).
  3. The same thing happens with Detach (AP-R9′ re-points the lane, so m7's `[0,6)` also stops
     following the group) and with Remove path.
- **Why it breaks.** R-other ("an edit to one member never moves another member, unless the edit is
  to the shared path itself", 02 standing rules; spec R-14 group schedule item 9, spec:978–980). The
  model's §5.2 admits that a person-keyed _Adjust_ can't be expressed (Q1). It doesn't notice that
  **own path and Detach**, the two edits the owner calls personal, are also slot-keyed. So with
  swaps, "Detach this marcher" has no exact meaning.
- **The S-27 #3 workaround is fragile.** The doc's "Adjust F2 before 8 = the lane's Adjust keyed to
  places before x(8)" ties a place to a count boundary. Assignment boundaries are beats (I-N1);
  Adjust keys are places (§5.3). After a pin move or resize, `x(8)` moves, but the stored keys don't.
  The adjustment can then reach into the next occupant's part of the lane.
- **Fix (rule).**
  - AP-R1′, AP-R9′, AP-R2′ and lane-drag Adjust **refuse** when the lane has more than one occupant
    over the move. Name the other marcher: "lane 7 is also walked by m3 from count 10".
  - Or offer "Detach for this marcher's counts only". That needs occupancy-keyed overrides (see
    MAJOR-2), which is a model change. Put this in front of the owner together with Q1.

### MAJOR-2: Lane `timing` (window, join mode, entry) is per-occupancy data stored per slot

- **Scenario 1.** A ripple window `[0,10]` (offsets) is on lane k (S-32, D-rank ends at 10). Later a
  swap (K3) puts a joiner on lane k at count 12 with the lane's `join='whole'`.
  - The resolver sets `ws = s.start = 12` with `we = 10`.
  - `β(b) = T.start + (b − ws)·c/(we − ws)` then has a **negative** (or, at `ws = we`, zero)
    denominator. The member walks backwards or gets NaN.
  - I-W1 (`ws < we`) is only an app write-path check on **stored** windows. The derived
    `ws = s.start` is never checked.
- **Scenario 2.**
  - In S-18, Y-member y1's row is `[8,16)` with `join='whole'`. A takeover (R-dot dot drag, S-48)
    covers y1 over `[8,10)`. The row's first visible span is now `[10,16)`. By R-3 that is a **join**
    (spec:663–668), so `ws = 10`: y1 walks the whole path in 6 counts and leaves Y's formation.
  - The same takeover over `[9,10)` makes `[8,9)` the join and `[10,16)` a **resume**. Every resume
    uses `cut_in` (§5.5), which aims at the _founding_ evaluation, so y1 now jumps across to X's
    place on the path.
  - So the same authored intent gives two different motions, decided by a one-count difference in
    an unrelated edit. Neither one is "y1 rejoins Y" (S-21 #3).
- **Why.** §5.5 says it plainly: "one join mode per lane … if two occupants join the same lane at
  different times, they share it". But the window has meaning only relative to an occupancy (its
  start), and K3 makes occupancies per range.
- **Fix.**
  - Store `ws` explicitly whenever `whole` is chosen; don't derive it from `s.start`, which depends
    on layering. A resume of a `whole` occupancy must aim at the **windowed** schedule, not the
    founding one.
  - Clamp, or refuse at commit, any `ws ≥ we`. The resolver needs a total rule:
    `we ≤ ws` ⇒ treat it as `[ws, T.end]`.
  - Cleaner (a model change): key lane timing by **assignment row**
    (`timeline_occupancy_timing(assignment_id → window, join, entry)`). The lane keeps route, offset
    and Adjust. This also gives MAJOR-1 a place to hang personal facts.

### MAJOR-3: Handoff can jump at the last kept point; I-J4 is off by one boundary and can't be checked at commit

- **Scenario.** A handoff with `from = to = W_m`. I-J4 allows `from = to` "at or after the last
  [kept point]".
  - Approaching `x = D_m` from below, `w = 0`, so the member is at `W_m + o_s + δ`.
  - At `x = D_m`, `w = 1` (taking "a step at `x_h0`"), so the member is at `W_m + o_e + δ`.
  - That is a jump of `o_e − o_s` (P-1).
  - The last leg then starts at `P(D_m)` evaluated with `o_e`. Whichever side owns the boundary,
    one of the two evaluations jumps.
- **Also.**
  - `w(x) = clamp01((x − x_h0)/(x_h1 − x_h0))` is literally `0/0` at `x = x_h0 = x_h1`. The doc says
    "a step" but gives no formula.
  - Near-equal anchors inside the rigid part (difference 10⁻¹²) are allowed and give an unbounded
    speed spike.
  - The anchors can **become** equal after a route edit. Anchors on two points that are later dragged
    within `ε_geom` get cleaned into one represented point. I-J4 is checked only when the handoff is
    written.
  - I-J4 is listed as "commit view and app write path". A commit view cannot compute `D^W`: cubic
    lengths are a 64-sample sum (spec R-14 Length, spec:880–895), not SQL.
- **Fix.**
  - Define `w = [x ≥ x_h0]` when `x_h0 = x_h1`.
  - Allow instant handoffs only at `x ≤ D_1` or **strictly** `> D_m`.
  - In the resolver, treat `0 < x_h1 − x_h0 < ε` inside `[D_1, D_m]` as a minimum-length ramp (for
    example ε_geom·k), or raise a diagnostic.
  - Take I-J4 out of the commit-view column.

### MAJOR-4: Adjust profiles jump when two keys share an x

- **Scenario.** C2 has keys `(G1,G2,1.0,d=0)` and `(G2,G3,0.0,d=1.5)`. Both are at `D(G2)`. This can
  be written by accident, or result after a re-home, or after G1/G2 merge in cleaning.
- **The claim** "linear in x between consecutive keys … so it is always continuous" (§2.6 item 3)
  fails for equal x. C2 teleports 1.5 steps when the clock passes `D(G2)`.
- **Fix.** Order keys by (route order, f). Where consecutive keys tie in x, the resolver uses the
  **later** key from that x on and raises `D-ADJUST-STEP`. The writer refuses ties. Re-home must
  merge keys that would tie.

### MAJOR-5: The split-at-playhead (AP-R7′) contract dropped today's refusals and is unspecified for non-founding spans

- **Today.** AP-R7 refuses "taken over at the start" and "taken over earlier in this move", because a
  resume would become a founding span after the cut and change motion (spec:1987, AP-R7 row).
- **AP-R7′** lists only "lanes on FTL, and a split through mixed windows" (§5.8 AP-R6).
- **Scenarios.**
  - (a) Cut at b while a lane occupant is in a K2 entry. In T2 the occupant is **founding** at b, so
    it walks a first leg from its position onto `W2_1 + o`, not the K2 first-fit line. Motion
    changes.
  - (b) An occupant hidden at b by a higher layer becomes a join in T2.
    - Its K2 reference becomes `F2 + o_s` with `F2 = C`. Originally it was its own founding origin.
    - K2's horizon ("next pin, else `T.end`", draft-model §3.3 step 3) becomes `T1.end = b` for a
      resume piece left in T1.
    - First-fit can then aim at b's point instead of continuing.
  - (c) The first half renumbers slots per row (`writeFirstHalfTransition`, `db/timelineSplitAtBeat.ts:565–598`).
    With K3, two occupants of one slot become two slots in T1, each needing a lane copy, and the
    "cohort per distinct lane window" rule can't see derived `whole` windows (MAJOR-2).
- **Side note.** The doc says the cut is "exact … when o and δ are constant across the cut piece".
  With a fresh corner at C as T1's last and T2's first kept point, both legs at the cut are zero
  long, so any o or δ is exact on corner routes. Only the cubic split needs the de Casteljau caveat.
  The stated condition is wrong, though harmless.
- **Fix.**
  - Keep today's two refusals for lane occupants until K2 has a split rule.
  - Add a refusal for "in an entry at b".
  - Materialise every `whole` window before forming cohorts.

### MAJOR-6: Frozen `o_e` fails S-22 #1 and #3; it should be derived

- **What's stored.** `o_e = B_draw − G` is frozen per lane (§5.4).
- **S-22 #1** (end recipe 4 → 3 step: "the block on the path is 3-step; all lanes change"): under C
  the lanes stay 4-step and only the last legs change.
- **S-22 #3** (swap A1/D4 end spots by destination edit: "their lanes swap; first legs cross"):
  under C the lanes don't swap, and the last legs cross instead.
- **Why derive it.** A live `o_e = B − G` reads only the lane's **own** destination, which is already
  an input (R-14 item 9), and the stored G. So it introduces no centroid and keeps R-other: dragging
  C3's end moves only C3's lane (S-22-a).
- **Fix.**
  - Drop the `end_offset_x/y` columns and derive `o_e = dests[T][k] − G`.
  - Keep G frozen (S-42).
  - This also deletes half of I-J4 ("every lane has `o_e`") and the need to backfill `o_e` on Rejoin
    or join.
  - If the owner wants frozen end-side spacing, it's one stored flag on the route, not a per-lane
    pair.

### MAJOR-7: Compaction and vacancy under K3 aren't defined; vacated shaped slots keep zombie lanes

- **Compaction code.** `occupantOf = new Map(remaining.map(r => [r.slot_index, r]))`
  (`db/timelineMembership.ts:553`) keeps one row per slot. `open = new Set(vacated)` (:556) treats
  every slot of a deleted row as free.
- **Scenario.** Under K3, delete m3 (S-20), whose slot-3 row is `[0,6)` while m7 holds slot 3 over
  `[10,16)`.
  - Slot 3 is "vacated", so the top slot's rows move into it and overlap m7's row.
  - The I-A4′ trigger aborts the whole marcher delete.
  - §5.1 says only "must move every row on the top slot". The **definition** of a free slot also has
    to become "no rows at any beat".
- **Zombie lanes.**
  - On a **shaped** transition (never compacted, :547), deleting B3 (S-46, S-13 #4: "its lane goes")
    leaves `(T,3)`'s lane, its node and its timing on a vacant slot.
  - I-R3′ stays satisfied, so a route whose lanes are all vacant lives on with no marcher to select:
    the UI can't reach it.
  - The next cast into that slot silently inherits B3's Adjust.
- **The move-the-lane rule is unclear.** "Moves each lane row with its slot, exactly as it moves the
  destination point" assumes every slot has one. When the top slot has no lane but the vacated slot
  has one, that lane must be **deleted**, and its per-lane node with it (I-J2).
- **Fix.** Explicit rules:
  - A lane whose slot has no rows over the whole move is deleted by the procedure that emptied it,
    with its orphaned nodes. Undo restores both.
  - Compaction moves the lane (or deletes the target's) before lowering `slot_count`.
  - D-VACANT (`core/resolver.ts:856`) becomes per-range.

### MAJOR-8: "Recast and least-travel touch rows only (S-29, S-30)" is wrong for shaped end sets

- **Why.** On a `dest_shape_id` transition, R-13 fixes slot k's spot. The only way to change who ends
  where is to change slot assignment, and the lane follows the slot.
- **S-30.** Least-travel on a shaped arc moves member m onto lane k′ **for the whole move**, including
  `o_s` from the previous occupant's start. First legs cross and the formation on the path is
  permuted. S-30 expects "members' last legs retarget".
- **S-07 #2** on a shaped arc fails the same way.
- **Recipe-made end sets.** These write points (`timeline_shape_recipe_marchers` doc, schema.ts:628–632),
  so a spot reorder edits destinations and the lanes stay. That path is fine.
- **Fix.** Give the reassignment procedure two documented modes:
  - "lanes follow the person": swap the whole lane rows (route, o_s, node, timing) along with the
    assignments. This generalises the doc's S-28 `o_s` swap; swapping only `o_s` leaves the Adjust
    behind.
  - "lanes stay with the spot".
  - Default per owner Q1.

### MAJOR-9: The file version must bump at M0 (and M4, M6, M7); "stays at 10" lets older builds play silently wrong

- **What M0 does.** It rewrites `path_style='route'` to `direct` and moves the path into
  `timeline_lanes` (§5.9 step 2).
- **What an older build does.** Any version-10 build from before M0 (lab, nightly) opens that file,
  doesn't know the lanes table, and plays every path walker **straight**. It doesn't refuse.
- **Why it matters.** Version 10 exists to prevent exactly that: "so a fork build from before routes
  refuses it instead of opening a show it would play wrong", and "Later pathways steps don't bump it
  again" (`electron/database/fileVersion.ts:19–22`, branch).
- **The later steps.** M4 (Adjust), M6 (handoff) and M7 (range-overlapping rows, K2 resumes) each
  change what an older resolver plays.
- **Stale baseline.**
  - Fork main has since collapsed its migrations (`57f471ec2`): `MAX_SUPPORTED_USER_VERSION = 8`,
    9 = parked floor.
  - Fork main's `legacyForkRepair` knows the date of `0031_timeline_routes`
    (`legacyForkRepair.ts:90`, fork main). But its step-5 check compares every table's SQL with
    `0017_timeline_model` (:404–457). A pathways-lab file, whose `timeline_transitions` has
    `route_id` and the I-R2 CHECK, fails that check, so the repair rolls back and the file doesn't
    open.
  - The "fold, so main gets no table rebuild" plan (§5.9) is true only for files that never ran 0031.
- **Fix.**
  - Bump `user_version` whenever stored facts change what an older resolver would play: M0, then
    once more for the rest (or at each step).
  - Rebase §5.9 on fork main's collapsed migrations.
  - Say explicitly that pathways-lab files are dropped, which is consistent with the owner's "fork
    data doesn't matter", or give them a repair.

### MAJOR-10: Out-of-range pins, windows and anchors have no total resolver rule; ~10 procedures must rewrite JSON

- **The burden.** Pins and windows are stored as beat offsets from the move start, and R-pin counts
  from the edge not dragged (02 standing rules). So every start-edge change must rewrite
  `routes.timing` and every `lanes.timing` in the same edit.
- **Who must do it:**
  - `setTimelineRangeInTransaction`, resize, ripple, R-E1 (spec:529);
  - page-flag drags;
  - Basic + page flag;
  - Remove keyframe join (`db/timelineJoinAtBeat.ts`);
  - the holds cuts;
  - merge.
- **Contrast.** Today AP-R4 says range edits leave the route "untouched" (spec I.2).
- **The gaps.**
  - I-W1 (`T.start ≤ ws < we ≤ T.end`) is "app write path" only.
  - Adjust and handoff anchors naming an id that a forgotten procedure removed (AP-R7 cut, paste,
    merge, AP-R8 "again" outside AP-R1′) are covered neither by re-home (§5.3, "inside AP-R1′") nor
    by the resolver ("D … of the kept point that represents it" covers cleaned ids, not missing
    ones).
- **Fix.**
  - Make I-W1 and "pin offset ≤ c" **commit views**. Both are SQL-checkable with `json_each` against
    the lane's transition range.
  - Define resolver totality: an unknown id resolves to its nearest surviving neighbour by stored
    order; else `'from'`/`'to'`. Raise `D-ANCHOR`.
  - Put re-home in one helper that every geometry writer calls.

### MAJOR-11: "Evaluates bit-identically to today when no new facts are set" holds for founding spans only

- **Today.** Route joins and resumes walk straight (`core/geom.ts:706`; spec:817–818, 982).
- **Under C.** "every resume" uses K2 (§5.5) with no new fact set. So after M7, every existing
  route walker that has a dot-drag edit window (S-48, R-dot) or a takeover moves differently.
- **Stage scope.** The bit-identity rule (§2.6) lists "no timing, no window, no adjust, no handoff",
  not "founding". The intended behaviour change is fine (02 R-dot wants it), but the claim and the
  QA-RT vectors must be scoped: identical **until M7**, and identical for founding spans after.
- **Cohort side effect.** The cohort rule creates per-cohort routes on split, so a no-new-facts file
  split under C writes more rows than today. Positions stay identical, but row-level parity tests
  must allow for it.

## B. MINOR

| #   | Finding                                                                                                                                                                                                                                                                        | Fix                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------- | ---------------- |
| m1  | Dropping `UNIQUE(transition_id, slot_index)` drops its **index**. The I-A4′ `BEFORE INSERT` trigger then scans the transition's rows per insert, which is O(n²) on paste or convert.                                                                                           | Replace it with a plain index on `(transition_id, slot_index, start_beat)`. Keep `(transition_id, marcher_id)` indexed too.                  |
| m2  | Swapping the boundary between two consecutive occupants of a slot, or exchanging two occupants, passes through an overlapping state if done by UPDATE.                                                                                                                         | Write as delete-then-insert (the existing `reinsertWithSlots` pattern, `db/timelineAssignmentEdits.ts:74–99`). State it as a procedure rule. |
| m3  | `δ = Σ` over the node chain is commutative in exact arithmetic but not in float64 (`a+b+c ≠ a+(b+c)`). The oracle and the cached resolver must agree.                                                                                                                          | Fix the order: lane node first, then parent. Add a QA-RT vector.                                                                             |
| m4  | §8.11's bound (spec:1019–1050) assumes `                                                                                                                                                                                                                                       | o                                                                                                                                            | ≤ 2√2·10⁶`. With δ of up to 2·10⁶ per node, two nodes, plus `o_e`, positions can exceed the "three times" bound. | Amend §8.11, or bound ` | o + δ_node + δ_parent | ` at write time. |
| m5  | Reset sub-group (§5.6) re-parents child **nodes** but doesn't say that lanes pointing at the sub-group node directly (A1, A3, A4 in S-14) must be set to `adjust_id = NULL`. Otherwise I-J2/FK RESTRICT blocks the node delete.                                                | Add the step, ordered lanes → nodes.                                                                                                         |
| m6  | A shape or slot-count change on a transition with lanes on high slots (re-place a recipe with fewer marchers, change destination shape) hits I-L1 with a raw trigger error. These procedures are not in §8's carry list.                                                       | Add them: delete those lanes and their nodes, or refuse with a reason.                                                                       |
| m7  | AP-R1's `to` rewrite (`mean(B_m − o_m)`, spec:2162) uses start offsets. With a handoff it should use `o_e`, or `to` drifts every time the last point is edited. Every anchor on `'to'` (`D('to') = L^W`) also shifts when G changes.                                           | State the C version of the AP-R1 from/to rule.                                                                                               |
| m8  | Recipes are keyed by **marcher** (`timeline_shape_recipe_marchers`, `UNIQUE(recipe_id, marcher_id)`). Under K3 one marcher can be in two slots of the move's transition. Reopen and re-place must use "the slot the marcher holds at T.end, if any".                           | One sentence in the recipe procedure.                                                                                                        |
| m9  | Adjust keys in the first-leg region (`x < D_1`) or last-leg region have no visible effect except at `D_1`/`D_m`, because legs read only `P(D_1)`/`P(D_m)`. A designer bulge on a leg silently does nothing.                                                                    | Refuse such keys, or define δ on legs.                                                                                                       |
| m10 | Lane-marker drag "Adjust with a point pinned at count 6" (S-48 #2) can't be per-member: pins are route-level and shared. An Adjust is a place, so it slides off count 6 on retime.                                                                                             | Accept (S-48-a is OPEN), but don't count it as a pass.                                                                                       |
| m11 | Default `cut_in` reference for a joiner with no founding row is `F + o_s`. If the slot's founding occupant's real start differs (AP-R5), the joiner's reference first leg is not the lane the founder walked. It matters only when the join target falls inside the first leg. | Note only.                                                                                                                                   |

## C. Claims checked and found TRUE

- **No live centroids.**
  - Every resolver input is the lane's own (`origin(s)`, own destination, own lane row, node chain)
    or route-level stored data (F, G, timing).
  - App-time means remain where they are today: AP-R8, the AP-R1 from/to rewrite (spec:2162), Re-fit.
    They are written values, not reads. R-14 item 9 and §9's acyclicity hold. (`o_e` derived per
    MAJOR-6 also stays own-data.)
- **R-1 unchanged.** Lanes, nodes and routes never name a timeline. I-L5 is a commit view on top of
  C-11 (`migrations/triggers.ts:93–98`).
- **D-16 unchanged.** Destinations still come from a shape or a full set of points (`commit_violations`
  E-T6, `triggers.ts:86–92`). Lanes sit beside them.
- **I-A4/I-A5 → overlap triggers without a table rebuild: TRUE.**
  - On the branch they are standalone `CREATE UNIQUE INDEX` statements
    (`migrations/0017_powerful_edwin_jarvis.sql:25–26`). On fork main they are in
    `0017_timeline_model.sql:71–72`.
  - No `ON CONFLICT` or `INSERT OR REPLACE` in `db/` relies on them (grep).
  - Caveats: m1, and MAJOR-9 for pathways-lab files.
- **The FTL exception is needed.** R-9 step 5 relies on I-A4 (spec:743). `computeEntry` keys targets
  by marcher and indexes `pts[n − m − 1 − k]` (`core/resolver.ts:612–619`).
- **Adjust anchors as (stable id, id, fraction)** survive add-point, drag, resize and pin (S-08
  #1–#4, S-10 #2/#4, S-12 #1–#3), because place → beat goes through the shared clock.
  - Ids are random and never reused in a route (spec §5.2), so copies keep ids without collisions.
  - Re-home on delete or redraw is deterministic.
  - Caveats: MAJOR-4 (ties) and MAJOR-10 (writers outside AP-R1′).
- **Nesting.** Depth ≤ 2 with "a parent's `parent_id` is NULL" rules out cycles, self-loops
  included, and is SQL-checkable, as are I-J1, I-J2, I-L1–I-L5 and I-R3′. Composition is a sum, so
  order doesn't matter in exact arithmetic (m3 for float).
- **R-hold.** Lanes with the same window pass `W_k + o(x_k) + δ` on the same beat. An adjusted
  member still hits its displaced pinned copy on the pin's count (S-05 #5, S-05-a both expressible).
- **Bit-identity for founding spans.** With no timing, window, node or handoff, the lane can call
  `groupMemberWalk`/`groupPoint` (`core/geom.ts:624–680`) with `p = (b − T.start)/c`, which equals
  R-5 for founding spans (`core/resolver.ts:535`). Own lanes call `routePath`/`routePoint`
  unchanged. A per-route cache of `groupSchedule` is a pure memo (W-5).
- **No breakout.** Shape links survive. AP-R1′ writes a lane on `(T,k)`, so S-02 #3/#8, S-06 #7 and
  S-13 #5 ("back in the shape") are met. Shaped transitions are never compacted
  (`db/timelineMembership.ts:547`), so lanes there are never renumbered.
- **Undo.** Lanes and nodes are logged rows with FK RESTRICT. The delete order lanes → child nodes →
  parent nodes → route and its reverse are valid (C-1/C-2). Re-home inside the same transaction
  restores ids (S-39).
- **v0.1.7 files.** No routes, so no lanes or nodes. Conversion is unchanged.
- **Exits, joins and re-entry on another lane** (S-16, S-17, S-20, S-27) are expressible with K3 rows
  plus one-slot transitions in the same move. C-11 forces any excursion into a separate layered
  move, which matches R-dot. K3 is really needed: re-entering via a separate one-slot transition
  would avoid dropping I-A4/I-A5, but would freeze the end spot (F-12).

## D. Could something simpler do as well?

1. **Derive `o_e` (MAJOR-6).** This drops two columns and an invariant, and passes more of S-22.
2. **Inline the per-lane Adjust.**
   - Put the per-lane profile on the lane (`lanes.profile JSON NULL`) and keep the node table only
     for **sub-groups** (`lanes.group_adjust_id`).
   - Depth is then structurally 2, so I-J1/I-J2 shrink to "a group node has at least one lane".
   - S-09 (independent per lane, then diverge) and S-14 (linked sub-group plus a child tweak) both
     still work.
   - Detach copies one JSON value instead of a chain.
   - It removes about N node rows per multi-select Adjust and the orphan bookkeeping.
3. **Store `ws`, drop `join='whole'` as a derived mode (MAJOR-2).** "Whole" is then just a window
   the app writes. Better still, move window, join and entry to an occupancy-keyed row.
4. **Keep the handoff separate from Adjust.** I looked at expressing a handoff as an Adjust ramp
   from 0 to `o_e − o_s`. It would cost a rewrite of every lane when the marker is dragged, and it
   collides with a user Adjust on the same lane (one `adjust_id`). C's split is the better one.
5. **Stored vs derived elsewhere.** F and G stored: right (S-42). `rehomed` flag: right (UI only).
   Membership derived from `route_id`: right.

## E. Scenario verdicts that differ from "passes all 48"

- **Fail as written:**
  - S-22 #1, #3 (MAJOR-6);
  - S-30 and S-07 #2 on a shaped end set (MAJOR-8);
  - S-46 and S-13 #4 "its lane goes" on shaped transitions (MAJOR-7).
- **Unspecified or fragile:**
  - S-18 #5, S-44, S-19 #5 split with joins, resumes or takeovers (MAJOR-5);
  - S-21 #3 for `whole` occupants (MAJOR-2);
  - S-27 #3 person Adjust under retime (MAJOR-1);
  - S-48 #2 (m10);
  - S-40(b) for pathways-lab files (MAJOR-9).
- **Pass with the stated owner-question defaults:** the rest.
