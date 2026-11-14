---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: detach-rejoin
title: "Detach and Rejoin a group path's members (pathways, step 3c)"
summary: "Step 3c of pathways: select a member of a group path and press Detach. It gets its own copy of the path and keeps walking in step with the group, without anybody moving, until you edit the copy. Rejoin puts it back on the group path."
status: open
variants: []
questions:
  - "Draw a group path for a block, select one member and press Detach on the path bar. Its copy opens. Did anything on the field move? Was it clear that the open path is now that marcher's own?"
  - "Drag a point of the detached copy, then play the move. Only that marcher's walk changed, and it still reaches each point of its copy on the group's counts. Is that what you expected from 'keeps the group's timing'?"
  - "Select the whole block again. The detached marcher has an orange 'Detached' ring and the bar offers Rejoin. Press it. The marcher goes back to its place on the group path, and its copy is gone. Did the word Rejoin fit?"
  - "Adjust one member's lane (drag its lane on the open group path), then Detach it, then Rejoin it. The adjustment is dropped on Rejoin (decided: Rejoin always drops it). Press Undo: is it clear the adjustment came back?"
  - "Select all 16 members and press Detach once, then Undo once. Did it feel like one step both ways?"
  - "After detaching every member there is no group path left to Rejoin, only Undo. Would you rather the group path stayed (empty) so they could rejoin it later?"
  - "Anything else about Detach and Rejoin you'd change?"
---

**What's new**

- **Detach** replaces **Own path** on the path bar for a member of a group path. Select
  one or more members of a group path (the path shows, quiet or being edited) and press
  **Detach**. Each gets its own copy of the path. It is also in the field's right-click
  and long-press menu (the Path group) and the command palette.
- **One way to work a path.** Marchers are the only selection: clicking a path's line
  selects the marchers who walk it and shows its points at once (no double-click).
  Selecting marchers by their dots shows their path quiet, with a small bar (Edit path,
  Detach, Rejoin or Reset adjustment, Remove path). **Escape** goes back to quiet, then
  deselects; **Enter** shows the points.
- **Nobody moves.** The copy is the group path exactly, and the marcher keeps its place
  and any adjustment it had, so it walks exactly as before, passing each point on the
  group's counts, until you edit the copy (or the group path).
- With one member detached, **its copy opens** for editing, drawn where that marcher
  walks it. Edit it like any path: drag, add or delete points, Corner or Smooth.
  Editing the copy never moves the group, and editing the group path never moves
  the detached marcher.
- **Rejoin** puts a detached marcher back on the group path it came from, in its place
  in the group, also after its copy or the group path was edited. Its copy goes, and so
  does any adjustment on it (decided: Rejoin always drops it). Undo brings both back.
  Rejoin shows when a detached marcher is selected on its own, or with the group, where
  its start ring and the bar say **Detached**. In the palette they are **Detach from
  group path** and **Rejoin group path**.
- Detach, Rejoin and their undo are one step each, also for all 16 members at once.

**Try it**

1. Select a block of 16 on a page, draw a group path through it with **P**, and finish.
   The path stays drawn, quiet, with a small bar beside it: **Edit path**, **Detach 16**
   and **Remove path**.
2. Drag a box round three members (or click one dot, then Shift-click two more). The bar
   now says **Detach 3**. Press it, and watch that nothing moves. Their rings turn dashed
   orange: **Detached**.
3. Click one detached marcher's dot. Its copy shows, with **Detached · Rejoin** on the bar.
   Click the copy's line to edit it (one click shows the points; no double-click), drag a
   point, and play the move with **Space**.
4. Right-click (or long-press) the detached marcher: the menu's Path group has **Rejoin
   group path**. Choose it. Then **Undo**.
5. Click one member's dot, then the group path's line: its points show (the selection
   stays that one member; with nobody selected, a click on the line selects them all). Drag
   a member's lane to bend it, then press **Escape** (the path goes quiet). With that marcher
   selected, the bar's slot reads **Reset adjustment**; the bent lane is drawn blue whenever
   the group path shows.
6. Select all 16, press **Detach 16**, then **Undo** once.
7. Click the group path's line, then press **Delete**: the path goes, and a toast offers
   **Undo**.
8. Try it with a finger or pencil on a tablet: every one of these is a button on the bar or
   an entry in the long-press menu.

**Good to know**

- **Own path** is still the word for one marcher's own drawn path (P with one marcher
  selected). Drawing over a detached copy with P from that marcher alone draws a new path
  of its own, as before.
- A detached copy keeps the group path's start and end it was drawn against, so the copy
  is timed like the group. **Re-fit** shows on a copy only when its marcher's start has
  moved, and then only moves the start side.
- **Split at the playhead** is refused on a move with a group path, and now also on a
  detached copy of one (it walks the group's timing); remove the path first. Splitting a
  group path is a later step.

**Not in this step, on purpose**

- A straight move (no path yet) has nothing to grab: draw its first path with **P**.
- No live link between a copy and its group path (decided: copies now, links later). An
  edit of the group path after Detach doesn't reach the copy.
- Detaching every member leaves no group path to Rejoin; Undo brings it back.
- Rejoin puts a marcher in its place on the group path when no Re-fit is pending there.
  If another member's start moved since the group path was drawn, and you then move the
  group path's first point, the rejoined marcher can land a little off; Re-fit first.
- Linked adjustments for several members at once (and detaching such a sub-group with
  one shared copy) are step 26.
