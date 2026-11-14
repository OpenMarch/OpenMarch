# Tablet audit of fork main (2026-11-12)

This audit checks fork `main` at `fb18d762c` (0.2.0-beta.2 plus three 3D View commits)
against the tablet layout that upstream shipped in #1060 (`docs/tablet-layout.md`).
It is based on reading the code; nothing was run on a device. Paths are relative to
`apps/desktop/src`. The plan built from this audit is in [plan.md](plan.md).

## Summary

- **The infrastructure survived the merge.** `InputModeStore` and `<html data-input>`
  carried over, along with Settings › Touch & Input, the `touch:` variant, the 44 px
  `@openmarch/ui` base components, `InspectorDock`, the Move pad, `LongPressGuard`,
  `ActionButton`'s long-press captions, `KeyboardSeenStore`, toast placement, on-screen
  keyboard handling, the web show library and video export, and the title-bar palette
  button.
- **Fingers can't edit the field.** `field/three/fieldPointerInput.ts:43,49,53` returns
  early for `pointerType === "touch"`. A finger only pans and pinches
  (`fieldNavigation.ts:470-533`). A Pencil edits exactly like a mouse, with no palm
  guard. On iPad a Pencil also fires stylus `TouchEvent`s, so a pen drag probably pans
  too; this still needs a device check.
- **The touch pill has no effect on fingers.** Its roles only reach pen and mouse
  presses, its Snap button calls `setSnap()` directly instead of running the
  `toggleSnap` action, and the timeline ignores it.
- **The kept upstream touch modules are dead code.** Nothing imports `touchGestures.ts`,
  `penPalmGuard.ts`, `touchHitTest.ts`, `fieldDragMode.ts`, `canvasModifiers.ts`,
  `timeline/pinchZoom.ts`, `pageScroll.ts`, `touchTargets.ts` or
  `audio/markerHitWidth.ts`, except their tests.
- **The touch title bar regressed.** In touch mode `TitleBar` hides the show's path to
  make room for `toolbarSlot`, but nothing fills the slot (`useToolbarTabsSlot` has no
  callers), and the full toolbar still sits below it.
- **The timeline isn't touch-aware at all.** Its surface is `touch-none`
  (`TimelineVariants.tsx:1053`), so every one-finger drag scrubs. There is no way to pan
  it sideways or scroll its tracks, zoom is Ctrl+wheel only, most menus open only on
  right-click, and targets are 6–14 px.
- **Palette coverage is good.** Almost every action is in ⌘K, which a tablet can reach
  through the title-bar magnifier. The gaps are listed below.

## `touch:` coverage

| Area                                                                                              | Files with `touch:` |
| ------------------------------------------------------------------------------------------------- | ------------------- |
| titlebar, sidebar                                                                                 | all                 |
| toolbar 4/10, inspector 2/12, launchpage 3/31, web 3/4, mobile 1/9, marcher 1/8                   | partial             |
| field, shapes (tool, editor, transform), items (Props), preview, welcome, view3d, tempo, timeline | none                |

## Field (2D)

