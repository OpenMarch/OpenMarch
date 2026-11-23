---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: path-pen
title: "Bend one marcher's line, and Re-fit (pathways, step 3b)"
summary: "Step 3b of pathways: on an open group path you can grab one marcher's line and bend it, and the bend stays with that spot through reshapes. If the block has moved, Re-fit stretches the path back onto it."
status: open
variants: []
questions:
  - "Open a group path and drag one marcher's thin line sideways. Did it bend where you grabbed it and only there? Would you rather have started the bend some other way (for example from the marcher's dot at the playhead)?"
  - "Was it clear what you could grab: the thin lines, the bold line, the small round handles, the dots? Did you ever move the wrong one?"
  - "Where several marchers' lines sit exactly on top of each other, clicking again goes to the next one, and the note by the pointer says so. Could you get the marcher you wanted?"
  - "Bend a line, then play it. Does the marcher's walk look right, and is the bend the size you meant?"
  - "Bend a line, then drag or delete a corner of the path. Did the bend stay somewhere sensible? When a corner it was attached to went, did the note and message tell you enough?"
  - "Drag a corner toward a bend until it stops. Did the stop make sense, or did it feel stuck?"
  - "Move the box at one end of a group path so Re-fit appears, then use it. Did the corners go where you expected? Should Re-fit be offered automatically, or is on demand right?"
  - "Right-click a round handle or a bent line, or long-press on a tablet. Is everything you wanted there, and are 'Remove adjustment point' and 'Reset this spot' the right words?"
---

**What's new**

- **Bend one marcher's line.** Double-click a group path to open it. Each marcher's
  own line is the thin one beside the bold path. Hover one and it lights up and says
  whose spot it is. **Drag it** and it bends where you grabbed it, and only around
  there. Click once to pick a line without bending it.
- **Round handles** mark each bend while the path is open. Drag one to change the
  bend. Right-click or long-press it for **Remove adjustment point** and **Reset this
  spot**; both are also on the path's bar once a line or handle is picked.
- **A bend belongs to the spot and follows the path.** Reshape or resize, and it rides
  along. If a corner it was attached to goes, the bend moves to the nearest corners
  left, a message says so, and the bar shows **Adjustment re-homed** until you click it.
- **Corners stop short** rather than push two bends closer than one step together.
- **Big steps** now names a bend too steep to march, with its spot and counts.
- **Re-fit.** "Ends follow, corners stay" still holds when you move a box. If the ends
  have moved, **Re-fit path** appears on the bar and in the path's right-click menu:
  it moves the ends to where the marchers stand and stretches the corners to match.
- Undo takes back any of these in one step.

**Try it**

1. Select a block, press **P**, draw a group path with a few corners, press **Enter**.
2. Double-click the path. Drag one thin line sideways. Press **Space** to play it.
3. Drag a corner next to the bend. Delete a corner the bend sits between.
4. Move the block at the end of the move. Open the path and press **Re-fit path**.
5. Try the same with a finger or pencil on a tablet.

**Good to know**

- Files saved with a bend are version 12; older builds of this test will refuse them.
- A bend can only be on the part of the path every marcher shares. On the lone stretch
  from a marcher's start to the first corner, or from the last corner to its end spot,
  it says so instead.

**Not in this step, on purpose**

- **Detach and Rejoin** are step 3c. The message on a very short path mentions Detach,
  which isn't there yet, and **Own path** refuses a bent spot until it is: reset the spot
  first.
- **Bending several marchers together** is a later step (26), and so is follow the leader.
- **Counts on corners (midsets)** are step 5, and spacing handoffs step 25.
- Two marchers sharing a spot over a move isn't possible yet, so the refusal for it can't
  be seen here.
