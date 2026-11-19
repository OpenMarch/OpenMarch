---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: follow-drag
title: "Follow by dragging out a trail (pathways, step 4b)"
summary: "Step 4b of pathways: select marchers standing in a line, curve or arc, press Shift+L, and drag a trail out of either end. The line follows its leader along it, and where it stops becomes the next page's spots, in one undo step."
status: open
variants: []
questions:
  - "Select a line of marchers and press Shift+L. Drag a trail out of one end, add a corner, and finish. Was it clear where to press and who leads?"
  - "Select only the right three of a line and drag from the inner one (the end that's in the middle of the old line). Did that marcher lead, with the other two following through its start?"
  - "Select every other marcher of a line and drag out a trail. The others stay where they are, so the line walks through them and the collision warning shows. Is that what you expected? Would you want a side-step offered instead?"
  - "Try Keep spacing, then Even with a few different step counts. Which did you want most often? Was the 'up to' limit on Even clear?"
  - "Drag out a trail shorter than the line. The back of the line stays on the old line, moved along it. Is that where you expected them to end?"
  - "After finishing, drag a point of the trail, then move one marcher's end spot. Editing the trail only changed how they walk, and moving a spot only changed that marcher. Is that the right split between the two?"
  - "On a page where the line already has end spots, switch the bar's Ends between From trail and Keep end spots. Is it clear which one you're getting before you finish?"
  - "Anything else about dragging out a trail you'd change?"
---

**What's new**

- **The Follow tool drags a trail out of a line.** Select marchers standing in a line, a
  curve or an arc and press **Shift+L** (or the Follow button by the Path pen). The rings
  on the line's two ends pulse.
- **Press an end and drag** the first leg out of it; that marcher leads. Then click for
  corners as with the Path pen. **Double-click** or **Enter** finishes, **Backspace**
  takes the last point back, **Escape** cancels the drawing, and a second **Escape**
  leaves the tool.
- **Where the line stops becomes the next page's spots.** While you draw, the spots
  where everyone will end are shown, and the move is exactly what plays afterwards.
- **Spacing** on the bar: **Keep spacing** (each marcher keeps its distance to the next
  along the way: every other marcher of a 2-step line ends 4 steps apart) or **Even**
  N steps. Even goes only as wide as keeps everyone walking forward, and shows that limit.
- **Ends**, when the line already has spots here: **From trail** (the default) or
  **Keep end spots**, which follows the trail into the spots they had (step 4's Follow).
- Past the last page, a page is added at the playhead first. All of it is one undo step.
- Marchers in the middle of the selection take no press in the tool; outside it,
  dragging marchers works as before.
- After finishing, the spots are ordinary spots: drag a trail point and only the walk
  changes; move a spot and only that marcher ends somewhere else.

**Try it**

1. Select six marchers in a line, two steps apart. Press **Shift+L**.
2. Press the right end and drag 10 steps right; click 10 steps up; double-click.
3. Press **Space**. Then undo, and try **Even** 1 step instead.
4. Select the right three only and drag from the inner one.
5. Try it with a finger or pencil on a tablet.

**Good to know**

- Follow says why it can't start **before** you draw: marchers not in a line, curve or
  arc ("a free pick" is later), a marcher with a drawn path, or one already on a trail.
- The marchers' starts are where they stand at the start flag; the move fills the window
  between the start flag and the playhead.

**Not in this step, on purpose**

- **Arc legs** (bending a leg of the trail into a true arc) are step 10a.
- Dragging the end spots' preview before finishing isn't in yet: edit the spots after.
- The written spots don't open as a Line in the shape tools yet (the Line tool draws
  first; there's no "open these marchers as a line" to fit them with).