| Feature                                                                     | Desktop                                     | Finger today                                          | Pen today                               | Gap                                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| Select, Shift-click add, clear                                              | click (`fieldEditor.ts:681-770`)            | pans                                                  | as mouse                                | finger editing; 4 px click slop and 5 px hit radius are too small for a finger |
| Marquee (Shift adds, Alt subtracts)                                         | drag on empty field                         | pans                                                  | works; no subtract toggle               | drag-mode menu (Auto/Box/Lasso/Pan, kept in `fieldDragMode.ts`); Subtract role |
| Lasso                                                                       | double-click then drag                      | none                                                  | awkward                                 | drag mode or long press then drag                                              |
| Move marchers (Shift fine, ⌘ constrain)                                     | drag                                        | pans                                                  | works; pill roles apply                 | the gesture arbiter                                                            |
| Scale/rotate handles                                                        | drag 13 px handles (`groupTransform.ts:19`) | none                                                  | works                                   | larger hit area for touch and pen                                              |
| Draw a shape (box, circle, line, curve, arc)                                | the armed tool claims presses               | pans                                                  | works                                   | one finger draws while a tool is armed                                         |
| Line points: double-click to finish, right-click to undo a point            | `shapeToolMode.ts:476`                      | long press undoes a point; can't add points           | can't take a point back                 | Finish / Undo point / Discard buttons in the floating editor                   |
| Reshape handles (corners, points, tangent, pivot)                           | drag; 10 px reach (`toolEnv.ts:14`)         | none                                                  | works                                   | reach scaled by pointer kind                                                   |
| Point, segment and arc menus                                                | right-click                                 | long press (#569)                                     | none (no barrel button on Apple Pencil) | long press for the pen too                                                     |
| Double-click a point or pivot; ⌘-click / double-click to reach inside a box | double-click, ⌘                             | none                                                  | works                                   | menu entries; Reach-inside role or menu                                        |
| Field menu (group, holds, align, swap, select all)                          | right-click (`FieldContextMenu.tsx`)        | none                                                  | none                                    | long press on the field opens it                                               |
| Shape ring                                                                  | hold or tap R                               | none (Shapes tab instead)                             | none                                    | Ring button; captions on the Shapes tab                                        |
| Floating shape editor                                                       | click, scrub numbers                        | probably works (pointer capture)                      | works                                   | `touch:` sizes, Discard button (Escape only today)                             |
| Prop tool (polygon finished by double-click)                                | drag, clicks                                | none                                                  | works                                   | arbiter plus a Finish button                                                   |
| Pan and zoom                                                                | wheel, right or middle drag                 | one-finger pan, pinch                                 | as mouse                                | zoom controls are 12–18 px                                                     |
| Undo/redo by two- or three-finger tap                                       | keys                                        | none (logic in `touchGestures.ts:483`, not connected) | n/a                                     | wire it to `historyQueue`                                                      |
| Palm rejection                                                              | n/a                                         | n/a                                                   | no guard; a palm pans during a pen drag | `penPalmGuard` in the arbiter                                                  |
| Hover feedback (cursors, next line segment)                                 | hover                                       | none                                                  | only with a hover-capable Pencil        | show while the press is held                                                   |

`FieldPointer` (`field/editor/fieldEditor.ts:69`) has no pointer kind. The thresholds
that should read one are `CLICK_SLOP` (:217), `DOUBLE_CLICK_SLOP` (:227),
`hitRadius` (`hitTest.ts:13`), `handleAt` (`groupTransform.ts:90`) and
`HANDLE_REACH_PX` (`toolEnv.ts:81`).

## Timeline and Edit music

| Feature                                                          | Desktop                                          | Touch today                            | Gap                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------- |
| Play / Stop                                                      | click, Space                                     | works                                  | 24 px                                                                                 |
| Play on, play from the playhead, pause                           | Alt- or Shift-click Play                         | plain Play only                        | menu on long press, or separate buttons                                               |
| Step by count or to the ends                                     | Shift- or Alt-click prev/next                    | page steps only                        | "…" menu                                                                              |
| Scrub                                                            | click or drag the surface                        | every one-finger drag scrubs           | scrub only on the ruler and page row                                                  |
| Pan sideways, scroll the tracks                                  | wheel, trackpad                                  | **impossible**                         | two-finger pan; `touch-pan` on the track body                                         |
| Zoom                                                             | Ctrl+wheel; Fit                                  | Fit only                               | pinch (`pinchZoom.ts`, needs px-per-beat); ± buttons                                  |
| Shift-click to extend the page selection; ⌘-drag to draw a range | modifiers                                        | none                                   | menu entry or the pill's Add role                                                     |
| Start flag and playhead drag/swap                                | drag 12–14 px buttons                            | works, small                           | 44 px hit areas                                                                       |
| Page flag drag (page counts)                                     | 12 px grip shown on hover                        | works, barely                          | 44 px grip straddling the edge, visible on the selected page; a second finger cancels |
| Move clip (in time, peel off, merge)                             | drag a 14 px row                                 | works, tiny                            | taller rows, or handles on the selected clip only                                     |
| Resize a move                                                    | 6 px edges shown on hover                        | barely                                 | 44 px edge handles on the selected clip                                               |
| Move menu                                                        | right-click or 18 px ⋯                           | ⋯ works                                | 44 px ⋯                                                                               |
| Edit move (isolate)                                              | double-click                                     | via ⋯ only                             | page "…" chip                                                                         |
| Page menu (keyframe, hold, clear, subset, split, delete)         | right-click (`TimelineRangeMenu.tsx:604`)        | **unreachable** except via the palette | "…" chip on the selected page box                                                     |
| Hold edges, keyframe diamonds, Basic ticks                       | 8–13 px; some menus on right-click               | small; Radix long press works          | 44 px hit areas                                                                       |
| Add page at the end; subset                                      | pill; Shift = subset                             | adds a page; no subset                 | subset choice in a menu                                                               |
| Create page at the playhead                                      | right-click the playhead; F                      | fragile long press                     | transport "…" entry                                                                   |
| Loop bar ends                                                    | 12 px knobs shown on hover                       | hard                                   | 44 px ends                                                                            |
| Playback speed (down = Shift; slider = right-click)              | click, right-click                               | steps up only                          | tap opens the popover in touch mode (3D transport too)                                |
| Splitter (double-click resets)                                   | 8 px                                             | works, small                           | 44 px grip                                                                            |
| Edit music: tempo line, points, marks                            | 6–7 px hit radii, double-click, right-click menu | drags work; menu unreachable           | bigger radii, "…" chip, menu entries (fork #679)                                      |

The transport folds into "⋯" below 640 px (`TimelinePrimitives.tsx:154`). With 44 px
buttons it needs to fold at about 900 px, based on content width.

## Everything else

| Surface                          | State                                                        | Gap                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title bar                        | 44 px controls; palette button in every layout               | empty `toolbarSlot` hides the show's name                                                                                                           |
| Toolbar                          | tabs 44 px; full toolbar below the title bar                 | upstream's touch toolbar (tabs in the title bar, panel over the field) not ported; Editor/Preview switch ~20 px; View 3D button hidden under 480 px |
| Alignment tab                    | captions, 44 px                                              | rounding descriptions are `title=` only                                                                                                             |
| Shapes tab                       | icon-only, no captions                                       | captions; "Hold R" hint shown with no keyboard; no Ring button                                                                                      |
| Left sidebar                     | 88 px rail with captions                                     | Props button has no name (no caption, no 44 px)                                                                                                     |
| Props, Appearance, Field panels  | no `touch:`                                                  | 10–16 px icon buttons; `title`-only labels                                                                                                          |
| Inspector                        | `InspectorDock` drawer, Move pad, compact mode work          | distribute inputs and "Place selected ▾" rows small; hold-line destination is hover-only; Pivot grid 16 px                                          |
| `Tip` hint lines                 | shown on hover                                               | `LongPressGuard` reads only the accessible name, so hints never reach touch                                                                         |
| Palette                          | opens on tap, close button, no key hints                     | `autoFocus` pops the on-screen keyboard over the list                                                                                               |
| Welcome, What's new, launch page | mostly base components                                       | small dots; launch tab list is 350 px wide, so portrait is cramped                                                                                  |
| Basic / Expert                   | Settings, welcome                                            | not a registered command                                                                                                                            |
| 3D View camera                   | touch: one finger orbits, two pinch and pan, in every scheme | Map scheme doesn't pan with one finger; double-click to set the orbit centre has no touch path; canvas lacks `touch-action: none`                   |
| 3D View overlay                  | camera bar 28 px; no `touch:`                                | size sweep                                                                                                                                          |
| Web 3D pop-up on iPad            | `window.open` becomes a tab and hides the editor             | an in-page 3D view on tablets (design question)                                                                                                     |

### Actions with no visible touch path

These are reachable only through the palette (or not at all):

- Play on, play the page / pause, step by beat, go to the show's start or end, loop
  toggle, go-to (G)
- Shape ring, group shapes (⌘G), finish a point-by-point line (Enter)
- Hold from previous (⌘H), the "set all to previous page" family, playback speed
  steps and reset
- **No path at all:** hold-to-speed-up and hold-to-slow-down (`]` `[`), the field menu
  (until long press opens it), Basic/Expert (no command).
