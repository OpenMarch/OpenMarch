<!-- cspell:disable -->

# Pathways grill 02: scenario matrix

2026-11-05. Input for judging candidate data models (A, B, B1, B2, B3, others). This file does
**not** evaluate models. It says what a designer does, what the field must show, and which **facts**
must be stored (or be derivable without new dependencies) for the scenario to be expressible and to
survive the edits that follow it.

Sources read: `/mnt/data/pathways-grill/BRIEF.md`; in `/mnt/data/worktrees/t3/OpenMarch/t3-fc7b6ac6`:
`docs/timeline/spec.md` (§2–4, D-4, D-5, D-7, D-16, D-19, R-14 incl. "Group schedule", Appendix I
AP-R1…AP-R10, I-R1…I-R5), `docs/adr/0016-moves-follow-drawn-paths.md`,
`docs/timeline/research/pathways/README.md` (register Q1–Q6, E-1…E-4, S-1…S-11, O-1…O-29, P-1,
P-2, G-1, F-1…F-6, U-1), `draft-model.md` (§3.2 timing, §3.3 entry, §3.4 formations, §3.5 re-fit,
§4 FTL on a trail, §5 edits), `implementation-plan.md`.

## How to read a scenario

- **Units.** Counts are beats. "4×4 block, 2-step" = 16 marchers in 4 ranks (A front … D back) ×
  4 files (1 … 4), 2 steps (8-to-5) apart; marchers named `A1 … D4`. Side 1 is the left half,
  the 50 is `x = 0`. "Move" = one timeline (a page's box or a split-off move), range `[s, e)`.
- **Standing rules assumed in every "Expected"** (decided, from the register and spec; a model
  that can't keep them fails the scenario):
  - **R-hold**: a group path holds its shape: every member passes its copy of each inner point on
    the same count; only the legs onto and off the path differ in speed (owner 2026-11-04, R-14
    group schedule).
  - **R-slide**: groups slide; lanes are parallel copies, never turned with the path (G-1).
  - **R-abs**: route points are absolute field coordinates; a changed start or end does not move
    them; the path is flagged changed and **Re-fit** is one click (Q2, O-7, D-5).
  - **R-pin**: pins keep their counts on resize (counted from the edge not dragged); Alt-drag
    scales; shrinking past a pin stops the drag (Q1, F-1).
  - **R-dot**: dragging a marcher's dot mid-move never edits a path; it makes a new move on top
    (the edit window), and the marcher picks its path back up after (P-1).
  - **R-obj**: paths are objects; double-click opens; point edits happen on the open path.
  - **R-undo**: every listed edit is one undo step; undo restores the database exactly, ids
    included; redo restores the same ids (AP-R\*, J-19).
  - **R-other**: an edit to one member never moves another member, unless the edit is to the
    shared path itself (R-14 group schedule item 9).
- **Facts** are named `F-nn` and defined once in the catalogue at the end. "Derived" means the
  model must be able to compute it from stored facts without a new dependency on other marchers.
- **OPEN** marks a genuine owner ambiguity; the question is written out. A model may legitimately
  pick either answer, but it must be able to _express both_ unless the owner rules one out.

Owner capability items 1–10, owner answers (OA-…) and "Also test" items (AT-…) are mapped to
scenarios in the coverage table just before the fact catalogue.

---

## Group 1: nothing, one marcher (items 1, 2, 5)

### S-01 Nothing drawn: everyone walks straight (item 1)

**Setup.** 4×4 block, 2-step, centred on the 50, front sideline-side hash. Move 3, 16 counts,
to the same block 8 steps toward side 2. No path.

**Expected.** Every marcher walks a straight line at 1 step per count (8 to 5 = 8 steps / 16
counts → half steps). No route rows exist.

| #   | Edit                                                                          | Expected                                                                     |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Drag B2's end spot 2 steps back                                               | Only B2's line changes; nothing else written but B2's destination            |
| 2   | Split at playhead count 8 (AP-R7)                                             | Two moves; each marcher at its count-8 position at the cut; motion identical |
| 3   | Open the file in v0.1.7 shape (no routes table) / v0.1.7 file into this build | Opens; plays identically                                                     |
| 4   | Undo ×2                                                                       | Back to S-01 setup, ids restored                                             |

**Facts.** F-30 (no route ⇒ straight). Nothing else. Any model that writes a row per marcher
"just in case" fails the v0.1.7 and file-size check.

---

### S-02 One marcher's own path around an obstacle (item 2)

**Setup.** S-01, but a sousa in file 3 stands where B3 walks. Designer selects B3, pen, clicks two
corners `P1`, `P2` bending 2 steps upfield, Enter.

**Expected.** B3 walks `A → P1 → P2 → B` at one constant speed (no pins yet). The other 15 are
untouched. If B3 was in the block's shaped transition it now has its own path; its end spot is
still the block's spot.

| #   | Edit                                                         | Expected                                                                                                                                    |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Open path, drag `P2` 1 step right                            | Only B3's path changes; same speed rule                                                                                                     |
| 2   | Add a point on leg `P1→P2`, make it smooth                   | Curve through it; ids of P1, P2 kept                                                                                                        |
| 3   | Edit the block's end shape (recipe: 2-step → 3-step spacing) | B3's destination moves with the block; `P1`, `P2` stay on the field (R-abs); last leg bends; path shows "changed"; Re-fit offered           |
| 4   | Re-fit                                                       | Similarity transform maps drawn `from,to` onto real `A,B`; points move                                                                      |
| 5   | Earlier move edited so B3 starts 2 steps left                | First leg only changes (chord rule); inner curve unchanged                                                                                  |
| 6   | Split at playhead count 6 (AP-R7)                            | Two own paths meeting at B3's count-6 position `C`; same positions at every count within tolerance                                          |
| 7   | Undo split                                                   | One step; original route id and point ids restored                                                                                          |
| 8   | Remove path                                                  | B3 back to straight; **is B3 back in the block's shaped transition or left as a one-slot shapeless transition with the same end?** see OPEN |

**Facts.** F-01, F-02, F-03, F-12 (B3's end spot still tracks the block recipe after it gets a path), F-29, F-31.

**OPEN S-02-a.** After Remove path, should B3 be "back in the shape" (a later block reshape
moves its end), or is it now an individually placed spot? Today AP-R1 breaks B3 out to a one-slot
transition with a _copied_ end spot, so edit 3 would _not_ move B3's end. The owner's item 3/9
wording ("shares the same parent/shape") suggests B3 should still follow the block. Question:
**When one marcher in a block gets its own path, does its end spot stay linked to the block's
shape?**

---

### S-03 Run / flutter: more points than counts (item 2, J-1)

**Setup.** Soloist D1, 4 counts, own path with 9 smooth points (a wiggle) over 12 steps.

**Expected.** Constant speed along the wiggle (3 steps per count); passes points between counts.

| #   | Edit                                     | Expected                                                           |
| --- | ---------------------------------------- | ------------------------------------------------------------------ |
| 1   | Resize move end edge 4 → 8 counts        | Same path, half the speed                                          |
| 2   | Steps per count → double time (rate 2/1) | Positions unchanged; per-step export lists 16 steps                |
| 3   | Split at playhead count 2                | Halves meet at `C`; curves next to `C` redrawn (AP-R7 step 2 rule) |
| 4   | Delete 4 points                          | Smoother wiggle; one undo step                                     |

**Facts.** F-01, F-23, F-29.

---

### S-04 Midset and quarter sets on one marcher (item 5, J-3)

**Setup.** Soloist on 16 counts from the side-1 30 to the side-2 30, one corner on the 40 at
count 8 (midset), plus quarter pins at counts 4 and 12 at uneven distances (3 steps by count 4,
9 by count 8).

**Expected.** Constant speed inside each pinned piece, instant change at a pin (S-2, O-11). Hits
each pinned point exactly on its count.

| #   | Edit                                  | Expected                                                                           |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Drag end edge 16 → 24                 | Pins stay on 4, 8, 12; last piece takes 12 counts (slower)                         |
| 2   | Alt-drag end edge back to 16          | Pins scale by 16/24: 4, 8, 12 → 2⅔, 5⅓, 8, shown as sub-beat steps (F-1)           |
| 3   | Drag start edge later by 2            | Pins keep their counts (counted from the end edge)                                 |
| 4   | Shrink end edge to 10                 | Drag stops at the last pin (count 12 → can't go under 12)                          |
| 5   | Drag the count-8 pinned point 2 steps | Still hit on count 8; neighbours' speeds change                                    |
| 6   | Change the count-8 pin to count 10    | Speeds re-derived; no point moves                                                  |
| 7   | Delete the pinned point               | Its pin goes with it; one undo step                                                |
| 8   | Split at playhead on count 8          | Cut lands on the pinned point; pin becomes the move boundary (dropped, draft §5.2) |
| 9   | Split at count 7½ (sub-beat pin)      | Refused: time split takes whole beats                                              |

**Facts.** F-01, F-07, F-23, F-29.

---

### S-05 Non-constant speed on a group path: uneven checkpoints (item 5)

**Setup.** 4×4 block, 2-step; group path with 3 inner corners `Q1, Q2, Q3`; pins `Q1@4`, `Q2@6`,
`Q3@14` of a 16-count move. Distances along the reference line: 4, 10, 6, 4 steps.

**Expected.** R-hold: every member is on its copy of `Qk` on the pinned count. Group speed is 1,
5, 0.75 and 2 steps per count in the four stretches; legs onto/off the path within the first/last
stretch.

| #   | Edit                                        | Expected                                                                            |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Drag `Q2` 3 steps                           | All lanes bend; still on `Q2+o` on count 6                                          |
| 2   | Add an unpinned point between `Q2` and `Q3` | Shared speed constant from 6 to 14 along the new longer stretch                     |
| 3   | Move pin `Q3` from 14 to 12                 | Every member reaches `Q3+o` on 12                                                   |
| 4   | Detach A1 (independent copy)                | A1 keeps the pins as **its own copy**; later group pin edits skip A1                |
| 5   | Adjust B2 (drag its lane between Q1 and Q2) | B2 still hits `Q1+o`, `Q2+o` on 4 and 6 unless the adjustment moves those points    |
| 6   | Resize move to 20                           | Pins stay on 4, 6, 14 for everyone (adjusted members included); last stretch longer |
| 7   | Undo ×6                                     | Back, ids restored                                                                  |

**Facts.** F-01, F-04, F-05, F-06 (one shared time map for the group), F-07 (pins owned by the
group path, shared), F-09, F-10, F-29.

**OPEN S-05-a.** Edit 5: can an **Adjust** move a pinned point for one member (e.g. B2 passes
`Q2` 1 step wider on count 6) while keeping the pin's count? Or is a pinned point fixed for all
adjusted members?

---

## Group 2: group paths, Adjust and Detach (items 3, 4; owner answer "two kinds")

### S-06 Group path for a block that keeps its shape (item 3)

**Setup.** 4×4 block, 2-step, front hash side 1 30 → same block on side 2 30 (moved over by
`G − F`). 16 counts. Group path, one smooth point 6 steps upfield of the 50.

**Expected.** Block rigid the whole move at one steady speed (R-14 item 8); slides, no turning.

| #   | Edit                                                                      | Expected                                                                                                                         |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Drag the smooth point 2 steps further upfield                             | Every lane moves; still rigid                                                                                                    |
| 2   | Add a corner after it                                                     | Every lane gets it; all pass it on one count                                                                                     |
| 3   | Drag C3's end spot 1 step                                                 | Only C3's last leg changes (R-other)                                                                                             |
| 4   | Drag the whole end block 4 steps toward the sideline (block recipe moved) | Every last leg bends; points stay (R-abs); path flagged changed; Re-fit translates the reference line so lanes meet the new ends |
| 5   | Re-fit                                                                    | Group re-fit is a translation of `from`/`to` and points; offsets unchanged                                                       |
| 6   | Earlier move edited: A-rank starts 1 step forward                         | Only A-rank first legs change; lanes stay                                                                                        |
| 7   | Remove path                                                               | All 16 back to straight in one undo step; are they back in the block's shape transition? (S-02-a)                                |

**Facts.** F-01, F-02, F-03, F-04, F-05, F-06, F-12, F-28, F-29.

---

### S-07 Group path into a different end shape (item 3)

**Setup.** 4×4 block (2-step) → an arc of 16 (recipe), 16 counts. Group path: two smooth points.

**Expected.** Rigid block between the first and last inner points; each member's last leg goes to
its own arc spot (handoff at end, see Group 5). Lands on the arc exactly.

| #   | Edit                                                       | Expected                                                                                     |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Edit the arc recipe radius 10 → 12 steps                   | Every end spot moves; lanes unchanged; only last legs change                                 |
| 2   | Change the arc's spot order so A1 ends where D4 did (O-14) | A1 and D4 last legs swap ends (cross); lanes unchanged if lanes are start-derived (see S-29) |
| 3   | Select the arc and drag it 4 steps                         | Last legs only; Re-fit offered                                                               |
| 4   | Undo ×3                                                    | Exact                                                                                        |

**Facts.** F-01, F-04, F-05, F-12 (end spots still from the arc recipe), F-13 (handoff), F-14,
F-18.

---

### S-08 Adjust one member (owner: Adjust override)

**Setup.** S-06's group path. C2's lane clips a podium; designer opens the path, selects C2's lane
and drags a point of it 1.5 steps toward side 1 near the smooth point. Chooses **Adjust**.

**Expected.** C2 deviates near the smooth point only; it still passes every _other_ group point on
the shared count; the other 15 are bit-identical to before.

| #   | Edit                                          | Expected                                                                                                 |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Drag the group's smooth point 2 steps upfield | C2's lane moves with the group **and keeps its 1.5-step bulge** at the same place along the path         |
| 2   | Add a group point before the adjusted stretch | Bulge stays on the same stretch of path (not shifted to a different part of the curve)                   |
| 3   | Resize the move 16 → 24                       | Bulge rides the group time map: C2 is in its bulge on the same fraction of the path, now later in counts |
| 4   | Pin the group smooth point to count 8         | C2's bulge peak is passed on count 8 too                                                                 |
| 5   | Adjust C2 again: increase bulge to 2 steps    | Same adjustment row updated (one override, not stacked)                                                  |
| 6   | Reset adjustment                              | C2 is exactly on its lane again (bit-identical to the other members' rule)                               |
| 7   | Undo ×6                                       | Exact                                                                                                    |

**Facts.** F-04, F-05, F-06, F-09 (adjustment stored **relative to the group path parameter**
— e.g. a displacement field over `u` or anchored to stable group point ids — not absolute
points), F-29.

---

### S-09 Adjust several members at once, then diverge one

**Setup.** S-06; select B1–B4 lanes, drag them 1 step toward the front sideline on the stretch
after the first point, Adjust.

| #   | Edit                           | Expected                                         |
| --- | ------------------------------ | ------------------------------------------------ |
| 1   | Reshape group path             | All four keep their 1-step adjustment            |
| 2   | Adjust B3 further (+1 step)    | B3's adjustment is 2 steps; B1, B2, B4 unchanged |
| 3   | Select B1–B4, Reset adjustment | All four back on their lanes                     |
| 4   | Undo                           | B3 at 2, others at 1                             |

**Facts.** F-09 (one adjustment per member; or a shared adjustment with per-member deltas — the
model must allow "same edit applied to many" **and** later divergence). F-11 if the four are
treated as a sub-group.

**OPEN S-09-a.** Is "adjust 4 together" four independent adjustments (diverge freely) or a
**sub-group** that stays linked (edit one, all four change)? The owner's item 8 (nested) suggests
the sub-group form exists too; which does a multi-select drag create?

---

### S-10 Adjust survives a heavy reshape (owner's hard question)

**Setup.** Group path with 3 inner points `G1, G2, G3`; C2 adjusted around `G2` (+1.5 steps).

| #   | Edit                                                                     | Expected                                           |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| 1   | Delete `G2`                                                              | OPEN S-10-a                                        |
| 2   | (from setup) Drag `G2` 10 steps (big change, same id)                    | C2's bulge follows `G2` (anchored to it)           |
| 3   | (from setup) Draw the group path again (AP-R8 "again") with 5 new points | OPEN S-10-b                                        |
| 4   | (from setup) Add 2 points between `G1` and `G2`                          | Bulge stays around `G2`                            |
| 5   | (from setup) Reverse path direction? (n/a: paths run start→end)          | —                                                  |
| 6   | Any of the above, then Undo                                              | Adjustment restored exactly (same id, same values) |

**Facts.** F-09 with an explicit **anchor** (group point ids, or path fraction `u`, or arc-length)
and an explicit **anchor-loss policy**; F-29.

**OPEN S-10-a.** When the group point an adjustment is anchored near is deleted, does the
adjustment (i) stay at the same path fraction `u`, (ii) re-anchor to the nearest surviving point,
(iii) drop with a notice (undo restores), or (iv) convert C2 to Detach with its current line
baked in?
**OPEN S-10-b.** "Draw it again" replaces every point id. Same four options; plus: should
redrawing ask first when members have adjustments?

---

### S-11 Detach one member (owner: Detach = independent copy)

**Setup.** S-06 group path; C2 Detach (today: **Own path**, AP-R9).

**Expected.** C2 walks a copy of its lane; positions unchanged within rounding when its ends are
`F+o`, `G+o`. It no longer follows the group schedule (own steady speed) **unless** the group had
pins (then its copy has copies of the pins).

| #   | Edit                                      | Expected                                                                                                            |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Drag a group point                        | C2 unchanged                                                                                                        |
| 2   | Edit C2's own path                        | Group unchanged                                                                                                     |
| 3   | Rejoin C2                                 | C2 back on its original lane with its original offset, bit for bit (AP-R10), own-path edits dropped (undo restores) |
| 4   | Detach an **adjusted** member (S-08's C2) | Its own path is the lane **with the adjustment baked in**                                                           |
| 5   | Rejoin it                                 | OPEN S-11-a                                                                                                         |
| 6   | Detach all 16                             | Group path gone; 16 own paths; one undo step                                                                        |

**Facts.** F-08 (own route copy), F-10 (provenance: which group path and offset it came from, so
Rejoin can restore — today recomputed from `A − R.from`), F-09, F-29.

**OPEN S-11-a.** Rejoining a member that had an Adjust before Detach: does the adjustment come
back, or does it rejoin plain?

---

### S-12 Adjust vs Detach after the group is retimed

**Setup.** S-05's pinned group path. B2 Adjusted, A1 Detached.

| #   | Edit                       | Expected                                                                               |
| --- | -------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Move group pin `Q2` 6 → 8  | B2 follows (passes `Q2` on 8); A1 still on 6                                           |
| 2   | Resize move 16 → 20        | Both keep pinned counts (R-pin); A1's own pins and the group's pins each kept          |
| 3   | Steps per count → double   | Both: positions unchanged                                                              |
| 4   | Split at playhead count 10 | Both halves keep B2's adjustment on the right side of the cut; A1 split as an own path |

**Facts.** F-06, F-07 (pins on group path vs on own path), F-09 (adjustment in path-parameter
space, so retiming is free), F-23.

---

## Group 3: subsets and nesting (items 8, 9)

### S-13 Path for only a subset of a group (item 9)

**Setup.** 4×4 block → arc of 16 (one shape move, 16 slots). Designer selects only A-rank (A1–A4)
and draws a group path looping upfield; B–D ranks stay straight.

**Expected.** A-rank slides along its lanes; B–D walk straight; all 16 land on the arc.

| #   | Edit                                        | Expected                                                                  |
| --- | ------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Edit arc radius                             | All 16 end spots move; A-rank last legs bend; B–D straight lines retarget |
| 2   | Arc spot order changed so A2's spot changes | A2's last leg retargets (S-07 #2); if O-14 applies, notice                |
| 3   | Add B1 to the subset path (Rejoin)          | B1 gets a lane from where it stands; others unchanged                     |
| 4   | Delete marcher A3 from the show             | Its lane goes; others keep lanes; arc slot left vacant (D-13)             |
| 5   | Remove path                                 | A-rank straight again, **still in the arc move's shape** (S-02-a)         |
| 6   | Undo ×4                                     | Exact                                                                     |

**Facts.** F-03, F-04, F-12 (**subset path without breaking the arc's slots out of the shape**),
F-36, F-29.

---

### S-14 Nested override: a subset overrides inside a group path (item 8)

**Setup.** 4×4 block group path `GP` (3 points). Front rank A1–A4 should swing wider around the
first point: designer selects A-rank lanes and Adjusts them **as one sub-path** (`SP`, a child of
`GP`). Then inside `SP`, A2 gets its own Adjust (1 step).

**Expected.** B–D on `GP` lanes; A-rank on `SP` = `GP` + the A-rank adjustment; A2 = `SP` + 1 step.

| #   | Edit                                 | Expected                                                                                                      |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 1   | Reshape `GP` (drag its middle point) | B–D, A-rank and A2 all move with it; both adjustments kept                                                    |
| 2   | Reshape `SP` (widen the swing)       | A1, A3, A4 and A2 move; A2 keeps its extra 1 step; B–D unchanged                                              |
| 3   | Reset `SP`                           | A-rank back on `GP` lanes; A2 keeps its own 1-step Adjust, now relative to `GP` (OPEN S-14-a)                 |
| 4   | Detach `SP`                          | A-rank becomes an independent group path (copy); `GP` edits skip it; A2's adjustment now relative to the copy |
| 5   | Remove path on `GP`                  | OPEN S-14-b                                                                                                   |
| 6   | Add pin on `GP` at count 8           | A-rank and A2 also pinned (they're adjustments, not detached)                                                 |
| 7   | Undo ×6                              | Exact                                                                                                         |

**Facts.** F-11 (override hierarchy: child path stores parent + adjustment relative to parent),
F-09, F-06, F-29.

**OPEN S-14-a.** When a mid-level override is reset, do grandchild adjustments re-parent to the
grandparent (kept) or go?
**OPEN S-14-b.** Remove path on a parent that has Adjusted children: remove everything, or promote
the children to independent paths?
**OPEN S-14-c.** How deep can nesting go (two levels, or any)?

---

### S-15 Two subsets split around an obstacle, then reform

**Setup.** 8-marcher line (1–8) at 2-step. Move of 16 counts to a line 16 steps forward. 1–4 take
a group path left of a prop; 5–8 a group path right of it. End line identical shape.

| #   | Edit                                                  | Expected                                                                  |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Move marcher 4 from the left group to the right group | 4 gets a lane on the right path from where it stands; left path keeps 1–3 |
| 2   | Reshape the right path                                | 4–8 move                                                                  |
| 3   | Remove the left path                                  | 1–3 straight; right path unchanged                                        |
| 4   | Split at playhead count 8                             | Both group paths split; motion unchanged (currently refused, AP-R7)       |

**Facts.** F-03, F-04, F-29, F-34 (two group paths in one move, each its own owner/walkers).

---

## Group 4: exiting and entering a path (items 6, 6.1, 7; owner answer "late join")

### S-16 Exit a path before it completes (item 6)

**Setup.** 8-marcher line on a group path, 16 counts. Marcher 3 peels off at count 10 to a solo
spot 6 steps downfield (its own end spot, not on the group's end set).

**Expected.** Counts 0–10: 3 on its lane with the group (R-hold). Counts 10–16: straight to its solo
spot. Others unaffected.

| #   | Edit                                                      | Expected                                       |
| --- | --------------------------------------------------------- | ---------------------------------------------- |
| 1   | Drag 3's exit from count 10 to 12                         | Exits later, shorter last leg                  |
| 2   | Drag a group point before count 10                        | 3 moves with the group until it exits          |
| 3   | Resize the move 16 → 20                                   | OPEN S-16-a                                    |
| 4   | Drag 3's solo end spot                                    | Only its exit leg changes                      |
| 5   | Split at playhead count 8 (before exit) and at 12 (after) | Motion unchanged; exit stays in the right half |
| 6   | Undo ×5                                                   | Exact                                          |

**Facts.** F-15 (per-member exit point), F-05, F-06, F-29.

**OPEN S-16-a.** Is an exit stored as a **count** (stays on 10 when retimed) or a **place on the
path** (fraction `u`, so it moves in counts when pins/resize move the group's time map)? A
designer peeling off "at the 40" vs "on count 10" means different things.

**OPEN S-16-b.** Is an exit a property of the member's path (one move, its end spot is off the
group's end set) or a second move starting at count 10 (a takeover)? Today it can only be the
latter (a takeover leaves the route where it is, AP-R7 notes), which means its end spot belongs to
another move.

---

### S-17 Enter a path after it starts, cutting in (item 6.1)

**Setup.** Group path for 8 (line), 16 counts. Soloist S stands 8 steps off the path; S should
**cut in** at the place on the path the group's line is at count 6, landing in a lane at the end
of the line (offset one interval past marcher 8), and ride the rest with the group.

**Expected.** Counts 0–4: S holds (or walks its own previous move). Counts 4–6: entry leg (E-1,
E-2: length from distance at a normal step, or typed) to `lane_S(u(6))`. Counts 6–16: on its lane,
rigid with the line, landing on its end spot.

| #   | Edit                                 | Expected                                  |
| --- | ------------------------------------ | ----------------------------------------- |
| 1   | Change S's join count 6 → 8          | Entry aims at `u(8)`                      |
| 2   | Reshape the group path after count 6 | S follows                                 |
| 3   | Reshape before count 6               | S's entry re-aims; its stand-by unchanged |
| 4   | Type entry length 3 counts           | Entry starts at count 3                   |
| 5   | Switch S to "whole path faster"      | Becomes S-18's behaviour                  |
| 6   | Delete S                             | Group unchanged                           |

**Facts.** F-14 (join beat + join mode), F-04 (S's lane offset — **where does it come from?**
OPEN S-17-a), F-20 (entry rule), F-05.

**OPEN S-17-a.** A joiner's lane offset: from its own end spot relative to the group's end set
(destination-derived), from a slot in the group's start formation it never stood in, or typed by
dragging? (Today AP-R10 Rejoin uses `A − R.from`, i.e. where it stands now, which puts its lane
8 steps off the path — wrong for a cut-in.)

---

### S-18 A late block walks the whole path faster (owner answer)

**Setup.** Block X (2×4) starts the group path on count 0; block Y (2×4) is still finishing a
move until count 8, then walks **the whole path** from its first point to the end in counts 8–16
(double speed); both land on one 4×4 end block on count 16.

**Expected.** X: R-hold over 0–16. Y: R-hold among Y's members over 8–16 (Y holds its own shape),
passing every point later and faster than X. Y and X never share a moment on a point.

| #   | Edit                                  | Expected                                                            |
| --- | ------------------------------------- | ------------------------------------------------------------------- |
| 1   | Reshape the path                      | Both X and Y follow it                                              |
| 2   | Y's earlier move extended to count 10 | Y now walks the path in 6 counts (faster); Big steps flags it       |
| 3   | Add pin at count 8 on the path        | OPEN S-18-a                                                         |
| 4   | Switch Y to "cut in"                  | Y enters at the place X's formation occupies at count 8 (S-17)      |
| 5   | Split at playhead count 12            | X and Y each split at their own place on the path; motion unchanged |
| 6   | Resize move 16 → 20                   | X over 0–20; Y over 8–20 (or 10–20); pins per S-18-a                |
| 7   | Undo ×6                               | Exact                                                               |

**Facts.** F-06 per **sub-group** (one group path, two time maps), F-14 (join mode, join beat),
F-07, F-29. Breaks I-R5 (one range per route) unless Y's time map is derived from its row's range.

**OPEN S-18-a.** A pin on the group path at count 8 when Y only starts at count 8: does Y's time
map compress the pin proportionally (Alt-scale semantics, Y passes it on 12), ignore it, or
refuse?
**OPEN S-18-b.** Is "whole path faster" a property of the joiner (each member chooses) or of the
sub-group (Y as a unit)?

---

### S-19 Exit and re-enter before the end (item 7)

**Setup.** 8-line group path, 16 counts. Marcher 5 leaves its lane at count 6 to step around a
prop and re-enters **its own lane** at count 10.

**Expected.** 0–6 on lane; 6–10 its own excursion (2 corners); 10–16 on lane, R-hold with the
group again.

| #   | Edit                                             | Expected                                                      |
| --- | ------------------------------------------------ | ------------------------------------------------------------- |
| 1   | Reshape the group between counts 6 and 10        | 5's excursion is unchanged in shape? or attached? OPEN S-19-a |
| 2   | Reshape after count 10                           | 5 follows                                                     |
| 3   | Move re-entry 10 → 12                            | Excursion longer in time                                      |
| 4   | Resize move 16 → 24                              | Exit/re-entry stay on counts or on path positions (S-16-a)    |
| 5   | Split at playhead count 8 (inside the excursion) | Excursion splits; motion unchanged                            |
| 6   | Undo ×5                                          | Exact                                                         |

**Facts.** F-17 (excursion: exit, re-entry, its own geometry), F-09 (an excursion is an Adjust
with a big displacement? or its own route), F-15, F-16.

**OPEN S-19-a.** Is an excursion an **Adjust** (so it rides group reshapes, S-08) or absolute
geometry pinned between two re-entry points (so it stays round the prop when the group path
moves)? The prop doesn't move when the path is reshaped, which argues for absolute.

---

### S-20 Re-enter on a slot that wasn't the marcher's (item 7)

**Setup.** 8-line group path (lanes 1–8), 16 counts. Marcher 3 exits at count 6 (S-16) and
re-enters at count 10 into **lane 7**; marcher 7 exits at 6 and re-enters at 10 into **lane 3**.
End spots: 3 ends on spot 7, 7 on spot 3.

**Expected.** 0–6: each on its own lane. 6–10: crossing excursions. 10–16: 3 rides lane 7 and lands
on spot 7; 7 rides lane 3, lands on spot 3.

| #   | Edit                                                    | Expected                                                                       |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Reshape the group path                                  | Lanes 3 and 7 move; whoever is on them follows                                 |
| 2   | Adjust lane 7 after count 10 (OA "path follows slot")   | **Marcher 3** is moved (it holds lane 7 then); marcher 7's 0–6 part unaffected |
| 3   | Recast: replace marcher 3 with marcher 21 for this move | 21 does 3's whole story                                                        |
| 4   | Undo swap (re-entry lanes back to own)                  | Each back on its own lane; exact                                               |

**Facts.** F-18 (lanes keyed by **slot**, assignments map marchers to slots over count ranges),
F-19 (mid-move reassignment at a beat), F-17, F-09 keyed by slot.

---

### S-21 A higher layer takes a marcher off its path, then lets go (J-11, AT "pins")

**Setup.** Soloist own path, 16 counts, pins at 8 and 12. A later move (one marcher, dot dragged
mid-move per R-dot) takes it over counts 4–6.

**Expected.** At 6 it is off the path; entry (first fit at a normal step) back onto the path
before count 8; hits 8 and 12.

| #   | Edit                                                | Expected                                                |
| --- | --------------------------------------------------- | ------------------------------------------------------- |
| 1   | Extend the takeover to count 9                      | Entry aims at pin 12                                    |
| 2   | Delete the takeover                                 | Back on schedule, no entry                              |
| 3   | Same takeover on a group path member                | Member rejoins its lane, R-hold resumes after the entry |
| 4   | Take over the whole group (all 16 dots dragged) 4–6 | Each rejoins its lane; OPEN S-21-a                      |

**Facts.** F-20, F-07, F-05.

**OPEN S-21-a.** After a takeover of the whole group, should the group rejoin in formation (all
entries end on one count) or each by its own first fit (formation breaks briefly)?

---

## Group 5: spacing handoff (owner answer "designer chooses when the destination takes over")

Today's R-14 group schedule is one point on this axis: lanes use **start** spacing (`o = A − F`)
until the last inner point, then each member's last leg morphs to **end** spacing. Note: a
continuous path can't switch spacing on one instant without a jump, so "handoff at count h"
necessarily means a morph over some stretch; S-24 asks which.

### S-22 Handoff immediately

**Setup.** 4×4 block at 2-step → path (2 points) → 4×4 block at 4-step, 16 counts. Handoff set to
"immediately".

**Expected.** First legs expand the block to 4-step spacing while reaching the first point; then
rigid at 4-step all along the path; last legs are the moved-over pieces (steady).

| #   | Edit                            | Expected                                                                  |
| --- | ------------------------------- | ------------------------------------------------------------------------- |
| 1   | Change end recipe spacing 4 → 3 | The block on the path is 3-step; all lanes change (lanes are end-derived) |
| 2   | Drag one end spot (C3)          | OPEN S-22-a                                                               |
| 3   | Swap end spots of A1 and D4     | Their lanes swap; their first legs cross (contrast S-29)                  |
| 4   | Undo ×3                         | Exact                                                                     |

**Facts.** F-13, F-14 (destination-derived offset `B_m − G`), F-28 (`G` stored vs live centroid).

**OPEN S-22-a.** With end-derived lanes, dragging one end spot changes that member's lane for the
whole path (R-other holds) — but if `G` is the live mean of end spots, it moves every lane by
1/16 of the drag (violates R-other, fans out invalidation). Is `G` frozen at draw time (Re-fit
updates it) — i.e. is the expectation "only C3's lane moves"?

### S-23 Handoff at the end (today)

**Setup.** As S-22, handoff "at the end".

**Expected.** Rigid at 2-step along the path; last legs expand to 4-step (each member its own
speed on the last leg).

| #   | Edit                                         | Expected       |
| --- | -------------------------------------------- | -------------- |
| 1   | Earlier edit moves the start block to 3-step | OPEN S-23-a    |
| 2   | End spacing changed                          | Only last legs |
| 3   | Switch handoff to "immediately"              | S-22           |

**Facts.** F-13, F-04, F-10.

**OPEN S-23-a.** With start-derived lanes, if the start block changes (AP-R5), do lanes stay
(offsets frozen at draw, only first legs change: today) or follow the new start spacing (offsets
live from `A`)? The owner's "start-block spacing" phrase suggests live.

### S-24 Handoff at a chosen count, and over a stretch

**Setup.** As S-22, handoff at count 8 of 16 (the path's middle point, pinned at 8).

**Expected.** 2-step block along the path until the handoff, 4-step after. The morph happens over
a stretch.

| #   | Edit                                       | Expected                                                      |
| --- | ------------------------------------------ | ------------------------------------------------------------- |
| 1   | Drag the handoff marker to count 12        | Morph moves later                                             |
| 2   | Reshape the path                           | Handoff stays at count 8 or at its place on the path (S-16-a) |
| 3   | Split at playhead before/after the handoff | Each half keeps its spacing rule; motion unchanged            |
| 4   | Resize 16 → 24                             | Handoff follows R-pin (count) or path position                |
| 5   | Adjust B2 across the handoff               | Adjustment rides on top of the morphing lane                  |
| 6   | Undo ×5                                    | Exact                                                         |

**Facts.** F-13 (handoff start and end as counts or path positions; morph rule), F-14, F-04,
F-06, F-09.

**OPEN S-24-a.** Handoff "at a point": a morph **across one leg** of the path (the leg after the
handoff point), across a typed number of counts, or instant at a point where every lane passes
through one shared place (only possible when lanes converge)? What does the morph look like: each
member straight-line-blended from its start offset to its end offset (lanes stay parallel only
when spacing is uniform)?

---

## Group 6: arriving from separate sources (item 10)

### S-25 Two blocks from different shapes share one path into one arc

**Setup.** Block L (2×4, side 1 hash) and block R (2×4, side 2 hash), each from its own earlier
move/shape. Move 5, 16 counts: both onto one group path through the 50 into an arc of 16. Lanes:
L and R arrive side by side at the first point (the designer arranges the combined block on the
path).

**Expected.** First legs from two different places; from the first point on, one 16-member
formation rigid (R-hold); last legs onto the arc.

| #   | Edit                                                     | Expected                                                  |
| --- | -------------------------------------------------------- | --------------------------------------------------------- |
| 1   | Earlier move of L edited (L starts 4 steps further away) | L's first legs only; lanes stay (frozen) — or OPEN S-25-a |
| 2   | Delete R's earlier move                                  | R's starts change; only R's first legs                    |
| 3   | Reshape the arc                                          | Last legs only                                            |
| 4   | Remove R's members from the path                         | L keeps lanes; R straight                                 |
| 5   | Undo ×4                                                  | Exact                                                     |

**Facts.** F-21 (members of one group path may come from different source transitions; offsets
not tied to a shared source formation), F-04, F-13 (the on-path formation is neither L's nor R's
start spacing — it's a third, arranged formation, or the destination's), F-28.

**OPEN S-25-a.** With two sources, "start-block spacing" is undefined (two blocks 30 steps apart).
Is the on-path formation (a) each member's start offset from the combined centroid (two blocks
far apart walking 30 steps apart on parallel lanes — almost never wanted), (b) the destination's
spacing (handoff immediately), or (c) a formation the designer arranges? This is where item 10
and the handoff answer meet.

### S-26 Different sources, one trail (merge / zipper follow the leader)

**Setup.** Two files of 6 (side 1 and side 2) zipper into one file of 12 along one drawn trail
through the 50 (FTL), alternating L, R, L, R…

**Expected.** Each file's members enter the trail on a connector; order on the trail alternates;
no overtaking (P-5).

| #   | Edit                                 | Expected                            |
| --- | ------------------------------------ | ----------------------------------- |
| 1   | Change the order to all L then all R | Re-derived order; no geometry edits |
| 2   | Drag a trail point                   | Everyone follows                    |
| 3   | Delete one L marcher                 | Gap stays or closes (OPEN S-32-a)   |

**Facts.** F-22 (trail, slot order along it, spacing, connectors per source), F-21.

---

## Group 7: slot swaps and "does the path follow the slot or the person" (owner answer)

### S-27 Two ranks swap mid-move (owner's example)

**Setup.** 2 ranks of 4 (front F1–F4, back K1–K4) on a group path, 24 counts. At count 8 F-rank
steps forward 4 steps off the path (excursion), K-rank rotates 180° about its centre (a turn,
parked — use a drawn excursion instead), and at count 16 they come back in at **each other's
lanes**: F-rank takes the back lanes, K-rank the front. End: F in back spots, K in front.

**Expected.** 0–8 everyone on own lanes. 8–16 excursions. 16–24 on swapped lanes, R-hold, landing
on the swapped end spots.

| #   | Edit                                  | Expected                                               |
| --- | ------------------------------------- | ------------------------------------------------------ |
| 1   | Reshape the group path after count 16 | Front lanes (now K) and back lanes (now F) move        |
| 2   | Adjust front lane 2 after 16          | Whoever holds front lane 2 then (K2) moves             |
| 3   | Adjust F2 "the person" before 8       | F2 moves before 8 only                                 |
| 4   | Delete marcher K3                     | Front lane 3 empty after 16 (vacant slot); OPEN S-27-a |
| 5   | Split at playhead count 12            | Both halves keep who-holds-which-lane                  |
| 6   | Undo ×5                               | Exact                                                  |

**Facts.** F-18, F-19, F-17, F-09 keyed by slot (edit 2) **and** a way to key by marcher (edit 3),
F-36.

**OPEN S-27-a.** When a marcher in a mid-move swap is deleted, does its slot after the swap stay
vacant, or does the one who'd have swapped with it stay put?
**OPEN S-27-b.** Is an Adjust attached to a lane (slot) or a person? Edit 2 vs 3 suggest the
designer needs both; which one does a lane drag make by default?

### S-28 Swap two marchers' end spots after a path is drawn

**Setup.** S-06 group path (handoff at end). Designer swaps A1's and A4's end spots (end set
recast: a common fix for a crossing).

**Expected (path follows slot).** A1 now ends on A4's old spot. A1's lane: OPEN S-28-a.

| #   | Edit                                 | Expected                                                   |
| --- | ------------------------------------ | ---------------------------------------------------------- |
| 1   | Swap                                 | see OPEN                                                   |
| 2   | Adjust on A1 existed before the swap | Stays with A1 (person) or with the lane/slot (OPEN S-27-b) |
| 3   | Undo                                 | Exact                                                      |

**Facts.** F-18, F-13 (handoff decides whether lanes are start- or end-derived), F-09.

**OPEN S-28-a.** Path follows slot or person. Under start-derived lanes (handoff at end) a swap only
crosses the two last legs: lanes follow the **person** (where it started). Under end-derived
lanes (handoff immediately) the lanes swap: lanes follow the **slot**. Is that coupling (the
handoff choice decides it) what the owner wants, or should "lane follows slot/person" be its own
stored choice?

### S-29 Recast for a whole show

**Setup.** Marcher A2 (trumpet) is replaced by Z (new trumpet) from move 1 to the end. A2 had an
Adjust in move 5 and an own path in move 7.

**Expected.** Z does exactly what A2 did, every count.

| #   | Edit                        | Expected                                                         |
| --- | --------------------------- | ---------------------------------------------------------------- |
| 1   | Recast A2 → Z               | Z's positions = A2's old positions at every probe; one undo step |
| 2   | Reshape move 5's group path | Z follows with A2's old adjustment                               |

**Facts.** F-18 (everything keyed by slot/transition, nothing by marcher id, so recast rewrites
assignments only). If any fact is keyed by marcher id (today's Rejoin picks marchers; AP-R8
processes marchers by id), recast must rewrite it too.

### S-30 Future slot-assignment work: re-solving who goes where

**Setup.** Block → arc, group path, handoff at end. Designer runs "least travel reassign" on the
end set (future feature).

**Expected.** End-spot assignments change for many members; group path, adjustments and pins
survive; members' last legs retarget.

**Facts.** F-18 (assignment is the only marcher↔slot link, D-4), F-09 keyed by slot or person
(S-27-b), F-13.

**OPEN S-30-a.** After reassignment, do adjusted members' adjustments go with the person (who may
now be in another place in the formation) or stay with the lane?

---

## Group 8: also-test items

### S-31 Follow the leader, block letter "L" (J-5, AT trails)

**Setup.** 12 marchers in a line at 2-step; trail with 2 corners making an "L"; lineup mode;
spots every 2 steps; 24 counts.

**Expected.** Each turns its corner on its own count; with whole-spot distances everyone turns on
a whole count; no overtaking.

| #   | Edit                                           | Expected                                                         |
| --- | ---------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Drag a corner                                  | Trail changes; turning counts re-derived; warning if off a count |
| 2   | Add a point                                    | Same                                                             |
| 3   | Reverse (leader = other end)                   | Order re-derived                                                 |
| 4   | Delete marcher 6                               | OPEN S-31-a                                                      |
| 5   | Split at playhead count 12                     | Each member resumes where it stands (§4.2); motion unchanged     |
| 6   | One marcher Adjusted off the trail (collision) | OPEN S-31-b                                                      |

**Facts.** F-22, F-23.

**OPEN S-31-a.** A deleted member mid-trail: gap travels (vacant slot, spec Q-5) or closes up?
**OPEN S-31-b.** Can a trail member have an Adjust (it would break no-overtaking and
follow-the-leader's single line), or must it leave the trail (Detach)?

### S-32 Stagger / ripple along a shared path (AT staggers/ripples)

**Setup.** 4×4 block group path, 16 counts, ripple by rank: A-rank starts on 0, B on 2, C on 4, D
on 6; each rank walks the whole path and all land on count 16 (later ranks faster), or each rank
takes 10 counts and ends at 10, 12, 14, 16 (then holds).

**Expected.** R-hold within each rank, not across ranks.

| #   | Edit                             | Expected                        |
| --- | -------------------------------- | ------------------------------- |
| 1   | Change the ripple interval 2 → 1 | Ranks start 0,1,2,3             |
| 2   | Reverse the ripple (D first)     | Order flips                     |
| 3   | Reshape the path                 | Everyone follows                |
| 4   | Delete marcher B2                | B-rank still starts on 2        |
| 5   | Ripple by file instead of rank   | Order key changes, nothing else |

**Facts.** F-24 (stagger: order key + interval, or per-member delays), F-06 per member/sub-group,
F-14 (it is S-18's "whole path faster" generalised).

**OPEN S-32-a.** Ripple: all land together (faster later ranks) or same speed with staggered
arrivals? Both? (Note: staggered arrivals means members' ranges differ inside one move — I-R5.)

### S-33 A path across page flags (AT paths across page flags)

**Setup.** Group path for 8 drawn over move 3 (counts 32–48) and move 4 (48–64): one continuous
curve, page flag at 48 in the middle (the band passes set 4 on the path).

**Expected.** Continuous; on count 48 every member is exactly at its set-4 spot, which lies on its
lane.

| #   | Edit                                      | Expected                                                     |
| --- | ----------------------------------------- | ------------------------------------------------------------ |
| 1   | Drag page flag 48 → 50                    | OPEN S-33-a                                                  |
| 2   | Edit set 4 (move one member's spot at 48) | That member's path bends to meet it; others unchanged        |
| 3   | Reshape the path in move 3 only           | Continuity at 48?                                            |
| 4   | Merge moves 3 and 4                       | One group path with a pin at 48 (draft §5.2 merge)           |
| 5   | Basic: + page flag at 40 inside move 3    | Group members left alone (AP-R7 Basic note) or split exactly |

**Facts.** F-24-x (cross-flag continuity), F-03 (route ownership: one move vs both), F-07 (a page
flag inside a path acts as a pin).

**OPEN S-33-a.** Is a path across a flag one path with the flag as a pin (moving the flag retimes
the pin and set 4 lands on the path at the new count), or two paths joined at a shared point (set
4 spot fixed; moving the flag only changes speeds)?

### S-34 Mirror side 1 / side 2 (AT mirroring)

**Setup.** Block L on side 1 has a group path curving toward the front sideline; designer mirrors
it to block R on side 2 (mirror about the 50).

**Expected.** R's path is L's mirrored about `x = 0`; pins and counts same; members paired L1↔R1
etc.

| #   | Edit                            | Expected                             |
| --- | ------------------------------- | ------------------------------------ |
| 1   | Reshape L's path                | OPEN S-34-a                          |
| 2   | Adjust L3                       | R3 mirrored adjust? (follows S-34-a) |
| 3   | Detach R's path from the mirror | Independent                          |
| 4   | Undo ×3                         | Exact                                |

**Facts.** F-25 (mirror relation: axis + pairing, live or copy), F-26, F-34.

**OPEN S-34-a.** Mirror is a one-time copy (edit L doesn't change R) or a live link (Illustrator
symbol / AE expression style)? A live link means a route has two consumers with a transform (route
ownership changes).

### S-35 Copy and paste a move with a group path (AT copy/paste)

**Setup.** Move 3 (block, group path with 3 pins, B2 Adjusted, A1 Detached). Copy move 3, paste
onto move 9 where the block starts 10 steps upfield.

**Expected.** Move 9 gets its own route (new ids), lanes from the new starts (offsets re-derived,
or kept from the copy — OPEN), pins on the same counts, B2's adjustment and A1's own path carried
across relative to the new placement.

| #   | Edit                                         | Expected                                                                 |
| --- | -------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Edit move 9's path                           | Move 3 unchanged                                                         |
| 2   | Paste onto a move with fewer marchers (12)   | Missing members' lanes dropped; adjustments of absent members dropped    |
| 3   | Paste at absolute position vs relative (Alt) | Absolute: same field points (R-abs); relative: translated by start delta |
| 4   | Undo                                         | Exact                                                                    |

**Facts.** F-26, F-09 (adjustments in relative form travel), F-08, F-07.

**OPEN S-35-a.** Paste: absolute (same field coordinates, matches R-abs) or translated to the new
starts? And is member mapping by slot (lane order) or by marcher?

### S-36 Re-fit after start and end edits (AT re-fit)

**Setup.** Group path 16 counts. An earlier move is shortened so the block starts 4 steps left;
the end set is moved 2 steps forward.

| #   | Edit                  | Expected                                                                            |
| --- | --------------------- | ----------------------------------------------------------------------------------- |
| 1   | (the edits)           | Points stay; first and last legs bend; path flagged changed (derived)               |
| 2   | Re-fit                | Translation of the group path; pins untouched; adjustments kept (they are relative) |
| 3   | Re-fit on an own path | Similarity (rotate/scale/translate)                                                 |
| 4   | Undo                  | Exact                                                                               |

**Facts.** F-02 (`from`, `to`), F-28, F-09.

### S-37 Holds, stops and step sizes on a group path (AT pins/holds/step sizes)

**Setup.** Group path, 16 counts: mark time 2 at the start, a 2-count stop at the second point
(two pins on one point), double time.

| #   | Edit                              | Expected                                                    |
| --- | --------------------------------- | ----------------------------------------------------------- |
| 1   | Resize to 20                      | Holds keep counts (R-pin)                                   |
| 2   | Split inside the stop             | Trailing hold on the first half, leading hold on the second |
| 3   | Adjust one member; Detach another | Both keep the stop (adjust shares; detach copies)           |
| 4   | Change rate to triplet            | Positions unchanged; step display                           |

**Facts.** F-07, F-08 (stops), F-23, F-06.

### S-38 Basic and Expert (AT Basic/Expert)

**Setup.** Basic mode, page 4 (16 counts), group path on the block.

| #   | Edit                                                  | Expected                                                                                     |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Drag A3's dot at count 8 (R-dot)                      | New move on top over the edit window; A3 rejoins its lane afterwards (entry); path unchanged |
| 2   | Basic + page flag at count 8                          | Group split exactly, or members left alone (AP-R7 today)                                     |
| 3   | Switch to Expert; split move by marchers (A-rank out) | A-rank keeps its lanes in the new move? (AP-R6 refuses today; step 17)                       |
| 4   | Merge it back                                         | Exact (F-5 refuses formation merges today)                                                   |

**Facts.** F-20, F-03, F-34.

### S-39 Undo as one step, long sequence (AT undo)

**Setup.** Draw group path for 16 → Adjust B2 → Adjust A-rank as sub-path → Detach C1 → pin
point 2 to count 8 → set handoff at 12 → late join S at 6 → split at playhead 10.

**Expected.** Eight undo steps take the database back exactly, every id restored; eight redos
restore the same ids; resolver matches a fresh build after each.

**Facts.** F-29 (every fact in logged rows with stable ids; nothing derived stored without its
inputs).

### S-40 v0.1.7 files and today's fork files (AT v0.1.7)

**Setup.** (a) A v0.1.7 release file (pages, no routes). (b) A fork file with step 15 group paths
(model A rows: one-slot transitions sharing a route with offsets).

**Expected.** (a) Opens, plays straight lines, no route rows written. (b) Opens under the new
model; positions identical at every probe (or, per ADR 0016, fork lab files may break — but the
model must say what it migrates).

**Facts.** F-30; migration path from model A's rows to the candidate's facts.

### S-41 Shape recipes as the path (AT recipes; J-22, J-23)

**Setup.** (a) 16 marchers follow around a circle outline by 4 spots (slots trail linked to the
recipe). (b) A 4×4 box snakes forward 2 spots (snake order). (c) A group path whose end set is a
box recipe.

| #   | Edit                                  | Expected                                       |
| --- | ------------------------------------- | ---------------------------------------------- |
| 1   | (a) Circle radius +2                  | Trail follows (O-13 linked)                    |
| 2   | (a) Edit the trail by hand            | Link dropped in the same edit                  |
| 3   | (b) Change snake order rows → columns | Re-derived trail                               |
| 4   | (c) Box interval change               | End spots move; group path points stay (R-abs) |

**Facts.** F-27 (recipe link), F-22, F-12.

### S-42 Lane anchor that depends on other marchers (AT caching/invalidation)

**Setup.** Group path for 16; reference line `from` = centroid of starts, `to` = centroid of ends.

| #   | Edit                       | Expected                                                                                                                              |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Drag D4's end spot 6 steps | Only D4 changes (R-other). If `G` were a live centroid, all 16 lanes would shift by 6/16 steps and every member's cache would rebuild |
| 2   | Delete marcher D4          | Others unchanged (centroid of the remaining 15 is not re-taken)                                                                       |
| 3   | Rejoin a new marcher       | Others unchanged                                                                                                                      |
| 4   | Re-fit                     | Now centroid re-taken, all lanes move (explicit, one undo step)                                                                       |

**Facts.** F-28 (store the reference ends; never derive a lane from other marchers' live data),
F-04.

### S-43 Route ownership (AT one owner?)

**Setup.** Paths reached from more than one place: a group path across two moves (S-33), a
mirrored link (S-34), split by marchers keeping one path across two moves (draft §5.2), a
copy-linked paste (S-35).

| #   | Edit                    | Expected                                                  |
| --- | ----------------------- | --------------------------------------------------------- |
| 1   | Delete one of the moves | Path stays for the other owner; or goes with a notice     |
| 2   | Resize one move         | Refused "shared with move N" (draft §5.2) or both resized |
| 3   | Undo                    | Exact                                                     |

**Facts.** F-03 (exactly one owner, or a reference count), F-34.

**OPEN S-43-a.** One owner always (copies everywhere, I-R5 "one range per route"), or shared
routes with refcount (live mirrors, cross-flag paths)?

### S-44 Split at playhead on a group path (AT split, AP-R7)

**Setup.** S-05's pinned group path (pins 4, 6, 14), B2 Adjusted, A1 Detached, handoff at end.
Split at count 8.

**Expected.** Motion unchanged at every count (within tolerance); the first half is a group path
ending where every member is at count 8 (the group's formation then); the second half starts there;
pin 14 → second half's count 6; B2's adjustment split by path position; A1 split as its own path.
Today: **refused** (AP-R7 step 15).

| #   | Edit                           | Expected                                                                                       |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| 1   | Split at 8                     | As above; one undo step                                                                        |
| 2   | Split at 2 (inside first legs) | Every member is at a different place on its own first leg; first half = legs only? OPEN S-44-a |
| 3   | Split at 15 (inside last legs) | Same question                                                                                  |
| 4   | Undo                           | Exact                                                                                          |

**Facts.** F-06 (group time map splittable), F-05, F-09 (adjustment cut by `u`), F-13 (handoff
must land in the right half), F-07.

**OPEN S-44-a.** A cut inside first or last legs: is the half without inner points a group path
with no points (straight to each member's cut position), or does the cut snap to the nearest
inner point?

### S-45 Split by marchers and merge with group paths (AT, step 17)

**Setup.** 4×4 group path; split move by marchers: A-rank into its own move.

**Expected.** A-rank keeps its lanes exactly (same path, now in another move) — either by a copied
group path or by one path spanning two moves (S-43).

| #   | Edit                            | Expected                                          |
| --- | ------------------------------- | ------------------------------------------------- |
| 1   | Reshape the original group path | A-rank follows (shared) or not (copied)? (S-43-a) |
| 2   | Resize A-rank's move            | Refused while shared, or A-rank's path copied     |
| 3   | Merge the moves back            | One group path again                              |

**Facts.** F-03, F-34, F-11 (A-rank could become a sub-path).

### S-46 Delete a marcher on a group path

**Setup.** 4×4 group path; delete marcher B3 from the show.

**Expected.** B3's lane goes; other 15 bit-identical; reference line unchanged (S-42); the end set
has a hole (vacant slot, D-13).

| #   | Edit            | Expected                                                                               |
| --- | --------------- | -------------------------------------------------------------------------------------- |
| 1   | Undo            | B3 back with its lane, adjustment and offset exactly                                   |
| 2   | Delete 15 of 16 | Last one keeps its lane/offset (spec: a group path with one member keeps the schedule) |

**Facts.** F-36, F-04, F-28, F-29.

### S-47 Group path, then a turn (AT turns, parked)

**Setup.** A block slides along a curve (group path, move 6) then turns 90° about its centre (turn,
move 7, parked). Owner: a group that should wheel round a curve is a turn (G-1).

**Expected.** Only checks that the path facts do not need a heading/frame (slide only), so a later
turn needs no change to path storage.

**Facts.** None new; checks that F-04 is a pure translation (no rotation stored per member).

**OPEN S-47-a (parked).** A block that slides along a path **and** wheels at the same time (pivot
travelling along a drawn path, draft §3.6.8): is that a turn whose pivot follows a route?

### S-48 Drag a dot partway through a group path (P-1)

**Setup.** Group path for 16, 16 counts; playhead count 6; drag C1's dot 2 steps.

**Expected.** New move on top for C1 (edit window); the group path is unchanged; after the edit
window C1 enters its lane again (entry) and lands on its spot. Other 15 untouched.

| #   | Edit                                                | Expected                                                   |
| --- | --------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Undo                                                | Exact                                                      |
| 2   | Open C1's lane and drag its playhead marker instead | Adjust (or Detach, per O-8) with a point pinned at count 6 |

**Facts.** F-20, F-09, F-07.

**OPEN S-48-a.** Dragging a lane's playhead marker on an open **group** path (draft §5.3): does
it make an Adjust (stays owned by the group) or a Detach (today's O-8 tentative and draft §3.4)?
The owner's two-kinds answer reopens O-8.

---

## Coverage

| Requirement                                                                                        | Scenarios                                          |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Item 1 nothing                                                                                     | S-01                                               |
| Item 2 one marcher                                                                                 | S-02, S-03, S-04, S-21                             |
| Item 3 group sharing parent/shape                                                                  | S-06, S-07, S-13, S-25                             |
| Item 4 override one or many                                                                        | S-08, S-09, S-10, S-11, S-12                       |
| Item 5 checkpoints at uneven distances                                                             | S-04, S-05, S-12, S-37                             |
| Item 6 exit early                                                                                  | S-16, S-19                                         |
| Item 6.1 enter late                                                                                | S-17, S-18, S-21                                   |
| Item 7 exit and re-enter, other slot                                                               | S-19, S-20, S-27                                   |
| Item 8 nested override                                                                             | S-14, S-09                                         |
| Item 9 subset path                                                                                 | S-13, S-15                                         |
| Item 10 separate sources native                                                                    | S-25, S-26, S-18                                   |
| OA Adjust vs Detach (incl. heavy reshape)                                                          | S-08, S-10, S-11, S-12, S-14, S-48                 |
| OA handoff to destination spacing                                                                  | S-22, S-23, S-24, S-25, S-07                       |
| OA late join: cut in vs whole path faster                                                          | S-17, S-18, S-32                                   |
| OA slot swaps; follows slot or person                                                              | S-20, S-27, S-28, S-29, S-30                       |
| Earlier decisions (hold shape, slide, pins keep counts, absolute points, dot never edits, objects) | standing rules; S-05, S-06, S-04, S-02, S-48, S-47 |
| AT follow the leader / trails                                                                      | S-26, S-31, S-41                                   |
| AT staggers / ripples                                                                              | S-32                                               |
| AT across page flags                                                                               | S-33                                               |
| AT mirroring                                                                                       | S-34                                               |
| AT copy/paste                                                                                      | S-35                                               |
| AT recasting / swaps                                                                               | S-28, S-29, S-30                                   |
| AT re-fit                                                                                          | S-02, S-06, S-36                                   |
| AT pins / holds / step sizes                                                                       | S-04, S-05, S-37, S-03                             |
| AT turns (parked)                                                                                  | S-47                                               |
| AT Basic / Expert                                                                                  | S-38                                               |
| AT undo as one step                                                                                | every scenario; S-39                               |
| AT v0.1.7 files                                                                                    | S-01, S-40                                         |
| AT shape recipes                                                                                   | S-02, S-07, S-13, S-41                             |
| AT caching / centroid anchors                                                                      | S-22, S-42                                         |
| AT route ownership                                                                                 | S-33, S-34, S-43, S-45                             |
| AT split at playhead (AP-R7)                                                                       | S-02, S-04, S-12, S-15, S-16, S-18, S-24, S-44     |

---

## Fact catalogue (deduplicated)

Each fact: what must be stored (or derivable from stored facts with no new cross-marcher
dependency), and which scenarios need it. "Today (A)" notes, briefly, whether model A stores it,
for orientation only (not an evaluation).

| ID     | Fact                                                                                                                                                                                                      | Needed by                                                                                            | Today (A)                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| F-01   | **Route geometry**: ordered inner points in absolute field coordinates, each with a **stable id** and corner/smooth + tension                                                                             | all path scenarios                                                                                   | `routes.geometry`                                                                    |
| F-02   | **Drawn ends** `from`/`to` (reference ends; tangent neighbours; "changed" detection; Re-fit input)                                                                                                        | S-02, S-06, S-36, S-42                                                                               | `geometry.from/to`                                                                   |
| F-03   | **Route ownership**: which move(s)/range a path belongs to; one owner or refcount; deleted when unused                                                                                                    | S-06, S-13, S-15, S-33, S-38, S-43, S-45                                                             | one range per route (I-R5), refcount by transitions                                  |
| F-04   | **Per-member lane offset** (pure translation, field axes) from the reference line                                                                                                                         | S-05–S-09, S-13, S-15, S-17, S-23, S-24, S-25, S-42, S-46, S-47                                      | `path_params.offset`                                                                 |
| F-05   | **Group membership** of a path: the set of walkers (keyed by slot or marcher, see F-18)                                                                                                                   | S-05, S-06, S-13, S-15, S-16, S-21, S-44                                                             | transitions with `route_id`                                                          |
| F-06   | **Group time map**: one beat ↔ path-position map shared by the group (from length, pins, holds), so members pass points together; must allow **more than one** time map per path (late sub-group, ripple) | S-05, S-08, S-12, S-14, S-18, S-24, S-32, S-37, S-44                                                 | derived from route + the one range                                                   |
| F-07   | **Pins**: path position (point id) → beat offset from move start, exact fraction; owned by the group path (shared) or by an own path; page flag inside a path acts as one                                 | S-04, S-05, S-12, S-14, S-18, S-21, S-33, S-35, S-37, S-44, S-48                                     | not yet (step 5)                                                                     |
| F-08   | **Stops / holds on a path**: dwell at a point; mark time at start/end                                                                                                                                     | S-37                                                                                                 | not yet (step 14)                                                                    |
| F-09   | **Adjust override**: per member (or per slot) displacement **relative to the group path's parameter** (path position or point ids), owned by the group path, with a defined **anchor-loss policy**        | S-05, S-08, S-09, S-10, S-11, S-12, S-14, S-19, S-20, S-24, S-27, S-28, S-30, S-35, S-36, S-44, S-48 | no (any edit is Detach)                                                              |
| F-10   | **Detach**: an independent own path (copy) plus **provenance** (which group path, which offset, any adjustment) so Rejoin can restore                                                                     | S-05, S-11, S-12, S-23, S-35                                                                         | Own path copy; no provenance (Rejoin recomputes `A − R.from`)                        |
| F-11   | **Override hierarchy**: a path may have a parent path; child stored as an Adjust of the parent; depth ≥ 2                                                                                                 | S-09, S-14, S-45                                                                                     | no                                                                                   |
| F-12   | **End spots stay linked to the shape** when a member gets a path (subset path inside a multi-slot shaped transition)                                                                                      | S-02, S-06, S-07, S-13, S-41                                                                         | no: a member is broken out to a one-slot shapeless transition with a copied end spot |
| F-13   | **Spacing handoff**: where (count or path position) and over what stretch spacing changes from start-derived to destination-derived offsets; the morph rule                                               | S-07, S-22, S-23, S-24, S-25, S-28, S-30, S-44                                                       | fixed: handoff over the last leg                                                     |
| F-14   | **Destination-derived offset** (`B_m − G`, with `G` frozen) usable for lanes                                                                                                                              | S-07, S-22, S-24                                                                                     | no                                                                                   |
| F-15   | **Per-member exit**: where (count or path position) a member leaves the path, and where it goes (its own end spot in the same move)                                                                       | S-16, S-19, S-20                                                                                     | only as a takeover by another move                                                   |
| F-16   | **Per-member late entry**: join beat, join mode {cut in at the group's current position, whole path compressed}, entry length (E-2)                                                                       | S-17, S-18, S-32                                                                                     | no (a join walks straight)                                                           |
| F-17   | **Excursion / re-entry**: exit position, re-entry position, the excursion's own geometry (relative or absolute), and the **lane/slot re-entered** (may differ from the one left)                          | S-19, S-20, S-27                                                                                     | no                                                                                   |
| F-18   | **Path follows slot (vs person)**: lanes, adjustments and exits keyed by slot (D-4), with assignments the only marcher↔slot link; a way to key an adjustment by person too (S-27-b)                       | S-07, S-20, S-27, S-28, S-29, S-30                                                                   | lane = one-slot transition = one marcher                                             |
| F-19   | **Mid-move slot reassignment**: assignment ranges split at a beat inside one move; marcher ↔ slot changes without a new move                                                                              | S-20, S-27                                                                                           | not within a route move (one row per route transition)                               |
| F-20   | **Entry rule after a takeover**: aim (O-5), horizon, re-forming a group                                                                                                                                   | S-21, S-38, S-48                                                                                     | no (walks straight, D-REBASE)                                                        |
| F-21   | **Source independence**: members of one path may come from different source moves/shapes; offsets not derived from a shared source formation                                                              | S-18, S-25, S-26                                                                                     | partially (offset from own start)                                                    |
| F-22   | **Trail** (FTL): geometry, slot order along it, spacing, advance k, leader/reverse, mode (lineup/slots), connectors per source                                                                            | S-26, S-31, S-41                                                                                     | resolver only, no UI                                                                 |
| F-23   | **Steps per beat** (rate) per move                                                                                                                                                                        | S-03, S-04, S-12, S-31, S-37                                                                         | not yet (step 16)                                                                    |
| F-24   | **Stagger / ripple**: order key + interval (or per-member delay) on a shared path; arrival rule                                                                                                           | S-32                                                                                                 | no                                                                                   |
| F-24-x | **Cross-flag continuity**: a path spanning a page flag: one path with the flag as a pin, or two linked halves                                                                                             | S-33                                                                                                 | no (one move per route)                                                              |
| F-25   | **Mirror relation**: axis + member pairing; copy or live link                                                                                                                                             | S-34                                                                                                 | no                                                                                   |
| F-26   | **Copy identity**: paste makes new ids; offsets/adjustments carried in relative form; member mapping rule                                                                                                 | S-34, S-35                                                                                           | no                                                                                   |
| F-27   | **Recipe link**: path derived from a recipe (outline or snake order) and its version; hand edit drops the link                                                                                            | S-41                                                                                                 | no (O-13 decided, not built)                                                         |
| F-28   | **Frozen reference ends**: `from`/`to` stored, not live centroids, so one member's edit never moves another; Re-fit is the explicit recompute                                                             | S-06, S-22, S-25, S-36, S-42, S-46                                                                   | yes                                                                                  |
| F-29   | **Stable ids on every row and point** (routes, points, adjustments, handoffs, exits) under history triggers; one edit = one transaction                                                                   | every scenario; S-39                                                                                 | yes for routes/points/offsets                                                        |
| F-30   | **Absence = straight**: no path facts for a marcher means today's motion; v0.1.7 files need nothing                                                                                                       | S-01, S-40                                                                                           | yes                                                                                  |
| F-34   | **Several paths per move**: two or more group paths and own paths side by side in one move                                                                                                                | S-15, S-38, S-43, S-45                                                                               | yes                                                                                  |
| F-36   | **Vacancy on delete**: deleting a member leaves its slot vacant; others' lanes unchanged                                                                                                                  | S-13, S-27, S-46                                                                                     | yes (lane = its transition, deleted)                                                 |

### Facts most often needed but absent today

Ranked by how many scenarios break without them: F-09 Adjust (17), F-06 multi-time-map group
schedule (9), F-13 handoff (8), F-18 slot-keyed lanes (6), F-12 shape link kept (5), F-15/F-16/F-17
exits, late entries, excursions (3 each), F-11 hierarchy (3), F-19 mid-move reassignment (2).

## Open questions, collected

| ID     | Question                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------ |
| S-02-a | When a marcher in a shape move gets a path, does its end spot stay linked to the shape?                |
| S-05-a | Can an Adjust move a pinned point for one member and keep its count?                                   |
| S-09-a | Multi-select Adjust: independent per member, or a linked sub-group?                                    |
| S-10-a | Adjustment anchor deleted: keep at `u` / re-anchor / drop / convert to Detach?                         |
| S-10-b | Redraw ("draw it again") with adjusted members: same options; ask first?                               |
| S-11-a | Rejoin after Detach of an adjusted member: adjustment back or plain?                                   |
| S-14-a | Reset a mid-level override: grandchildren re-parent or go?                                             |
| S-14-b | Remove path on a parent with adjusted children: all go, or children promoted?                          |
| S-14-c | Nesting depth: two levels or any?                                                                      |
| S-16-a | Exits (and handoffs, excursions) stored as counts or as path positions under retiming?                 |
| S-16-b | Exit within the same move (own end spot) or as a takeover move?                                        |
| S-17-a | A cut-in joiner's lane offset: from its end spot, a designer slot, or typed?                           |
| S-18-a | Pins vs a "whole path faster" sub-group: scale, ignore, or refuse?                                     |
| S-18-b | "Whole path faster" chosen per member or per sub-group?                                                |
| S-19-a | Excursion relative (rides reshapes) or absolute (stays round a prop)?                                  |
| S-21-a | Group rejoin after a whole-group takeover: in formation or each by first fit?                          |
| S-22-a | With end-derived lanes, is `G` frozen so one end-spot drag moves only that lane?                       |
| S-23-a | With start-derived lanes, do offsets follow a changed start block (live) or stay frozen?               |
| S-24-a | What a handoff "at a point" is: morph over a leg, over typed counts; morph rule                        |
| S-25-a | Two sources on one path: on-path formation = combined start offsets, destination spacing, or arranged? |
| S-27-a | Deleting a marcher in a mid-move swap: slot vacant, or partner stays?                                  |
| S-27-b | Adjust attached to a lane (slot) or a person, and which is the default?                                |
| S-28-a | Lane follows slot or person: coupled to the handoff choice, or its own setting?                        |
| S-30-a | After reassignment, adjustments with the person or the lane?                                           |
| S-31-a | Deleted trail member: gap travels or closes?                                                           |
| S-31-b | Can a trail member be Adjusted, or must it leave the trail?                                            |
| S-32-a | Ripple: land together (later ranks faster) or staggered arrivals (ranges differ in a move)?            |
| S-33-a | Path across a flag: one path with the flag as a pin, or two linked paths?                              |
| S-34-a | Mirror: one-time copy or live link?                                                                    |
| S-35-a | Paste absolute or translated; member mapping by slot or marcher?                                       |
| S-43-a | Route ownership: always one owner (copies), or shared with refcount?                                   |
| S-44-a | Split inside first/last legs of a group path: legs-only half, or snap to a point?                      |
| S-47-a | (Parked) Sliding along a path while wheeling: a turn whose pivot follows a route?                      |
| S-48-a | Dragging a lane's playhead marker on an open group path: Adjust or Detach (reopens O-8)?               |
