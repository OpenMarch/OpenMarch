---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: shaping-a-hold
title: Change how long marchers hold, and leave a hold early
summary: Drag the end of a Held bar on the timeline to make marchers hold longer or leave earlier, or right-click the bar and pick Split hold here. After the hold ends the marchers are Not defined, so a drag there starts a new move where the hold now ends.
status: open
questions:
  - Did you find the end of a Held bar to drag? Was the thin line easy enough to grab, and did the cursor and the small knob tell you it was draggable?
  - When you dragged the end, did the bars and the readout show clearly where the hold would end, and where it stopped (at the next move, or the end of the show)?
  - After you shortened a hold, did a drag after it do what you expected (the marchers leave where the hold now ends)?
  - Did Split hold here on the bar's right-click do what you expected? Would you rather drag the end, or split?
---

Open a demo show and select a few marchers. Hold bars are thin lines on the
bottom edge of the page row, with the keyframe diamonds.

**Make a hold first**

- Right-click a page box and pick **Hold from last keyframe**. Do it on the
  next page too: the two pages make one solid bar (Held).

**What to try**

- Point at the right end of the solid bar. The cursor turns into the resize
  arrows and a small knob shows. Drag it left: the hold now ends earlier,
  and the rest turns dashed (Not defined). Drag it right again, up to the
  next move. A readout says where the hold ends, and what stops it.
- Esc while dragging puts it back.
- Right-click the solid bar and pick **Split hold here**. The hold ends at
  the count you right-clicked.
- After the hold ends, drag the marchers on a dashed count. Their move
  starts where the hold ends (they leave early). Inside the hold, the same
  drag moves the whole hold instead.
- Select one marcher of a group and shorten only its hold: each marcher can
  leave at its own time.
- Pick a marcher that never moves, and hold it on two pages with a page
  between them. The hold reaches back, so they make one hold from the start
  of the show, with no gap to drag across.

**Good to know**

- A hold's start is where the marchers got there, or the starting spot, so
  it has no handle; drag its end instead.
- Undo puts back each drag and split in one step.
