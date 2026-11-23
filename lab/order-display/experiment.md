---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: order-display
title: "A line's order: the fading lane (pathways, step 4i)"
summary: "Step 4i of pathways: the lane that shows a line's order now fades from dark at the leader to pale at the tail, narrows so a box's ranks stay apart, and keeps its own ground on any floor and with any dot color."
status: open
variants: []
questions:
  - "Select a row of marchers that has an order (or set one with Shift+O). Can you tell which end leads, and roughly where each marcher sits in the order, without holding Alt?"
  - "Set a snake order through a box of marchers (Shift+O, then click them rank by rank). Can you trace the snake from the leader to the last marcher?"
  - "Open Field properties and give the field an image (a gym floor, a printed tarp, a photo). Does the lane still read on it? Does it look too heavy anywhere?"
  - "Give a section a different color (white, yellow, gray). Does every dot stay clearly visible with the order showing?"
  - "Is the dark leader end too heavy next to the marchers' names? Would you rather it were lighter, even if the fade becomes harder to see?"
  - "Anything else about how a line's order looks?"
---

**What's new**

- **The lane fades.** It is darkest at the leader and fades to pale at the tail, always that
  way round, so you can see roughly where each marcher sits in the order without numbers.
  The small darts along long lanes are gone: the fade shows the way.
- **A box's ranks stay apart.** A lane is never wider than half the gap to a marcher that
  isn't its neighbor in the order, so a snake through a box shows as separate rank lanes
  you can follow.
- **It reads on any floor.** On a field image or a dark field the lane brings its own light
  ground, a wash just strong enough for the floor under it (none on the plain white field),
  with a faint rim at its edge. The tip sits on that ground too.
- **Every dot stays visible.** Each dot in the line gets a thin halo: light round red, gray
  and dark dots, dark round white and yellow ones. The dot's color alone decides it, so it
  never changes between floors or zoom levels.
- Orders that double back still drop the tip and show numbers; crossing orders still thin to a
  thread with numbers. Set order, Reverse, Clear, Alt for numbers and Show order work as before.

**Left out on purpose**

- Marcher names are drawn as before; over the dark front of a lane they have less contrast.
  A light halo on names would fix that app-wide and is a separate change.
- A field of 200 marchers in a random order is still only readable from its numbers.
