---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: walked-path-exports
title: "Drill charts draw the path each marcher walks (pathways, step 18)"
summary: "Step 18 of pathways: an individual drill chart now draws the path its marcher actually walks between pages, curves included, where it used to draw a straight line."
status: open
variants: []
questions:
  - "Export individual drill charts for a show with a curved path or an arc. Do the charts draw the curve the marcher walks?"
  - "Export a show with no drawn paths. Do the charts look the same as before?"
  - "A turn inside one page (two straight moves in different directions) is now drawn as walked, not as one straight line. Is that what you want on a chart?"
  - "Does the exported PDF look right where a path curves: line weight, the midpoint mark, anything cut off?"
---

**What's new**

- **Individual drill charts draw the walked path** between pages: arcs, drawn paths,
  group paths, a bent line, and follow the leader as it is today.
- A straight walk keeps the same straight line as before, so shows with no drawn paths
  export as they did.
- Coordinate sheets are unchanged. There is no new setting.

**Try it**

1. Draw a path with a smooth point for one marcher, and a group path for a block.
2. Export individual drill charts and open one of those marchers' charts.
3. Export a show with no drawn paths and compare with an older export.

**Not in this step, on purpose**

- Nothing changes on screen in the editor.
- The video export and the all-marchers chart draw no paths, as before.
- There is no file of walked paths for the mobile app yet, only the code it would use.
