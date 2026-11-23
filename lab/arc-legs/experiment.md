---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: arc-legs
title: "Arc legs on paths and trails (pathways, step 10a)"
summary: "Step 10a of pathways: any leg of a path, a group path or a trail can be a true circular arc. Right-click a leg and choose Arc, then drag the handle at the arc's middle to make it rounder or flatter, up to a half circle. Straight makes it a line again."
status: open
variants: []
questions:
  - "Open a path, right-click a leg and choose Arc. Is the arc you get a good starting point?"
  - "Drag the handle at the arc's middle. Was it clear what the handle does, and which way makes it rounder?"
  - "Drag it toward a half circle. Did it settle on the half circle when you wanted it to? Hold the fine key (Shift by default) and try again: could you place it where you wanted?"
  - "Play the move. Do marchers walk the arc the way you expected, at an even speed?"
  - "Try Arc on a group path's leg and on a trail's leg. Did every marcher bend the same way?"
  - "Right-click a point next to an arc. Smooth is greyed out with a reason. Was the reason clear? Would you rather Smooth had turned the arc back into a curve?"
  - "Add a point in the middle of an arc (right-click the arc, Add point here). Did the two halves stay on the same circle, as you expected?"
---

**What's new**

- **Arc.** Right-click a leg of an open path (or tap and hold it on a tablet): the menu is
  now **Straight | Curved | Arc**. **Arc** bends the leg into a circular arc a quarter as
  deep as it is long.
- **The arc's handle.** An arc shows a round handle at its middle, on a short bar from the
  middle of the straight line between its ends. Drag it to make the arc rounder or
  flatter, or pull it across to bend the other way. It stops at a half circle, and settles
  onto the half circle when you get close. Hold the fine key (**Shift** by default) to place it
  freely.
- **Straight** makes an arc a straight leg again.
- **It works the same on a path, a group path and a trail.** On a group path every
  marcher's lane bends the same way, and each marcher's legs onto and off the path keep
  the arc too.
- **A point at an end of an arc is a corner.** Smooth is greyed out there with the reason,
  in the right-click menu and on the path bar. Curved on the leg beside an arc is greyed
  out the same way.
- **Add point here** on an arc puts a corner at its middle and keeps both halves on the
  same circle. Deleting a point next to an arc makes the joined leg straight.
- Marchers walk an arc at an even speed, measured exactly along the circle.
- Each change is one undo step.

**Try it**

1. Draw a path with two or three corners. Open it (double-click its line).
2. Right-click a leg and choose **Arc**. Drag the handle at its middle. Press **Space**.
3. Drag the handle close to a half circle, then hold **Shift** (fine) and drag again.
4. Right-click the arc and choose **Add point here**.
5. Do the same on a group path and on a trail.
6. Try it with a finger or pencil on a tablet.

**Good to know**

- A file is saved as version 14 once a path has an arc; older builds refuse it.
- Re-fit keeps every arc as it is (it stretches with its ends).
- Splitting a move at the playhead in the middle of an arc keeps each half on the circle.

**Not in this step, on purpose**

- **Following the shape a line stands in** (an arc of marchers following itself) is
  step 10.
- **Dragging a trail out of a line** (step 4b) is built separately.
- Arcs on the move card's own Arc style are unchanged.
