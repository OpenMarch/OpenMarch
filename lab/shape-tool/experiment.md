---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: shape-tool
title: The shape tool (box)
summary: OpenMarch's first shape tool. Select marchers, pick Box, draw it on the field, shape it from the floating editor under it, and press Enter to place it. We want your read on the controls as the model for every future shape, not only on this box.
status: open
variants: []
questions:
  - Was it easy to find how to start a shape? Could you see this growing to other shapes (circle, arc, star, custom)?
  - Did every control on the editing bar make sense? Is there anything you'd rather have in the inspector?
  - Did the rotation pivot (the 3×3 picker beside the degrees) make sense?
  - Did the Grid layouts (Full, Stagger, Rounded, Short back, Notched) make sense? Was there a block you wanted but couldn't make, such as a skewed block, or a stagger with the "wrong" number of marchers?
  - Did Outline mode make sense? Could you easily set the spacing side to side and front to back?
  - In Outline, could you easily see where the leftover went, whether it left a gap or spread evenly?
  - Did Spread mode make sense? Was it clear what Edge does?
  - If you'd been told up front, would you have used Shift for smooth, fine adjustments?
  - Did snapping ever move marchers, or catch a yard line or hash, when you didn't want it to?
---

OpenMarch has never had a shape tool. This is the first one, a box, built so
the same controls can carry other shapes later.

**Try it**

1. Open a demo show or start a new one. Select a group of marchers, then
   start a box. There are several ways in:
   - the **Shapes** tab in the toolbar
   - press **B**
   - hold **R** on the field for the shape ring (your favorite shapes)
   - type **/** for the shape command bar (for example "/box 8x4 2")
   - **⌘K** / **Ctrl+K**, the command palette
2. Drag on the field to draw the box. Its edges and corners pull onto yard
   lines, hashes and sidelines, and an orange guide names the line ("S2: On
   45", "On FH").
3. Shape it from the floating editor under it: its size (8 × 4), the two
   spacings (type fractions like 1 2/3, or drag the numbers), turn (↻ or the
   degrees), flip, and the pivot grid that sets what it turns and grows around.
4. Pick how marchers fill it from the mode menu: **Grid**, **Outline** or
   **Spread**. Switching keeps the box where you drew it.
   - In **Grid**, the layout menu has Full, Stagger, Rounded, Short back and
     Notched.
   - In **Outline**, set the spacing side to side and front to back; both stay
     exactly as you set them. **Even out** spreads the marchers round the box
     as evenly as it allows. With an uneven count, **Leftover** chooses which
     side has one fewer marcher, and whether it leaves a gap or spreads evenly.
   - In **Spread**, **Edge** stands marchers along the outline with the rest
     spread inside, and **Reshuffle** tries another even arrangement.
5. Drag inside the box to move it. Its corners and center catch yard lines
   and hashes too.
6. Press **Enter** to place it, or **Esc** to discard.
7. Click a placed box to select it and edit it again. **Recalculate**
   (Shift+R) works out who goes where by least travel.

**Good to know**

- Every control lives on the bar under the shape. We left the shape controls
  out of the inspector on purpose, so you never have to look away from the
  field.

- Hold **Shift** for fine control (no half steps, lines still catch). Hold
  **Cmd** (Mac) or **Ctrl** to constrain (equal spacings, one axis when moving,
  flips proportional scaling). Hold **Alt** to draw or resize a box from its
  center. Turn snapping off with the **Snap** toggle (**Shift+M**), not a held
  key.
- If the box or its editor would end up off the screen, the field glides just
  far enough to bring them back.

Answer the questions with the whole tool in mind: we're deciding whether this
is how every shape in OpenMarch should work.
