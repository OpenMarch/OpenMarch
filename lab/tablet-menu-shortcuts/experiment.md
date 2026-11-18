---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: tablet-menu-shortcuts
title: Tablet menus without keyboard shortcuts
summary: On a tablet, the menus you open with a long press no longer list keyboard shortcuts you can't use. They come back as soon as you use a hardware keyboard.
status: open
questions:
  - On a tablet with no keyboard, did any menu still show keyboard shortcuts?
  - After you pressed a key on a hardware keyboard, did the shortcuts come back where you expected?
  - Did any menu entry look out of place without its shortcut?
---

Open a show on a tablet (an iPad, or a touchscreen laptop in the tablet layout).
Don't press any keys yet.

**What to try**

- Long-press a marcher on the field. The menu lists its commands with no
  keyboard shortcuts beside them.
- Pause, then long-press the playhead in the timeline. Its menu, with
  **Create page at playhead**, has no shortcuts either.
- Open the 3D View's camera menu: its number shortcuts are hidden too.
- If you have a keyboard for the tablet, press any key, then open the menus
  again: the shortcuts are back. The 3D View keeps track on its own: press a
  key in its window before its camera menu shows them.
- On a computer in the desktop layout, the menus show their shortcuts as
  before.
