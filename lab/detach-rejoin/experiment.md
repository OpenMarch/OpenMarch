---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: detach-rejoin
title: "Path editing, step 3c: one line per marcher, Edit a marcher's line, Detach and Rejoin, only shapes keep a group path (pathways)"
summary: "Step 3c of pathways, now the whole path interaction from the MVP rounds. Marchers are the only selection, and one line shows for what you selected: each selected marcher's own line, faint until you edit it, or with the whole group selected just the group path, deep. A small bar beside it keeps its buttons in place: Edit group path, Edit <marcher>'s line (bend one marcher's line by its handles, still linked to the group path), and Match group, or Rejoin for detached marchers. Detach from group path, and Detach all for the whole group, are under the bar's ··· menu. Only a placed shape keeps a group path: a path drawn for marchers you picked by hand is saved as each marcher's own path, and selecting the same marchers again edits them together."
status: open
variants: []
questions:
  - "Pick a few marchers by hand (click one, Shift-click two more; not a placed shape) and draw a path for them with P. A toast says 'Saved as 3 separate paths. Group the marchers to keep them linked.' Was it clear what that means for you?"
  - "Click empty field, then select the same marchers again. Their line shows as Path · 3 with Edit path on the bar. Edit it and drag a point: all three follow. Did you expect that, after the toast said they're separate?"
  - "Now select only one of those marchers and edit its path. Then select all three again: they no longer share one line. Is that what you expected?"
  - "Make a placed shape of some marchers (select them, then Ctrl+G or ⌘G) and draw a path for it. This one says Group path and stays linked. Is the difference between a shape's group path and hand-picked marchers' paths clear?"
  - "Draw a group path for a block, select one member, open ··· on the path bar and choose Detach from group path. Its copy opens and the bar offers Rejoin. Did anything on the field move? Was it clear that the open path is now that marcher's own?"
  - "Detach isn't on the path bar any more: it's under ··· as Detach from group path, and Edit <name>'s line changes one marcher's line while it keeps following the group. Did you go looking for Detach on the bar? Was Edit <name>'s line what you wanted most of the time?"
  - "Drag a point of the detached copy, then play the move. Only that marcher's walk changed, and it still reaches each point of its copy on the group's counts. Is that what you expected from 'keeps the group's timing'?"
  - "Select the whole block again. The detached marcher has an orange 'Detached' ring and the bar offers Rejoin. Press it. The marcher goes back to its place on the group path, and its copy is gone. Did the word Rejoin fit?"
  - "Select one member and press Edit <its name>'s line (for example Edit T15's line). Its handles show at once. Was it clear what to drag? Bend it, then Detach it (··· › Detach from group path), then Rejoin it. The bend is dropped on Rejoin (decided: Rejoin always drops it). Press Undo: is it clear the bend came back?"
  - "Select the whole block (or click its placed shape). Only the group path is drawn, deep, named Group path · 16, plus a faint line for any bent or detached marcher. Click the line: its points show. Is it clear this one line moves the whole block? Do you miss seeing every marcher's own line?"
  - "Select one or a few members instead. Each one's own line is drawn faint, and only the line you edit is deep. Can you still read where each marcher goes?"
  - "Select the whole block and open ···. Instead of Detach from group path it offers Detach all 16 marchers, with 'Ends the group path' under it. Was it clear that Detach all ends the group path?"
  - "Run Detach all 16 marchers from ···, then Undo once. Did the toast ('Group path ended: 16 marchers have their own paths') say how big that was? Did it feel like one step both ways?"
  - "After Detach all there is no group path left to Rejoin, only Undo. Would you rather the group path stayed (empty) so they could rejoin it later?"
  - "Anything else about Detach and Rejoin you'd change?"
---

**What's new**

- **Only a placed shape keeps a group path.** Draw a path for marchers you picked by hand
  (not a placed shape) and it's saved as **each marcher's own path**, all the same shape. A
  toast says **Saved as 3 separate paths. Group the marchers to keep them linked.** Nothing
  is left linking them, so there's no group path to find again later. Select the same
  marchers again and their paths show as one line, named **Path · 3**, with **Edit path**
  on the bar: edit it and they all follow, and the edit is saved as their own paths again.
  Once one of them is edited alone, the others no longer share its line. There's no Match
  group, Detach or Rejoin for them (the bar's third slot stays empty, so the buttons don't
  move). To keep marchers linked, make them a shape first (select them, then **Ctrl+G** or
  **⌘G**): a shape's path is a **Group path**, as before. Each edit, and its Undo, is one
  step. Nothing happens when you deselect.
