# Plan: tablet layout on fork main (0.2)

Status: accepted 2026-11-12. The owner deferred decision 1; the others follow the
recommendation unless the owner says otherwise. Tracking issue: fork #594 (field) and #679 (Edit music).
Inputs: [audit.md](audit.md), `docs/tablet-layout.md`, `docs/field/tablet-port.md`,
ADR 0001. The guide for future features is
[tablet parity](../conventions/tablet-parity.md).

## How the first tablet layout was built (upstream #1060)

The first tablet layout took two days of work (2026-10-23 and 24) and landed as one
squash commit, `c9784b34a`: 237 files, +21.5k/−1.9k lines.

- **Shared contract first.** Before any area work started, an integration branch
  (`touch/tablet-mvp`) held the pieces every area depends on: `InputModeStore`, the
  `touch:` variant and `TouchModifierStore`.
- **Area branches.** Separate workers (`touch/canvas`, `ui`, `timeline`, `platform`,
  `nudge`) each stayed inside their own files and were merged in four rounds.
- **Persona sims after each round.** Ten personas ran on emulated tablets with real CDP
  multi-touch (`~/touch-mvp/sim`). The average "usable on this tablet" score went from
  2.8/5 to 4.3/5.
- **Real iPad 7, then five independent reviewers.** The device found what the sims
  couldn't:
  - Fingertips are 40–50 px wide in Safari, so a contact-size palm rule ate every touch.
  - The iOS file picker greys out custom file types.
  - The Home Screen status bar left a strip at the bottom of the screen.
  - Fabric's canvas memory crashed Safari.
