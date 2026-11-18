---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: marker-shapes
title: Marks on the field match the marcher's shape
summary: Selection marks, rings and old locations now take the marcher's own shape, so square marchers no longer get round marks around them.
status: open
questions:
  - "With square marchers, did every mark around them look like it belonged to a square? Was anything still round that shouldn't be?"
  - "Do the spots in an open shape read clearly now that they take the marchers' shape?"
  - "With paths and start flag positions on, can you tell the small black start squares from the blue-and-white squares on a route?"
---

The marchers in this show start as circles, so give some of them another shape
first: open the appearance panel in the left sidebar and set a section's
**Shape** to a square or a triangle.

**What to try**

- Select those marchers, open the **Shapes** tab, draw a shape, and look at the
  faint marks where they start and the spots where they will stand.
- Select several marchers and press **P** to draw a group path. The blue rings
  round them, and the faint marks where they start, should match their shape.
- Put the start flag before a move and the playhead after it, then press **N**.
  The small black dots where marchers were at the start flag should match too.

**Good to know**

- A shape's spots take the marchers' shape only when they all share one, and
  stay round when the shapes are mixed.
- An X has no edge to follow, so rings and spots for X marchers stay round.
