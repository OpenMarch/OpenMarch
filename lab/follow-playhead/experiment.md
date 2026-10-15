---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: follow-playhead
title: The timeline follows the playhead
summary: While playing, the timeline now moves by itself so the playhead stays in view. It should be easy not to notice.
status: open
questions:
  - While playing, did you notice the timeline moving? Was it ever distracting, too late, or too early?
  - Did it ever pull the view away while you were looking at or editing another part of the show?
  - When the playhead went out of view, did you find your way back (the "Playhead" chip, Play, or navigation)?
---

The timeline now follows the playhead while it plays. Open a demo show and
**zoom in on the timeline** (pinch, or Ctrl/⌘ and scroll) until only a few
pages fit; zoomed out, the whole show fits and nothing needs to move.

**What to try**

- Press **Space** and watch a few page changes. The timeline should move only
  when the next page isn't fully in view, and settle with a little of the page
  before still showing.
- While it plays, scroll the timeline away to look at another part of the
  show. It should leave you there until the playhead comes back into view. A
  **Playhead** chip at the edge takes you back.
- Zoom in until one page is wider than the timeline and play through it.
- Loop a page (**C**) and play it.
- Stopped, press **Q** and **E** to step through pages, and select pages on
  the field or in the page list.

**Good to know**

- Nothing moves while you hold the mouse button down, so a click lands where
  you pressed.
