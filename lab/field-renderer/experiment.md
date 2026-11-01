---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: field-renderer
title: The new field
summary: The field is redrawn from scratch to stay smooth on big shows and slow computers. Edit a show on it and tell us what feels different.
status: open
questions:
  - Did anything on the field look or behave differently from what you're used to? What, and where?
  - Was the field smooth while you played, scrubbed, zoomed and dragged? If not, what were you doing and how big was the show?
  - Did anything you did on the field not save, or save somewhere you didn't expect?
---

This build has a new field. It should look and behave like the field you
know, with a few deliberate fixes, and stay smooth on large shows and
slower computers.

**Compare with the old field**

This build has only the new field; no query string needed. To compare with
the old field, open the build from before the switch:
<https://field-renderer-pre-209-openmarch-fork-preview-build.alexdumo.workers.dev/>.

**What to try**

- Open a demo show. Play it, scrub the timeline, zoom and pan.
- Click, Shift+click, drag a box around marchers, and double-click-drag to
  lasso them.
- Drag marchers, with coordinate rounding on and off. Hold **Shift** for fine,
  slow moves off the grid; the Snap toggle (**Shift+M**) turns snapping off.
- Select several marchers and use the corner, side and rotate handles.
- Try the line tool (**L**), and export a drill chart or a video.

**Good to know (on purpose)**

- Middle-drag pans now; Alt no longer pans.
- A click is anything that moves less than 4 pixels, however long you hold.
- The lasso only selects if you let go within 50 pixels of where you started.
- Dots sit exactly on their coordinates (half a grid line from before).
- If your computer draws graphics in software, the field switches to a
  lighter mode and tells you once.
