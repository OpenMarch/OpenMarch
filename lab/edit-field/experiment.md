---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: edit-field
title: Edit the field on the field
summary: The Field button opens a Field panel beside the field, with Setup, Lines and Appearance tabs. On the Lines tab you drag lines out of rulers, move them, pick many and delete them on the field itself, and change a picked line's values in the Line section under the list. Done keeps your changes; X throws them away.
status: open
questions:
  - Opening the Lines tab is how you start changing lines, and the picked line's values are all in the Line section under the list. Was it clear where to change a line, and how to stop?
  - Adding a yard line by dragging it out of the top ruler (its twin on the other side comes too) - did that feel quick and clear, or did you reach for something else first?
  - When you only wanted to change a setting (a color, the side names, the step size), did you ever worry you might change a line by accident?
  - Was it clear that Done keeps your changes and the X throws them away?
---

In the example show, select **Field** in the sidebar (or press Cmd/Ctrl+Shift+E). The **Field** panel opens beside the field on its **Setup** tab, and the field fits in the room left.

**What to try**

- Look through the tabs: **Setup** (template, size and steps, names), **Lines** (the list of lines) and **Appearance** (markings, background image, colors). Change a color or a side name.
- Open **Lines**. Rulers appear along the field's top and left. Drag down out of the top ruler between the 45 and the 40. The note by the pointer says where the line goes. With **Mirror sides** on, the same line appears on the other side.
- Drag a line to move it, or drag it back up into the ruler to delete it. Hold Shift for half steps.
- Click a line and look at the **Line** section under the list: change its name, hide it, or stop using it as a reference. Double-click a line and type `47.5yd`, `+4` or `85.33/2` as its position, then press Enter.
- Delete every 5-yard line: drag a thin box across the field between the front sideline and the front hash, from inside one goal line to inside the other, select **Keep every other** in the Line section, then press Delete.
- Pick lines in the panel's list: Ctrl/⌘-click adds one, Shift-click picks a run of rows. **Add line** adds one.
- Press Escape: it drops the pick, then closes the panel, keeping your changes.
- Undo any of it with Cmd/Ctrl+Z: every change is one step.
- Make a few changes, then close the panel with its **X**: the field goes back to how it was when you opened the panel. Cmd/Ctrl+Z brings the changes back. **Done** keeps them.

**Good to know**

- The field's width and depth follow its outermost lines; they're shown, not typed.
- Marchers don't move when the field changes size; they keep their place on the drawing.
- On a tablet, tap a picked line to type its position with a number pad; **Select many** at the top of the Lines tab lets taps pick several lines.