- **The fork merge (#438).** It kept everything that didn't depend on Fabric or the old
  page timeline. It dropped the field adapter, the touch toolbar, the compact timeline,
  pinch zoom and three browser specs (`docs/field/tablet-port.md`).

The same shape works again: settle the contract first, split the work by area, run sims
between rounds, and test on a real device before claiming support.

## Principles

- Desktop behavior and layout don't change. Every touch difference sits behind
  `touch:`, `useIsTouchMode()` or a press's `pointerType`. Each ticket runs the area's
  existing mouse scenarios unchanged.
- Touch reaches the same actions, through `runAction` and `ActionButton`, never through
  store setters.
- Fingers navigate by default and the Pencil edits precisely. A finger edits when it
  starts on a marcher or the selection, or while a tool is armed. Layout follows the
  device, never the press. These hold from ADR 0001 unless the owner changes them
  (questions below).

## Phases

The work is one integration branch, fork `tablet/host`, with ticket PRs into it,
following the owner's usual process. Fast checks gate each ticket; the PR into `main`
is fully gated. Sizes: S ≈ a day or less for an agent, M ≈ 1–3, L ≈ more.

### Phase 0: contract and stopgaps (do first; small, unblocks the rest)

| #   | Ticket                                                                                                                                                                                                                                                       | Size |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 0.1 | Add `kind: "mouse" \| "pen" \| "touch"` to `FieldPointer`. Add a kind-aware thresholds module: click slop, move threshold, hit radius, handle reach and double-tap slop; mouse values unchanged.                                                             | S    |
| 0.2 | Move the CDP touch and pen helpers (`touchGesture`, `fingerDrag`, pen drag) out of `navigation.spec.mts` and `box-tool.spec.mts` into `e2e/browser/app.mts`, with a 48 px fingertip radius. Add a "mouse in touch emulation" project for no-regression runs. | S    |
| 0.3 | Title bar: show the show's path again until `toolbarSlot` is filled (fixes the touch regression now).                                                                                                                                                        | S    |
| 0.4 | Touch pill: Snap runs `runAction("toggleSnap")`; Add and the roles go through the same seam.                                                                                                                                                                 | S    |
| 0.5 | Add a fork web build to the `~/touch-mvp/sim` driver (`--build`) and confirm one persona run on fork main as the baseline.                                                                                                                                   | S    |
| 0.6 | Make Basic/Expert a registered command.                                                                                                                                                                                                                      | S    |

### Phase 1: field touch editing (the core; replaces upstream's Fabric adapter)

| #   | Ticket                                                                                                                                                                                                                                                                                                                                                                                                             | Size |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1.1 | **Gesture adapter in `field/three`.** One pointer-event adapter feeds `touchGestures.ts` for touch and pen presses. It replaces `listenForTouch` (`TouchEvent`-based), `listenForLongPresses` and the touch early returns. Effects map to `editor.pointerDown/Move/Up/Cancel`, `panBy`/`pinchStep`, `longPress` and `historyQueue`. Mouse presses skip it. Includes `penPalmGuard` (timing only, no contact size). | L    |
| 1.2 | One finger on a marcher or the selection moves it after 12 px. A second finger cancels the move and restores it. Tap selects with a 22 px radius. Tap on empty field clears.                                                                                                                                                                                                                                       | M    |
| 1.3 | Drag modes on the pill (`fieldDragMode.ts`): Auto (finger pans, pen boxes, press-and-hold then drag boxes), Box, Lasso and Pan, plus a "finger selects" option, so both defaults can be tried on a device (decision 1). Add a Subtract role.                                                                                                                                                                       | M    |
| 1.4 | Shape tools and the prop tool take one finger while armed. The floating editor gets Finish, Undo point and Discard in the touch layout. Reshape and selection handles get a touch and pen hit area.                                                                                                                                                                                                                | M    |
| 1.5 | Long press: opens the mode's menu if there is one, otherwise the field menu (pen and finger). Double-tap equivalents become menu entries (corner ↔ smooth, reset pivot, reach inside).                                                                                                                                                                                                                             | M    |
| 1.6 | Two-finger tap undoes and three-finger tap redoes, with toasts, through `historyQueue`.                                                                                                                                                                                                                                                                                                                            | S    |
| 1.7 | Drag step readout and held-roles chip placed clear of the finger. `touch:` sizes in `CanvasZoomControls`.                                                                                                                                                                                                                                                                                                          | S    |
| 1.8 | Port `touch-canvas.spec.mts` and `mouse-canvas.spec.mts` (`git show c9784b34a:…`) as field scenarios on `window.fieldTest`.                                                                                                                                                                                                                                                                                        | M    |

### Phase 2: touch toolbar (fills `toolbarSlot`)

| #   | Ticket                                                                                                                                                                                   | Size |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 2.1 | Port upstream's pattern to the fork's toolbar: tabs in the title bar, the tab's controls in a panel over the field, starts closed, state remembered. Revert 0.3's stopgap when it lands. | L    |
| 2.2 | Shapes tab: captions, a Ring button, "Hold R" only once a keyboard has been seen. Give `SegmentedTextSwitch` (Editor/Preview) touch sizes. Keep the View 3D button visible in portrait.  | S    |

### Phase 3: timeline

| #   | Ticket                                                                                                                                                                                                                                                                                                   | Size |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 3.1 | **Gesture regions.** The ruler and page row scrub with one finger. One finger on the track body moves a clip or, on empty space, pans. Two fingers pan and pinch anywhere. A second finger cancels a drag and restores it.                                                                               | L    |
| 3.2 | Pinch zoom adapted from `pinchZoom.ts` (it uses px per second; the fork uses px per beat), plus ± buttons in touch mode.                                                                                                                                                                                 | M    |
| 3.3 | Hit areas: 44 px for the flags, page flag grips (straddling the edge, visible on the selected page), clip edges and the ⋯ on the selected clip, hold edges, keyframes, loop ends and the splitter. Use `touchTargets.ts`.                                                                                | M    |
| 3.4 | Menus: a "…" chip on the selected page box with the full page menu; "Edit move" in it. Long press with jitter tolerance on the playhead and ticks.                                                                                                                                                       | M    |
| 3.5 | Compact touch transport: Prev, Play, Next and the readout always shown, with a "…" for Loop, speed, sound, Fit, zoom, Edit music, add page or subset at the playhead, step by count or to the ends. Play variants from a long press on Play. Speed opens its popover on tap (timeline and 3D transport). | M    |
| 3.6 | Port `touch-timeline.spec.mts` as scenarios on the fork's timeline.                                                                                                                                                                                                                                      | M    |

### Phase 4: sweeps

| #   | Ticket                                                                                                                                                                                                             | Size |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 4.1 | Size and label sweep: Props panel and its sidebar button, Appearance, Field panel, Inspector ("Place selected ▾", distribute, Pivot grid), floating shape editor, welcome and What's new, launch page in portrait. | M    |
| 4.2 | Hints: `LongPressGuard` also shows a control's `Tip` hint line and disabled reason. Rounding descriptions use `InfoTip`. The hold line shows where its link goes.                                                  | S    |
| 4.3 | Palette: in touch mode, don't autofocus the input (no on-screen keyboard until the field is tapped).                                                                                                               | S    |

### Phase 5: 3D View

| #   | Ticket                                                                                                                                                              | Size |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 5.1 | `touch-action: none` on the 3D canvas. In the Map scheme one finger pans. Double-tap or long press sets the orbit centre. Size sweep of the camera bar and overlay. | M    |
| 5.2 | Web on iPad: the pop-up becomes a tab and hides the editor. Decide on an in-page 3D view for tablets (owner question).                                              | L    |

### Phase 6: Edit music on touch (fork #679, after 0.2 unless the owner says otherwise)

Bigger hit radii and handles always shown on the selected stretch. The band menu
becomes reachable through a "…" chip or long press. Double-click actions also go in that
menu.

## Verification gates

1. **Per ticket:** unit tests for any new rule, browser multi-touch scenarios for the
   behavior, and the area's mouse scenarios unchanged. The PR states its touch path
   (tablet parity, section 6).
2. **Per phase:** 2–3 persona sim rounds on a fork web build, at most 3 in parallel.
   Also a scripted base-vs-branch mouse run showing identical behavior.
3. **Before claiming support:** the owner checks on a real iPad with a Pencil.
   - Pencil and palm behavior, including whether a Pencil fires stylus `TouchEvent`s
     that pan.
   - WebGL memory and frame rate on an older iPad.
   - The file picker, Home Screen app, audio unlock and the 3D View.

   Windows tablets stay unclaimed until someone tries one.

## Decisions

Each item gives the recommendation first; the plan follows it unless the owner
overrides it.

1. **One finger on empty field: deferred to the end of Phase 1.** The gesture adapter
   (1.1) and drag modes (1.3) work either way, so this is only which mode is the
   default. Candidates: pan (ADR 0001's Auto: a finger pans, the Pencil draws a box, press
   and hold then drag draws a box), or select (one finger draws a box or lasso, two
   fingers navigate). Decide by trying both on a real iPad, finger only and with a
   Pencil. The rest of this plan doesn't depend on it.
2. **Long press on the field.** Recommended: the field menu, since it's the right-click
   equivalent and the fork's menus need it; adding or removing a marcher from the
   selection moves to the pill's Add and Subtract. Upstream used long press to toggle
   selection.
3. **Two- and three-finger tap undo and redo.** Recommended: yes, as upstream.
4. **Timeline: one finger on empty track space.** Recommended: pan; scrub only on the
   ruler and page row.
5. **Timeline clip rows.** Recommended: keep the rows short; tap selects, and the
   selected clip gets 44 px handles and a ⋯ chip. Alternative: taller rows in touch mode.
6. **Play variants on touch.** Recommended: long press on Play opens a menu (Play on,
   from here, pause).
7. **Is the palette enough for rare actions** (hold from previous, beat step, go-to)?
   Recommended: yes, but anything used every few minutes gets a visible control.
8. **Toolbar.** Recommended: port upstream's tabs-in-title-bar pattern rather than
   design a new one.
9. **3D View on a web iPad.** An in-page view, or leave the pop-up as a known limit
   for 0.2?
10. **Scope for 0.2.** Recommended: Phases 0–3 and 4.2–4.3; Phases 5–6 after.
