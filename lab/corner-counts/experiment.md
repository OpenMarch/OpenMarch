---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: corner-counts
title: "Corner counts for block letters (pathways, step 6)"
summary: "Step 6 of pathways: every corner of a follow-the-leader trail shows the counts its marchers turn on. Tap a corner's count to see who turns when, and a warning shows when a marcher turns between counts."
status: open
variants: []
questions:
  - "Drag a block-letter trail out of a line (Shift+L, drag from an end, click a corner, finish). Did the count by each corner tell you what you needed at a glance? Would you rather see something else there (the leader's count only, every marcher's count, the count spacing)?"
  - "Tap or click a corner's count. Is the list (who turns, leader first, on which count) what you'd tell your band? Is anything missing?"
  - "Counts start at 0 on the move's first flag, so a marcher at the corner on beat 6 of the move turns 'on count 6'. Is that how you count a set, or do you want page counts when a move spans more than one page?"
  - "A turn counts as on a count when it shows as a whole number at one decimal (within about a twentieth of a count). Is that too strict, too loose, or right?"
  - "A corner is any turn of 20° or more, including where the line leaves its old line and where it enters its end spots. A line standing in a curve or a circle gets no chip at each marcher, only where a bend stands out. Did any chip show up where you didn't think of a corner, or miss one you expected?"
  - "Make a corner warn (for example, a letter over 12 counts instead of 16), then drag the corner or change the move's counts until the warning goes. Was it clear what to change?"
  - "The chips show whenever the trail does. Did they get in the way? Would you want a setting to hide them?"
  - "Anything else about corner counts you'd change?"
---

**What's new**

- **A count chip at every corner of a trail.** Wherever the trail turns (by 20° or more),
  a small chip just outside the corner shows the first and last counts its marchers turn
  on there, for example **6–20**: the leader turns on 6 and the last marcher on 20.
- **Tap or click a chip** for the corner's list: each marcher who turns there, leader
  first, and the count it turns on. Marchers who stop before the corner are counted at
  the bottom.
- **A warning when a turn falls between counts.** A marcher that reaches a corner
  partway through a count gets the warning color in the list ("7.5 · between 7 and 8"),
  its corner's chip turns amber, and the trail's path bar says **Turns between counts**.
- **Live while you draw.** Dragging a trail out of a line (Shift+L), the chips follow the
  pointer, so you can find a corner that lands on counts before you click it. Dragging a
  corner of an open trail updates them as you go.
- Counts are read, not stored: nothing changes in the show, and there's nothing to undo.

**Try it**

1. Select eight marchers in a line, two steps apart. Press **Shift+L**.
2. Press the right end and drag up a few steps; watch the chip at the corner where the line
   turns up. Click to place a corner, then move right and double-click to finish.
3. With the line still selected, tap the chips. Then press **Space** and watch who turns
   when.
4. Make a corner warn (drag a trail corner, or resize the move by a couple of counts), then
   fix it.
5. Try it with a finger or pencil on a tablet: the chips are bigger on touch.

**Good to know**

- Each marcher walks its own distance at its own steady speed, so marchers turn the same
  corner on different counts. All of them turn on counts only when the spacing and each
  corner's distance work out in whole counts.
- A smooth point has no count: the curve doesn't turn sharply anywhere.
- The chips can't be pressed while you're drawing, so a click there still places a point.
  The list opens once the trail is finished.

**Not in this step, on purpose**

- **Pinning a corner to a count** on a trail, and a **Put corners on counts** action.
  Counts on a trail come from where the corner is; pins are for drawn paths (step 5).
- Counts in printed dot books or coordinate sheets.
- Counts for a group path or one marcher's own path (they have no follow order).
- Corners inside a stored shape's own path, and a marcher's straight step off the trail
  to a spot that isn't on it.
