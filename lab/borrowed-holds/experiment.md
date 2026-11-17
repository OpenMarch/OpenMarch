---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: borrowed-holds
title: Hold a page after some Not defined pages, and see the hold reach back
summary: Hold from last keyframe now works on a page after Not defined pages. The marchers already stand at their last spot there, so the hold reaches back over those pages to whatever last put them there, and draws as one plain Held bar. Dragging inside a hold moves the whole hold, including where it arrives (in Expert, from the hold's first page).
status: open
questions:
  - When you held a page after Not defined pages, did you expect the hold to take in those earlier pages too? Did the bar make that clear?
  - Was the toast naming the pages (for example "Held on Pages 3–5") what you expected?
  - When you dragged inside the hold, did the whole hold moving, including where it arrives, feel right?
  - Held on two pages with a gap between them makes one hold. Was that what you expected?
---

Open a demo show and select a marcher. The bars are thin lines on the bottom
edge of the page row, with the keyframe diamonds.

**What to try**

- Pick a marcher that last moves on, say, Page 2. Right-click a page box a
  few pages later (Page 5, say) and point at **Hold from last keyframe**
  without clicking. The hold it would make sweeps out from Page 2's diamond
  across the page row to the end of Page 5, then pulses. Move off it and it
  goes away.
- Now click it. Pages 3
  to 5 become one plain Held bar, growing out of Page 2's diamond, and the
  toast names those pages.
- Point at the bar's end: you can still drag it to hold longer or leave
  earlier. The start of the bar has no handle, since it starts where the
  marcher got there.
- Drag the marcher on a held page (in Expert, click the hold's first page
  box first). The whole bar lights. When you let go, the
  marcher stands at the new spot from Page 2's diamond on: the whole hold
  moved, including where it arrives.
- Hold a marcher on Page 3, then on Page 6. The two holds and the pages
  between them make one Held bar.
- Hold a marcher that never moved. It's Held from the start of the show, and
  a drag inside it moves its starting spot.
- Undo, then remove the diamond the hold grows out of (right-click it,
  **Remove keyframe, Pages N–M move back too**). The hold goes with it.

**Good to know**

- A marcher whose last move is a shape's or a follow-the-leader move is
  skipped and named in the toast: the shape carried on is its own hold.
- Basic and Expert draw the same plain Held bar.
- In Expert, a window that starts later in the hold ends the hold at the
  start flag and adds a move there, instead of moving the whole hold.
