---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: held-count-and-walk-through
title: See how many selected marchers are Held, and what a drag across pages does
summary: The line over the field now says when only some of the selected marchers are Held, for example "1 of 2 Held". After a drag across page ends, the message says the marchers walk straight through instead of talking about keyframes.
status: open
questions:
  - With a mix of Held and moving marchers selected, did you notice "1 of 2 Held" on the field before you dragged? Did it change what you expected the drag to do?
  - After dragging across several pages, did "Now walks straight through the end of Page N" tell you what happened? Was it clear what "Stop at the end of Page N" would do before you pressed it?
  - Did pressing "Stop at the end of Page N" do what you expected?
---

Open a demo show and switch to **Expert** (top right).

**What to try**

- Make one marcher Held: select one marcher, right-click a page box, and
  pick **Hold from last keyframe**.
- Now select that marcher and one that moves on that page. The line at the
  top left of the field reads something like "Editing Page 4's move · 1 of 2
  Held". The inspector says "1 of 2 selected Held" just under the marcher
  count, without scrolling.
- Select one page's box, then Shift-click a later page's box, so the start
  flag and playhead span two or more pages. Drag a marcher to a new spot.
  The message reads "Now walks straight through the end of Page N": the
  marcher no longer stops at that page's set on the way.
- Press **Stop at the end of Page N** in that message. The marcher stops at
  that page's set on the way again.

**Good to know**

- With all or none of the selection Held, the line over the field says
  nothing about holds.
