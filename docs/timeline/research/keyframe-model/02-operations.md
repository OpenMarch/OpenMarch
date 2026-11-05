<!-- cspell:disable -->

# Keyframe operations under each definition

For each operation this note lists what it does today, then what K1, K2 and K3 (see the
[README](README.md)) imply for it.

Some terms used throughout:

- `m` is one marcher.
- `E` is `m`'s row that ends on the count.
- `N` is `m`'s row that starts on the count.
- "previous keyframe" is `m`'s latest keyframe before the count. Beat 0 (the home) always exists,
  so there is always one.

## Add keyframe

- **Today:** there is no "add keyframe" action. A designer adds one by moving a marcher on the
  count, which writes a row ending there (Expert E2, Basic F1/F2 in
  [01-write-paths.md](01-write-paths.md)).
- **The gap:** a marcher who should stay put but be keyed can only get **Keep** (a whole page box,
  marked kept, `db-functions/timelineKeepHere.ts:142`) or **Add selected marchers** (a whole range).
  Neither works mid-page, and K1 hides both.
- **K1:** an add that doesn't move the marcher can't make a keyframe at all.
- **K2/K3:** "Add keyframe" on a holding marcher at count `b` writes a zero-motion row ending at
  `b`.
  - It starts at the previous keyframe, so no start keyframe appears.
  - In a move, it is Basic's split (F2) with the point unchanged: the row splits at `b` and both
    halves keep the motion. This is After Effects' and Blender's "insert a key on the curve".
  - Blender's "Only Insert Needed" is the opposite default, which skips keys that don't change
    anything (see [03-prior-art.md](03-prior-art.md)). Owner question 1 decides which way to go.

## Remove keyframe

| Variant                           | Today (#332)                                                                     | K1                                                       | K2                                                                                            | K3                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Hold instead** (today's Remove) | delete `E` (`db-functions/timelineUnset.ts:76-101`), plus stays on the next page | as today; a diamond at a steal does nothing              | as today; the result (a hold, then a faster move) leaves nothing on the timeline at the count | the count becomes a start keyframe, so what changed is visible           |
| **Rejoin** (Q2)                   | Basic tick remove only (`db-functions/timelinePointMoves.ts:514-540`)            | needs a row-level target that K1 doesn't give at a steal | delete `E`, then `N.start := E.start`; with no `N`, see owner question 3                      | as K2; also **remove a start keyframe** = `N.start :=` previous keyframe |
| **…Pages N–M follow back**        | delete `E`, no stays                                                             | as today                                                 | as today; under rejoin it is needed only when nothing follows `E`                             | as K2                                                                    |

What rejoin has to deal with:

- **Layers:** a rejoined `N` starts earlier, so its derived layer can change (L-3: a later start
  wins). The layer module re-derives layers after every edit (ADR 0008 amendment 2026-10-16), so
  this is automatic, but it can change who wins where `N` now overlaps another move.
- **Path styles:**
  - Direct is exact.
  - An arc now spans a longer chord. Its bulge is relative, so the curve changes shape.
  - Follow-the-leader can't be rejoined per member, because founders are rows whose span starts at
    the transition's start (spec R-3).
  - The owner said on 2026-10-19 that arcs are deprecated and pathways will be redone
    (`db-functions/timelineSplitAtBeat.ts:57-61`), so direct-only first is reasonable.
- **Kept rows:** if `E` or `N` is kept, Basic's merge keeps the result kept
  (`timelinePointMoves.ts:263-266`). Under K2/K3 that only matters for display.
- **Shared `N`:** see "Shared moves" in the README.
  - The cheap path is to peel `m` out, as `timelineSplitMoves.ts:314-327` does.
  - With every member selected, it becomes a merge in time.
- **Basic at a flag:** rejoining makes the move cross the flag, which Basic locks. Basic's
  options are refuse, smooth through, or hold (README, Basic mode).

## Retime: drag a keyframe

- **Today:** you can't drag a diamond (#300, "Dragging a diamond is not included"). Retiming
  means:
  - resizing a move's edge (`db-functions/timelineResize.ts:438`), which moves **every member's**
    keyframe;
  - dragging a page flag, which moves every keyframe on it (UI-16);
  - or a clip drag (`db-functions/timelineCommands.ts:94`).
- **K2/K3:**
  - Dragging one marcher's position keyframe changes `E.end_beat` and `N.start_beat` together:
    the boundary moves, and the motion on both sides re-times.
  - For a row that spans a shared transition, that is the whole group's resize, unless `m` is
    peeled out first. A group-wide drag is a resize; a drag with part of the group selected
    peels them first (owner question 5).
  - Dragging a start keyframe (K3) moves only `N.start_beat` inside `N`'s transition. Inside the
    transition it is a **join** (spec R-3), so there's no peel; earlier than the transition's
    start it needs a peel. This is the one keyframe drag that a group row allows per marcher.
- **Snapping:** keyframes on page flags would snap to flags. Moving a keyframe off a flag leaves
  the flag held under K2, so a later page follows the new keyframe.

## Split

- **Split at playhead** (`timelineSplitAtBeat.ts`) adds a keyframe at the cut for every member.
  - Under K1 a member holding or walking nowhere gets no diamond; under K2/K3 every member does
    (a hold keyframe for those standing still).
  - This is "insert key on the curve". Its exact inverse is **rejoin with every member selected**.
- **Basic's split at a new flag** (F6 in 01) is the same thing done on the designer's behalf
  whenever a page is added (owner question 6).
- **Split by marcher** (`timelineSplitMoves.ts:185`) changes membership, not keyframes, under
  every definition.

## Merge

- **Merge moves** (`timelineSplitMoves.ts:398`) joins memberships, and fits the source to the
  target's counts first.
  - The fit retimes the source's keyframes (end) and can create start keyframes (a later start).
  - Under K3 the toast could say so.
- **Merge in time**, the inverse of Split at playhead, doesn't exist. Under Q2 it is Remove
  keyframe with the whole move selected.
  - Its precondition is that the halves meet at the count and have the same membership and path
    style.
  - It is the only rejoin that never needs a peel.

## Pass-through

- A window drag that passes page flags overrides the marcher's page moves inside it (UI-10,
  research/ownership/10). The passed flags lose their keyframes, and the toast "Page 3 is no
  longer a keyframe" says so.
