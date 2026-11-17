---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: hold-style
title: Holds stand still, and mark time is a choice
summary: In the 3D View, marchers now stand still while they hold. You can ask for mark time on one hold, or for the whole show.
status: open
questions:
  - Watching the 3D View, did marchers stand and mark time where you expected?
  - Could you find where to set a hold's style? Where did you look first?
  - Is one style for a whole hold enough, or did you want to change it partway through a hold?
  - Should the show's default be Stand, as it is now, or Mark time?
---

Open a show with a few pages, and open the **3D View** from the **View** tab so
you can watch the marchers while you work.

**What to try**

- Play the show. Marchers who hold now stand still, even while others move.
- Go to a page where some marchers stay put. Select them and press Ctrl+H
  (⌘H on a Mac) to hold them there: **Hold from last keyframe**.
- With them still selected, look in the inspector under "Held · since Page …"
  for **Hold style**. Choose **Mark time** and play that page in the 3D View.
- Right-click a selected marcher on the field: the same choices are in the
  menu ("Hold style: Mark time" and so on).
- Hold the next page too. The hold grows and keeps its style.
- Open **Show settings** and change **Holding while others move** to
  **Mark time**. Now every holding marcher marks time while anyone is moving.
  Set one hold's style to **Stand** and see that it stays still.
- Undo and redo a style change.
