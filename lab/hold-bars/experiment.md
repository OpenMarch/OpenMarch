---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: hold-bars
title: See on the timeline where marchers hold, and what an edit will move
summary: With marchers selected, the timeline draws where they stand still. Held pages are solid, Not defined pages are dashed, and a tick marks where they move again. The bars are thin lines that grow and light up to show which later pages an edit will move too.
status: open
questions:
  - Could you tell Held (solid) from Not defined (dashed) at a glance? Did you notice the tick where a marcher moves again, and was it clear what it meant?
  - While you dragged marchers, did the lit bars tell you that later pages would move too? Was anything moved that you didn't expect?
  - Did the lit bars help you choose between the two Remove keyframe entries?
  - Did you try right-clicking a bar? Did Define as shown there do what you expected?
---

Open a demo show and select a few marchers. The bars are thin lines on the
bottom edge of the page row, with the keyframe diamonds.

**What to try**

- Make a page Not defined: right-click a page box and pick **Clear Page N**.
  A dashed bar runs from the diamond where the marchers last arrived to the
  tick where they move again.
- Right-click a dashed page and pick **Hold from last keyframe**. That page
  turns solid: it's Held.
- Drag the selected marchers on the page before a dashed page. While you
  drag, the bars the edit will carry into grow thicker in the accent color.
  Then drag on a Held page. The whole hold lights up, back to where it
  starts. (In Expert, click the hold's first page box first: a window that
  starts later in the hold ends the hold there instead.)
- Right-click a keyframe diamond and point at **Remove keyframe, Pages N–M
  move back too**. The pages that would move back light up. Point at plain
  **Remove keyframe** and they go dark. Do the same in the command palette
  (⌘K / Ctrl+K, type "Remove keyframe").
- Right-click a dashed bar and pick **Define as shown**. That page gets
  positions of its own, so its bar goes away.

**Good to know**

- A shape carried onto later pages draws solid too: the shape is what keeps
  those marchers there.
- With nothing selected, no bars show.
