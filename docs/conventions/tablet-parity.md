# Tablet parity: making a desktop feature work on a tablet

OpenMarch is desktop first. Every feature is designed for mouse and keyboard, and the
tablet layout (finger and Apple Pencil, `docs/tablet-layout.md`, ADR 0001) then reaches
the **same actions and shows the same data** through its own controls. Desktop is never
made worse to suit touch: no bigger controls for everyone, no removed shortcuts, no
changed mouse gestures.

Read this before building any feature with a new control, gesture or on-field
interaction, and before reviewing one.

## 1. Start from an action, not a control

Every feature is a registered action, and every control (button, menu row, key, touch
control, palette row) runs that action.

1. Add an entry to `ACTIONS` in `apps/desktop/src/shortcuts/definitions.ts`: label key,
   category, default bindings (or `[]`), and `args`/`params` if it takes any.
2. Put the behavior in exactly one handler: `useActionHandler(id, run, { enabled, checked })`
   in a `shortcuts/handlers/use*ActionHandlers.ts` hook.
3. Mouse controls use `<ActionButton action=…>`. It adds the tooltip with the shortcut,
   disables the button when the action can't run and, in the tablet layout, the caption
   and the long-press explanation.
4. Touch-only controls also use `<ActionButton>` or `runAction(id, args)`. **Never call a
   store setter directly from a control.** That skips the enabled state and the shared
   undo path.

Then the palette lists the action automatically, and the title-bar magnifier opens the
palette on a tablet, so every action has at least one touch path from day one.

- Good example: the Move pad (`components/inspector/marcher/MovePad.tsx`) runs the same
  nudge actions as the arrow keys.
- Good example: the touch pill's Snap button
  (`components/canvas/touch/TouchModifierButtons.tsx`) runs `runAction("toggleSnap")`,
  the same action as the toolbar's magnet and Shift+M, and is disabled while that action
  can't run.

The palette is the floor, not the goal. If an action is frequent on the field or the
timeline, it also needs a visible touch path (section 2).

## 2. Translate each desktop input

| Desktop input                                           | Tablet equivalent                                                                                                                                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hover** shows information (tooltip, preview)          | Information that matters is visible text, an `InfoTip`, or the long-press explanation. Nothing needed to use the feature lives only on hover. Hover-only handles and grips are always visible on the selected object. |
| **Right-click** menu                                    | A "…" chip on the selected object (44 px), and long press with a jitter tolerance. Native `onContextMenu` alone does not fire on iPad Safari.                                                                         |
| **Double-click**                                        | A menu entry (or a button in the floating editor). A double-tap with a touch-sized slop is optional, never the only way.                                                                                              |
| **Modifier key during a drag or click** (Shift, Alt, ⌘) | A role toggle on the touch pill (`TouchModifierStore`, `onScreenRoles`) when it changes a drag. A menu choice when it picks a different action (e.g. Shift-click Play = pause).                                       |
| **Keyboard-only** action                                | A visible control in the tablet layout if it's frequent, otherwise the palette.                                                                                                                                       |
| **Wheel / trackpad zoom and scroll**                    | Pinch and two-finger pan, plus ± or Fit buttons.                                                                                                                                                                      |
| **Small drag target** (edge, grip, handle, knob)        | A 44 px hit area in touch mode. It may be invisible and can be limited to the selected object. Keep the drawn size unless the owner asks otherwise.                                                                   |
| **Precise placement by drag**                           | A numeric or stepped alternative (Move pad, number fields, snapping). A finger is about 7 mm wide.                                                                                                                    |
| **Escape / Enter** to cancel or finish                  | Visible Cancel/Discard and Done/Finish buttons in the tablet layout.                                                                                                                                                  |

## 3. Layout and sizes

- Use the `touch:` Tailwind variant (`h-24 touch:h-44`), or `useIsTouchMode()` when the
  structure differs. Mouse classes don't change.
- `@openmarch/ui` base components (Button, Input, Select, Tabs, Slider, …) already grow
  to 44 px. Raw `<button>`s, icon buttons and custom controls need their own `touch:`
  sizes.
- It must fit the tablet layout at **744 px wide** (iPad mini portrait) and 1024 px
  landscape, with the Inspector as a drawer.
- Icon-only buttons need a name (`ActionButton` caption or `aria-label`). The long press
  explains a control by its accessible name.
- Show keyboard hints ("Hold R for…") only through `useShowShortcutHints` /
  `KeyboardSeenStore`, so they don't appear on a tablet without a keyboard.

## 4. Pointer handling

- Use pointer events with `setPointerCapture`, and always handle the pointer cancel event. Mouse
  events, `onDoubleClick`, `onContextMenu` and `wheel` are mouse-only.
- Decide gesture behavior by **each press's `pointerType`**, never by the layout. The
  layout decides sizes and which controls show.
- A second finger cancels a one-finger drag and restores the state from before it.
  Nothing should be saved until release.
- Thresholds depend on the pointer kind: touch needs a wider click slop (about 10 px),
  a move threshold (about 12 px) and a tap hit radius (about 22 px). Mouse values stay
  as they are.
- On the field, presses go through the field's gesture adapter (once it is ported,
  `docs/tablet/plan.md`), not your own `TouchEvent` listeners. Fingers pan by default;
  the Pencil selects and edits precisely.
- Set `touch-action` on surfaces you drag on, and decide which regions scroll and which
  drag (e.g. the timeline ruler scrubs, the track body pans).

## 5. Test it

- Unit-test any gesture rule as a pure function with timestamps (see
  `components/canvas/touch/__test__/touchGestures.test.ts`).
- Browser scenarios send real touch and pen input through CDP with the shared helpers in
  `apps/desktop/e2e/browser/app.mts`: `tap`, `touchDrag`, `longPress`, `twoFingerPan`,
  `pinch`, `multiFingerTap` (two or three fingers), `penDrag`, and `touchGesture` for any
  other finger sequence. Points are viewport pixels, and each finger is 48 px wide
  (`FINGERTIP_WIDTH`), as Safari reports. `emulateTouchScreen` makes the page a touch
  screen (`(pointer: coarse)`, `(hover: none)`) partway through a scenario. Assert
  through `window.fieldTest`; `e2e/browser/tests/touch-helpers.spec.mts` shows each
  helper.
- Run the existing mouse scenarios for the area unchanged. A touch change that alters
  mouse behavior is a bug. To also run them on a touch screen (`hasTouch`, coarse pointer,
  so "auto" lays the app out for touch while `page.mouse` still presses as a mouse), use
  the `browser-touch` project: `pnpm run e2e:browser:touch <spec>`, or
  `test.use({ touchScreen: true })` in one file.
- Never claim device support beyond what was tried on real hardware.

## 6. In the pull request

Add a "Tablet" line to "How it was checked":

- **Touch path:** how each new action is reached on a tablet (control, menu, pill
  toggle, palette), or
- **Desktop-only for now:** the gap is filed as a fork issue with the `tablet` label,
  linked here. Gaps are allowed; hidden gaps are not.

Reviewers check the table in section 2 against the diff: any new `onContextMenu`,
`onDoubleClick`, `title=`-only information, modifier check (`shiftKey`, `altKey`,
`metaKey`), `wheel` handler or sub-44 px target needs a matching touch path or an issue.
