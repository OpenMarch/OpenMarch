---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: follow-trail
title: "A line follows a drawn trail (pathways, step 4)"
summary: "Step 4 of pathways, follow the leader: select a line, choose Follow, and draw a trail. The line follows its leader along the trail into its end spots. Reverse leader makes the other end lead."
status: open
variants: []
questions:
  - "Select a line and press Shift+L, then draw a trail. Was it clear who leads and where the trail should start and end?"
  - "Play it. Does the line follow the way you expected, and does everyone end on the right spot?"
  - "Press Reverse leader. Is it what you expected to happen? Is the leader's mark easy to find?"
  - "After you finish the trail, can you find it again to edit, reverse or remove it?"
  - "Follow keeps the end spots the line already had. Would you rather the trail decide where the line ends?"
  - "Select some marchers of a line that follows a trail and split them into a new move, then merge them back into their old move. Did they do what you expected (the others keep the trail, the ones split off walk straight to their own spots)?"
  - "Split the whole line into a new move. Did the trail come with it, unchanged?"
  - "Right-click the field (or open the command palette) with the playhead inside a move that follows a trail. Is it clear from the greyed-out Split at the playhead entry why it can't run?"
---

**What's new**

- **Follow.** Select the marchers of a line (two or more) in one move and press
  **Shift+L**, or use the Follow button by the Path pen. Draw the trail as you draw a
  path: click for a corner, drag for a smooth point, **Enter** or double-click to finish.
- **The line follows its leader** along the trail into the end spots it already had.
  The leader is marked on the field.
- **Reverse leader** (**Alt+L**, the leader's mark, the path bar, or the trail's
  right-click menu) makes the other end of the line lead. Everyone keeps their end spot.
- **Remove trail** puts everyone back on a straight walk to the same end spots.
- While drawing with several marchers selected, the bar switches between **Together**
  (a group path: the block keeps its shape) and **Follow**.
- **Split and merge now work on a move that follows a trail.** Marchers split off the
  line leave it with a gap (the others keep their order and end spots) and walk straight
  to their own end spots. Split off the whole line and the trail goes with it. Merging a
  move back into its page keeps its trail.
- **Split at the playhead** is still refused while a line follows a trail, but the
  field's right-click menu, the timeline's clip menu and the command palette now show it
  greyed out with the reason, before you try it.
- Follow says why it can't run **before** you start drawing, so no drawing is lost.
- Undo takes back any of these in one step.

**Try it**

1. Select a row of marchers on a page with a move. Press **Shift+L**.
2. Draw a trail with a corner and a smooth point. Press **Enter**. Press **Space**.
3. Select the line again and press **Alt+L**. Play it again.
4. Open the trail and drag a point.
5. Try the same with a finger or pencil on a tablet.

**Good to know**

- Files saved with a trail are version 13; older builds will refuse them.
- The trail starts where the leader stands at the start of the move.

**Not in this step, on purpose**

- **Corner counts** (each marcher turning a corner on a clear count) are step 6.
- **Ripple into the next trail**, **arcs and outlines**, and **snaking through a box**
  are steps 9, 10 and 11.
- **Adjusting one marcher on a trail** is step 27.
- **Split at the playhead** (cutting the move at a count) and **removing a keyframe that
  joins two moves** are refused on a move that follows a trail until step 17: remove the
  trail first.

**Fixed since the last build**

- Drawing a trail again works when a marcher of the line is taken over by another move
  at the start, and a trail whose marchers are all taken over can still be reversed or
  removed.
