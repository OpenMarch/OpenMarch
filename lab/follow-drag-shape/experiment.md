---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: follow-drag-shape
title: "A dragged-out trail ends as a shape you can edit; see the marchers walk it (pathways, step 4c)"
summary: "Step 4c of pathways: where the line stops after you drag out a trail is saved as a Line, Arc or Curve that the shape tools open and edit. While you draw, the real marchers stand where they will end, their starts are faint, and Preview plays the walk."
status: open
variants: []
questions:
  - "Drag a trail straight on from the end of a line and finish. Select one of the marchers at the end flag: did the shape tools open it as a Line, with nobody moving?"
  - "Make a line on an arc (or drag one arc leg long enough for the whole line) and finish. Did it open as an Arc?"
  - "Drag a trail with a corner so the line ends around it, and finish. Did it open as a Curve with a corner where the trail turned? Did anybody move when you opened it?"
  - "On that Curve, double-click a point to make it Smooth, then double-click it again for a Corner. Is that what you expected, coming from the Path pen?"
  - "Change the shape (drag a point or an end). The marchers were laid out evenly along it. Was that the right moment for uneven Keep spacing gaps to go?"
  - "After changing the shape, play the move. Did the line still follow the trail and then walk to its new spots?"
  - "While drawing a trail, the real marchers stood at their end spots and their starts were faint. Was it clear who goes where?"
  - "Turn on Preview on the path bar. Was the walk's speed and the pause at the end comfortable to watch? Would you rather it played at the move's own tempo?"
  - "Anything else about the result as a shape, or the preview, you'd change?"
---

**What's new**

- **The result is a shape.** When you finish dragging out a trail (Shift+L, then drag
  out of an end), where the line stops is saved as a shape the shape tools know:
  - all on one straight line: a **Line**;
  - all on one circle: an **Arc**;
  - anything else (a corner, a smooth bend, part of the old line and part of the
    trail): a **Curve**, whose points are each a Corner or Smooth.
- **Opening it moves nobody.** Select a marcher of it at the end flag to open the
  shape. If you used Keep spacing, the gaps stay as they were until you change the
  shape. Your first change lays it out evenly, as the shape tools always do.
- **Corner or Smooth.** Double-click a Curve's point to turn it Smooth, and again for a
  Corner, as on a Path pen point.
- **The follow move keeps working** after you edit the shape: the line still walks the
  trail, then straight to its new spots.
- **See the marchers while you draw.** The line's real marchers stand, full size, where
  they will end, and their starts show as faint dots, as when you place a shape.
- **▶ Preview** on the path bar plays the walk along the trail again and again: a moment
  at the start, the walk, a short pause at the end. Turn it off to see the end spots
  still. It stays off while your computer asks for less motion.

**Good to know**

- The Preview loop takes the same time whatever the move's length (about 3½ seconds
  round), so long moves still read quickly.
- Keep end spots doesn't save a shape: the line goes to spots it already has.