- **Detach moved off the bar, into ···** (as a design tool keeps Detach instance in a
  menu). The bar is now **Edit group path · Edit T15's line · Match group · ···**. To
  change one marcher's line and keep it following the group, use **Edit T15's line**. To
  break a marcher off the group path, open **···** and choose **Detach from group path**
  (**Detach 3 from group path** with several selected), with "Stops following group path
  changes" under it. The right-click Path menu has it in the same place; the palette keeps
  it too. The third slot is the "back to the group" slot: with detached marchers selected
  it says **Rejoin** (**Rejoin 3**), otherwise **Match group**.
- **Detach** replaces **Own path** for a member of a group path. Select one or more
  members of a group path (the path shows, quiet or being edited) and choose **··· ›
  Detach from group path**. Each gets its own copy of the path. It is also in the field's
  right-click and long-press menu (the Path group) and the command palette.
- **One line for what you selected.** With the whole group selected (a box round the
  block, or its placed shape), only the group path is drawn, deep, named **Group path ·
  16**: no line per marcher. A bent or detached marcher keeps a faint line of its own.
  Clicking the group line shows its points (Edit group path); the faint lines don't take
  that click. With one or a few members selected, each one's own line shows instead.
- **One way to work a path.** Marchers are the only selection: clicking a path's line
  selects the marchers who walk it and shows its points at once (no double-click).
  Selecting marchers by their dots shows the line each one walks, whatever the Paths
  setting (it is for the marchers not selected), drawn faint: only the line you are
  editing is deep. A small bar beside it keeps its buttons in the same places: **Edit group
  path · Edit T15's line · Match group** (or **Rejoin**) **· ···** (for a marcher
  with a path of its own, the first button is **Edit path**). A button that can't act is
  greyed out and says why. **Escape** goes back to quiet, then deselects; **Enter** shows
  the group path's points.
- **Edit T15's line** (named for the selected marcher) shows only that marcher's line with
  its handles at once: squares for its bends, small circles where a new bend can be
  dragged out. A bend stays linked to the group path. **Escape** or a click on empty field
  leaves it, as with Edit group path. **Match group** takes the bends off. **Edit group
  path** shows the group path's middle line, named **Group path · 16**, and of the
  members' lines only the bent ones, faint: a plain member's line is the group line moved
  over. To bend a plain member's line, select it and press **Edit T15's line**.
- **The path bar stays clear of a placed shape's bar.** With a placed shape selected, the
  path bar sits under the shape's own bar (its size, spacing and Grid row) instead of
  over it, and it stays in the same place between the quiet group path and Edit group
  path.
- **Nobody moves.** The copy is the group path exactly, and the marcher keeps its place
  and any bends it had, so it walks exactly as before, passing each point on the
  group's counts, until you edit the copy (or the group path).
- With one member detached, **its copy opens** for editing, drawn where that marcher
  walks it. Edit it like any path: drag, add or delete points, Corner or Smooth.
  Editing the copy never moves the group, and editing the group path never moves
  the detached marcher.
- **Rejoin** puts a detached marcher back on the group path it came from, in its place
  in the group, also after its copy or the group path was edited. Its copy goes, and so
  do any bends on its line (decided: Rejoin always drops them). Undo brings both back.
  Rejoin takes the bar's third slot when only detached marchers are selected; selected
  with members of the group, Rejoin is under **···** and their start rings say
  **Detached**. In the palette they are **Detach from group path** and **Rejoin group
  path**.
- **Detach all is apart.** With the whole group selected, **···** offers **Detach all 16
  marchers** instead of Detach from group path. It sits beside **Remove path**, after a
  line, with "Ends the group path; each marcher gets their own copy" under it (also in
  the right-click menu and the palette). The toast after it says **Group path ended: 16
  marchers have their own paths**, with Undo.