- **Keep Page N as a keyframe** (`timeline/timelinePassThrough.ts:171` →
  `db-functions/timelineMoves.ts:1044`) restarts the window's move at the last flag inside.
- **Under K2/K3** the passed page moves are hidden lower layers: their ends aren't visible, so
  they aren't keyframes.
- **Under K3** the window's start is a start keyframe when it's mid-page, and Keep Page N's
  restart puts the start on the flag, where it coincides with the flag's keyframe.
- **Under K1** the hidden page move's cut is counted (finding 3 in the README), so a passed flag
  can still show a diamond at the window's start. Remove can't act on it.

## Move them too

- **What it does:** after an edit carries some marchers into a later page while others keep their
  own move there, the toast offers to shift those own moves by the same amount
  (`timeline/timelineMoveThemToo.ts:112-207` → `db-functions/timelineMoves.ts:1280`).
- **Which moves it offers:** any later own move ending on a flag. It skips only kept and
  shape-backed transitions (:207).
- **The new case:** since 272f83526, Remove keyframe's stays are unmarked, so they are offered.
  Shifting one undoes the reason it was written, which was to keep the next page where it was.
  Kept spots never had this problem.
- **K1:**
  - It can offer a stay that has no diamond, because a zero-motion stay is Following.
  - It can make a moving stay zero-motion, which turns it into an invisible pin (README
    finding 10).
- **K2/K3:** every own move it offers is a keyframe the designer can see. The open question is
  only whether Remove's stays should be marked kept (README owner question 13).
- **Rejoin interaction:** under Q2, Remove at a keyframe with a later keyframe writes no stay. So
  this case remains only for "nothing follows" removals.

## Copy and paste

- **Today:** none. There is no clipboard for marchers, moves or keyframes in `src/`. The nearest
  things are Set to previous/next page (`utilities/setMarchersToNeighborPage.ts`) and Move them
  too.
- **K2/K3 make it definable:**
  - Copying a keyframe copies `(count offset, position)` per marcher.
  - Pasting at count `b` is "Add keyframe at `b`, then set its position". It splits a move or a
    hold exactly as Add does.
  - A copied start keyframe has no position, so it pastes as a retime only.
- **K1 can't copy a hold keyframe,** because it has none.

## Undo

- Every operation above is one `transactionWithHistory` step (`db-functions/history.ts:112`), and
  undo replays the row changes exactly (ADR 0008 §3). Keyframes are derived from rows under every
  definition, so undo restores them for free.
- **Kept markers** are re-inserted before their assignment on undo, which is safe because no
  trigger reads them (ADR 0008 amendment 2026-10-09). This doesn't change.
- **A peel** (shared-move rejoin) adds a timeline, a transition, an assignment and a destination,
  and may compact the source. Compaction moves another marcher's slot index
  (`db-functions/timelineMembership.ts:530-588`). Undo restores it, but the focus and history
  labels should name the peel.
- **Resolver cost:** a rejoin writes at most two rows per marcher. A group peel writes one
  transition per marcher unless the selection shares one new multi-slot transition, which is the
  lead in the README.
