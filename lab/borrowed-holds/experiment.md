---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: borrowed-holds
title: Hold a page that nothing arrives at, and see where its spot comes from
summary: Hold from previous page now works on a page after Not defined pages. The hold keeps the spot an earlier page left the marchers on. Its bar is lighter and hatched, with a small label naming that page ("Held · Page 2's spot"), and dragging inside it adds a move on the page before.
status: open
questions:
  - Could you tell this lighter, hatched Held bar from a plain Held one, and from a dashed Not defined one? Did the label ("Held · Page 2's spot") tell you where the marchers stand?
  - Did the dotted line back to the page whose spot it keeps help, or was it in the way?
  - When you dragged inside the hold, did you expect a move to be added on the page before? Did the hold then do what you expected?
  - After you removed the keyframe the hold keeps its spot from, was it clear the hold stayed, now keeping an earlier page's spot?
---

Open a demo show and select a marcher. The bars are thin lines on the bottom
edge of the page row, with the keyframe diamonds.

**What to try**

- Pick a marcher that last moves on, say, Page 2. Right-click a page box a
  few pages later (Page 5, say) and pick **Hold from previous page**. Pages 3
  and 4 stay dashed (Not defined); Page 5 turns Held, drawn lighter and
  hatched, with a label naming the page whose spot it keeps.
- Go to that page. A dotted line runs back from the label to the diamond
  where that spot was set. It also shows while you point at the bar, and
  while a drag lights it. The marcher inspector says the same: "Held · Page
  2's spot".
- Drag the marcher on the held page. While you drag, the hold lights up.
  When you let go, a move is added on the page before the hold (Page 4), and
  the hold now grows out of its diamond: a plain Held bar.
- Undo, then remove the keyframe the hold keeps its spot from (right-click
  that diamond, **Remove keyframe, Pages N–M move back too**). The hold
  stays, now naming the earlier page.
- Switch to Basic: the same hold draws as plain Held, without the label or
  the line.

**Good to know**

- A marcher who never moved before the hold is Held from its starting spot
  instead. Dragging inside that hold moves its starting spot, as before.
- Deleting the page flag where a hold starts leaves the hold on the same
  counts, now starting partway through a page.