- Detach, Detach all, Rejoin and their undo are one step each.

**Try it**

1. Pick three marchers by hand (click one, Shift-click two more), press **P**, click once
   and press **Enter**. The toast says **Saved as 3 separate paths**. Click empty field,
   then select the same three again: their line shows as **Path · 3**. Press **Enter** and
   drag a point: all three follow. Press **Undo** once: the point goes back. Then select one
   of them alone and edit its path; select all three again: they no longer share a line.
2. Select a placed shape of 16 (or make one: select a block, then **Ctrl+G** or **⌘G**),
   draw a group path through it with **P**, and finish. It's a **Group path**, linked.
   Click one member's dot: only that marcher's line shows, faint, with the bar beside it:
   **Edit group path · Edit T15's line · Match group · ···**. Click another member: the
   buttons stay in the same places.
3. With one member selected, press **Edit T15's line** (its name is on the button). Only
   its line shows, with handles right away: drag a small circle, or a square, somewhere
   between the group path's first and last points, then press **Escape**. The bent line is
   drawn blue. With that marcher selected, **Match group** takes the bend off. The parts
   that run from the marcher's start onto the group path, and off it to the end spot, have
   no handles: they only join the group path.
4. Drag a box round three members (or click one dot, then Shift-click two more). Edit
   marcher's line is greyed out ("Select one marcher to edit their line"). Open **···**: it
   has **Detach 3 from group path**. Choose it: a toast says **3 marchers detached** with
   Undo, nothing moves, the group line stays where it was, the three stay selected, and the
   bar's third slot now says **Rejoin 3** where Match group was. Their start rings turn
   dashed orange.
5. Click one detached marcher's dot: its copy shows. Click the copy's line to edit it, drag
   a point, and play the move with **Space**.
6. Right-click (or long-press) the detached marcher: the menu's Path group is in the bar's
   order and has **Rejoin group path**. Choose it, then **Undo**.
7. Drag a box round the whole block (or click its placed shape): only the group path shows,
   deep, named **Group path · 16**, with the detached and bent marks on their dots and a
   faint line for each of those marchers. Click the group line: its points show. Drag a
   point to reshape the whole group. With a placed shape, its bar and the path bar sit
   one under the other.
8. With the whole block still selected, open **···**: **Re-center group path** (greyed out
   unless the block has moved since the path was drawn), then after a line **Detach all 16
   marchers** and **Remove path**. Choose Detach all: a toast says **Group path ended: 16 marchers
   have their own paths** with **Undo**. Undo it, then Remove the path: a toast offers
   **Undo**.
9. Big steps, when a path asks for them, show in the inspector under Step Size, not on the
   bar.
10. Try it with a finger or pencil on a tablet: every one of these is a button on the bar or
    an entry in the long-press menu; a press on a greyed-out button says why.

**Good to know**

- A group path drawn for hand-picked marchers before this build stays one until you edit
  it; that first edit saves it as their own paths (with the toast). Marchers you make into
  a shape after their paths were saved separately show **Path · N** until you edit their
  line; that edit links them as the shape's **Group path**.
- **Own path** is still the word for one marcher's own drawn path (P with one marcher
  selected). Drawing over a detached copy with P from that marcher alone draws a new path
  of its own, as before.
- A detached copy keeps the group path's start and end it was drawn against, so the copy
  is timed like the group. **Re-fit path** (under ···) acts on a copy only when its
  marcher's start has moved, and then only moves the start side.
- **Split at the playhead** is refused on a move with a group path, and now also on a
  detached copy of one (it walks the group's timing); remove the path first. Splitting a
  group path is a later step.

**Not in this step, on purpose**

- A straight move (no path yet) has nothing to grab: draw its first path with **P**.
- No live link between a copy and its group path (decided: copies now, links later). An
  edit of the group path after Detach doesn't reach the copy.
- Detach all leaves no group path to Rejoin; Undo brings it back.
- Rejoin puts a marcher in its place on the group path when no Re-fit is pending there.
  If another member's start moved since the group path was drawn, and you then move the
  group path's first point, the rejoined marcher can land a little off; Re-center first.
- Linked bends for several members at once (and detaching such a sub-group with
  one shared copy) are step 26.
