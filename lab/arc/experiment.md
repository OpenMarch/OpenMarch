---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: arc
title: Arcs of marchers, on a circle or an ellipse
summary: A new Arc shape. Drag it end to end, stretch it like a box (onto an ellipse), set its degrees in the editor, and close it by its chord or all the way around.
status: open
questions:
  - Did stretching the arc by its ends and middle feel like stretching a box?
  - Was setting the degrees from the editor enough, or did you want a handle for it on the field?
  - Did the arc's size numbers (width × depth of the arc itself) tell you what you needed?
  - Was spacing the arc side to side (↔) useful, for example for teaching?
  - Did the stretch number (1× circle, 1.3× tall or wide) make sense?
  - Did closing (with a straight line, or all the way around) do what you expected?
---

Select some marchers, open the **Shapes** tab and pick **Arc** (after Curve).

**What to try**

- Drag on the field from one end to the other. The arc bows a quarter turn
  to the left of your drag.
- Drag an end to stretch the arc side to side, and the handle in its middle
  to stretch it front to back. The other side stays put; Alt stretches from
  the center and Cmd/Ctrl keeps its proportions. Stretched one way only, it
  runs on an ellipse. A handle catches on the yard lines, hashes and
  sidelines it passes, as a box's edge does.
- Set how far it turns with the degrees in the editor (drag or type). Up to
  a half circle (180°) its ends stay put and its middle moves, so the end
  marchers keep their distance. Past 180° the dashed circle stays put and
  the arc wraps further around it. Dragging the degrees lands the middle
  handle on half steps and catches it on hashes.
- Angle lines run from the circle's center out through the arc's ends and
  across the field, so its angle is easy to see. The editor's **Guides**
  menu shows or hides the circle and the angle lines, each on its own.
- Try **Measured → ↔ Side to side**: each marcher sits an even number of
  steps apart side to side, which is easy to read off the yard lines. Their
  side-to-side spots stay put as you change the degrees (up to 180°).
- The editor also shows the room the arc takes ("60 × 30 steps": how far it
  reaches side to side, and how deep it is from its ends to its far edge).
  Up to a half circle the first number is the distance between the two end
  marchers. Both change as you change the degrees; drag or type either. The
  lock after them keeps the two in proportion, for the handles too (Cmd/Ctrl
  frees them for one drag).
- The editor always says how stretched the arc is: "1× circle", "1.3× tall"
  or "1.3× wide". Drag or type it: type 1 for a circle, or 1.4 on a circle
  to make an ellipse. In Fit
  the ends stay and the interval follows; in Keep interval the interval
  holds and the ends move.
- Try **Open or closed**: **Close with a straight line** and fill it with
  **Grid**, or close it all the way around.

**Good to know**

- The arc's spacing, interval groups and Who goes where work as on a Line.
- Grid fill of a half-moon is a plain grid for now; staggered fills come later.
