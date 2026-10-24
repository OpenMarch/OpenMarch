# Tablet layout

The editor has two layouts: the **desktop layout** (mouse and trackpad) and the
**tablet layout** (finger and pen). They are one app, with one file format and one
editing engine; only the controls and their sizes differ. The decision is recorded in
[ADR 0001](adr/0001-tablet-layout.md).

Targets: iPad (the web editor in Safari), Android tablets (the web editor in Chrome)
and Windows tablets (the desktop app). Phones are out of scope.

> **Lifespan.** Most of the canvas work below is written against the Fabric canvas.
> The three.js field that replaces it will need its own touch input. The gesture
> rules, the decisions and the tests describe what to rebuild; the Fabric code
> itself is expected to be thrown away. See [Porting to the three.js field](#porting-to-the-threejs-field).

## Which layout you get

`apps/desktop/src/stores/InputModeStore.ts` decides, and writes the answer to
`<html data-input="touch|pointer">`.

- **Automatic** (default) follows the device: the tablet layout when the primary
  pointer is coarse (`(pointer: coarse)`: a tablet, or a 2-in-1 with its keyboard
  detached), the desktop layout otherwise. It changes when the device does (a
  keyboard cover is attached), never on a single press.
  An earlier version switched on every press; on touch laptops and iPads with a
  trackpad that moved the whole layout under the pointer, so it was dropped.
- **Tablet** / **Desktop** pin it: Settings › Touch & Input › Layout.
- How each _press_ behaves (gestures, hit radius, palm rejection) always follows
  that press's own `pointerType`, whatever the layout.
- On a touch laptop in the desktop layout, the first finger on the field shows a
  one-time hint pointing to the setting.

Styling uses the `touch:` Tailwind variant (`packages/ui/src/tailwind.css`), for
example `h-26 touch:h-44`. One spacing unit is 1 px in this repo.

## What differs in the tablet layout

### Field (canvas)

| Gesture                                            | Result                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Tap a marcher                                      | Select only it (a tap within ~22 screen px of a dot picks the nearest)                                                               |
| Tap empty field                                    | Clear the selection (only a real tap, under ~10 px of movement)                                                                      |
| One finger on a marcher dot or the selection, drag | Move it; nothing moves until ~12 px (tremor guard), then it catches up                                                               |
| One finger on empty field, drag                    | Move the view (default; see "Field drag mode" below)                                                                                 |
| One finger: press and hold on empty field, drag    | Selection box                                                                                                                        |
| Long press (~0.5 s, held still), lift              | Add the marcher under or next to the finger to the selection, or remove it (toast says which); on the only selected marcher, nothing |
| Two fingers                                        | Pan and zoom together; a second finger cancels whatever the first started (nothing saved)                                            |
| Two-finger tap / three-finger tap                  | Undo / Redo ("Undone" / "Redone" toast)                                                                                              |
| Pen on empty field, drag                           | Selection box (default)                                                                                                              |
| Pen elsewhere (Apple Pencil, Surface Pen)          | Precise, like a mouse                                                                                                                |
| Palm while the pen is down                         | Ignored on the field and app-wide (contact size isn't used: real iPads report fingertips 40–50 px wide)                              |
| Finger within 1 s of a pen stroke                  | Moves the view only (never edits), so a resting palm can't move marchers                                                             |

Field drag mode (a one-finger or pen drag that starts on empty field): the default,
**Auto**, needs no switching: a finger moves the view, a pen draws a selection box, and
a finger selects by pressing and holding, then dragging. In the words the app uses:
"Drag the field with one finger to move around. Use Apple Pencil, or press and hold
then drag, to select an area." The pill's "Drag: Auto ▾" menu offers **Box**, **Lasso**
and **Pan** as overrides that apply to finger and pen alike; the choice is kept in
`localStorage` (`openmarch:fieldDragMode`, an old stored "box" is read as Auto once).
Drags that start on a marcher dot or the selection always move it, and two fingers
always pan and zoom. The desktop layout has no pill, so there the drag mode is always
Auto (`components/canvas/touch/fieldDragMode.ts`).

Other field behavior:

- **Floating pill** (`components/canvas/touch/TouchModifierButtons.tsx`):
  "Drag: … ▾" mode menu, **Add** (on-screen Shift: add to selection, axis lock),
  **No snap** (on-screen Alt/Shift-for-snapping), and **?** (explains the gestures).
  Long press on any pill control explains it. It places itself where it covers the
  fewest marchers (`pillPlacement.ts`) and can be dragged by its grip.
- **Handles**: a press on a marcher dot always wins over a selection handle (all
  pointer types). In touch mode handles sit 20 px outside the dots, the box is at
  least 48 px, and the rotate handle is 96 px out. Flat selections (a row or a
  column) hide the scale handles for the flat axis.
- **Readouts**: a live step readout while dragging marchers ("4 steps to S2 · 2 steps
  toward the back") and an angle readout while rotating (snaps to 15°). Both also
  show for the mouse.
- **Selection box** follows its marchers after undo, redo and page changes, and is
  hidden during playback.
- **Zoom**: one set of limits (`CANVAS_ZOOM_LIMITS` in `CanvasConstants.ts`); the %
  label means "100% = the last fit" and doesn't change when only the canvas size does.

### Inspector

- Below ~1000 px wide, or any tablet in portrait, the Inspector is a **drawer** over
  the field, opened from an "Inspector" tab on the right edge
  (`components/layout/InspectorDock.tsx`, `utilities/inspectorLayout.ts`). The tab
  glows when something is selected while it's closed.
- **Move pad** (`components/inspector/marcher/MovePad.tsx`): Back / Front / Side 1 /
  Side 2 by exactly ¼, 1 or 4 steps, through the existing nudge actions. It is the
  touch way to place marchers precisely (the X/Y boxes are read-only for everyone
  upstream). Each press is one undo step.
- Compact Inspector (`useCompactInspector.ts`): Notes scrolls with the rest, and the
  Page section folds while marchers are selected.

### Top of the screen

- One 56 px row: the toolbar's tabs sit in the title bar
  (`components/titlebar/toolbarSlot.ts`).
- The toolbar's controls open as a **panel over the field** when a tab is tapped;
  tapping the active tab or the chevron closes it. Starts closed; remembered.
- Command palette button (magnifier) in the title bar, for every layout.

### Timeline

- Page edges are pointer-event drags with a 44 px handle that straddles the edge; a
  second finger cancels the drag and restores both pages.
- "…" chip on the selected page opens the page menu on a tap (never on a scroll).
- **New page** is the round + right after the last page box, as with a mouse, at
  44 px; it scrolls with the pages. Adding says "Page N added", and the page "…"
  menu has "New page at the end" for when the end is off screen.
- Pinch zooms the timeline; zoom buttons use magnifier icons and zoom around the
  view's centre; one-finger pans scroll (also over the waveform).
- Tap tempo has on-screen Tap and beats-per-tap controls in the beat editor.
- Compact timeline (touch only, the default): one ~62 px row with previous page,
  play/pause and next page, a "…" menu (first/last page, metronome, volume,
  fullscreen, Edit timeline, timeline zoom), the pages strip with the + at its
  end, then a waveform toggle and a chevron. The chevron expands to the full timeline
  (transport card, pages, audio, zoom column), which has a chevron back. Both
  choices are remembered; the audio row shows by itself in the beat editor.

### Everywhere

- `packages/ui` base components grow to 44 px targets in touch mode (Button, Input,
  Select, Checkbox, Radio, Switch, Slider, Tabs, ToggleGroup, ListItem, menu rows).
- **Long press on any button explains it instead of running it**
  (`components/ui/LongPressGuard.tsx`; `useLongPress` / `LongPressBubble` in
  `@openmarch/ui`). Menus and elements marked `data-own-long-press` opt out.
- Info icons are tap-to-open popovers in touch mode (`components/ui/InfoTip.tsx`).
- Keyboard shortcut hints only show once a keyboard has been used
  (`stores/KeyboardSeenStore.ts`).
- Select lists ignore scroll gestures (only a still tap picks), open on the current
  choice, and fit the screen (`packages/ui/.../touchSelect.ts`).
- Number fields select their value on tap so typing replaces it.
- Toasts sit top-centre in touch mode and let taps through.
- Dialogs fit the viewport and scroll inside; the new-show wizard has a fixed height.
- The left rail's settings button is "Show settings" (workspace settings); app
  settings are under ☰ › Settings….

### Web editor (iPad, Android)

- Page pinch-zoom, double-tap zoom, rubber-banding and the tap highlight are off
  (`styles/index.css`, `web/renderer/touchGestures.ts`).
- Home-screen app: manifest and icons in `web/public/`, tags injected by
  `vite.web.config.mts`.
- iOS file picking accepts any file and checks it's a show (`web/renderer/filePicking.ts`);
  saving offers the share sheet ("Save to Files") where available.
- Audio is unlocked on the first touch (`utilities/audioUnlock.ts`).
- Settings opens in-page as a sheet (`components/WebSettingsSheet.tsx`) instead of a
  second tab.
- Saving: shows live on the device, in a library in browser storage, saved as you work,
  with 20 versions each; Back up shares the `.dots` file (Files, Google Drive, email) or
  downloads it. The title bar shows "Saved on this iPad" and when the show was last
  backed up; the start page lists the shows. Work is only on this iPad until it's backed
  up, and clearing site data loses what wasn't. Safari suggests adding OpenMarch to the
  Home Screen once. Details and limits: `apps/desktop/web/README.md` ("Shows in the
  browser").
- Focused fields scroll above the on-screen keyboard (`hooks/useOnScreenKeyboard.ts`).

### Desktop app (Windows tablets)

- Minimum window width 768 (was 1000). Touch input is on by default in Chromium;
  page pinch-zoom stays off.

## Changes that affect the desktop layout too

These were judged improvements for everyone:

- A press on a marcher dot beats a selection handle on top of it.
- Shift/Cmd-click on a marcher under a handle adds/removes it; Cmd-click on empty
  field keeps the selection on Apple platforms.
- Step and angle readouts; the selection box follows its marchers after undo.
- Command palette button and "Select all" button; undo/redo stay visible in fullscreen.
- Mouse/pen hit tolerance of a few pixels around dots.
- The timeline zoom is a column inside the timeline panel (it used to float over
  other panels) and zooms symmetrically.
- The page-deleted toast has Undo.
- Undo/redo double-check the database before saying there's nothing to undo.

## Parity rule

Every feature must be reachable in both layouts, even if differently (a toolbar
button in one, a panel in the other). When adding a control, check:

- [ ] it works with a finger (no hover, no right-click, no modifier key required);
- [ ] its target is at least 44 px in touch mode (`touch:` classes);
- [ ] anything shown only on hover or in a tooltip is also reachable by tap;
- [ ] a long press on it explains it (automatic for buttons with a label);
- [ ] it fits the tablet layout at 744 px wide (iPad mini portrait).

## Testing

- Unit tests sit next to each module (`__test__/`), notably the gesture state
  machine (`components/canvas/touch/__test__/touchGestures.test.ts`).
- Browser scenarios with real multi-touch through CDP:
  `e2e/browser/tests/touch-canvas.spec.mts` and `touch-timeline.spec.mts`
  (`pnpm run build:browser`, then `pnpm run e2e:browser <spec>`).
- The design was iterated with scripted "persona" runs on emulated tablets (iPad mini,
  Air, Pro, a 9.7" iPad, Galaxy Tab, Surface in tablet mode, a touch laptop) using a
  CDP touch driver kept outside the repo. Four rounds took the average from about
  2.8/5 to about 4.3/5 for "usable on this tablet".
- **Not yet tested on real devices** beyond one iPad 7th gen (iPadOS 17): Safari's
  gestures, the on-screen keyboard, the share sheet and audio need real hardware.

## Known limits

- PDF and video export don't exist in the web editor (they need Electron).
- Undo goes back one Move-pad press at a time.
- Holding a nudge key or button drops presses while a save is running (existing
  nudge handler).
- The freehand lasso hasn't been checked on a real device.

## Porting to the three.js field

The fork's three.js field already separates input from editing
(`FieldEditor` takes `FieldPointer` events; `fieldPointerInput.ts` currently ignores
touch). To port:

1. Reuse the gesture state machine's rules (`touchGestures.ts`): one finger edits,
   a second finger cancels and navigates until all fingers lift, long press arms and
   commits on lift (decided by event timestamps, cancelled by a large first jump),
   two/three-finger taps, palm rejection.
2. Add `kind: "mouse" | "pen" | "touch"` to `FieldPointer`; use a wider click slop
   and the 12 px move threshold for touch; a tap-only hit radius of ~22 px.
3. Rebuild the pill, the drag modes and the readouts on the field's overlay.
4. Port `touch-canvas.spec.mts` scenarios; they describe behavior, not Fabric.
