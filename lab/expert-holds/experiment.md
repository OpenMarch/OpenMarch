---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: expert-holds
title: Expert holds, a drag partway through a hold, and Hold from start flag to playhead
summary: In Expert, a drag on a later page of a hold now ends the hold there and adds a move, and the bars show that while you drag. A drag on the hold's first page still moves the whole hold. Hold from start flag to playhead holds your selection between the two flags, reaches back over Not defined pages, and previews itself when you point at it. The inspector says how many of the selection are Held.
status: open
questions:
  - When you dragged on a later page of a hold, did it end up doing what you expected? Could you tell from the bars, before you let go?
  - Dragging on a hold's first page moves the whole hold, but dragging on a later page ends it. Did that difference make sense to you?
  - With the start flag partway through a hold, did the result match what you expected?
  - Did Hold from start flag to playhead do what its name says? Did the preview show you the hold you got when you clicked?
  - With Not defined pages before the start flag, did you expect the hold to reach back over them?
  - Did you notice "1 of 2 selected Held" in the inspector? Was it useful?
---

Open a demo show and turn on Expert mode. Select a marcher: the bars are thin
lines on the bottom edge of the page row.

**What to try**

- Hold a marcher over two or three pages: right-click a page box a few pages
  after their last move and choose **Hold from last keyframe**. Click the
  **last** page of that hold on the timeline, which sets the start flag and
  playhead around it, and drag the marcher on the field. While you drag,
  only that page's part of the bar lights up. Let go: the hold ends where that
  page starts, and the marcher now walks to the new spot on that page.
- Undo. Click the hold's **first** page and drag the marcher again. Now the
  whole bar lights. Let go: the whole hold moves to the new spot, and no move
  is added.
- Undo. Put the start flag partway through a page of the hold and the playhead
  a little later, then drag. The bar stays dark up to the start flag and lights
  after it. The hold ends at the start flag.
- With some marchers Held and others not at the playhead, select both kinds.
  The inspector says "1 of 2 selected Held".

**Hold from start flag to playhead**

- Put the start flag and playhead around a stretch where a marcher has moves.
  Right-click the marcher on the field and point at **Hold from start flag to
  playhead** without clicking: the hold it would make sweeps out across the
  timeline and pulses. Move off it and it goes away. It's also in the command
  palette.
- Click it. The moves inside are gone and the marcher stands still from the
  start flag to the playhead.
- Try it with a move crossing the start flag: the move is cut there. Then with
  a move crossing the playhead: it keeps its destination, so the marcher walks
  the rest of it faster and the step size warning shows.
- Try it where the marcher has Not defined pages before the start flag: the
  hold starts back at the marcher's last move and covers those pages too.

**Good to know**

- Expert only, and there's no keyboard shortcut.
- A marcher in a shape or following the leader is left alone, and a message
  names them.
