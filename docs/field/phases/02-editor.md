# Phase 2: Editor

Build the editor module (plain TypeScript, no React, no three.js) and its
gestures on the new field. Every rule here is in the
[interaction rules table](../implementation-plan.md#interaction-rules).

## Tickets

- **#193 Editor core: click selection.** The editor owns the one selection,
  shared with the app, and hit testing in field coordinates. Click,
  Shift+click, click on empty field, Ctrl/Cmd+A and the hover cursor.
  Selection rings on marchers, and the selection box in the SVG overlay.
- **#194 Navigation.** Wheel zoom at the cursor, trackpad pan, pinch, right-
  and middle-drag pan, limits, zoom controls, fit and touch. Alt no longer
  pans.
- **#195 Marquee and lasso.** Marquee on drag, lasso on double-click-and-drag,
  Shift adds. The lasso closes only within 50 screen px of its start, with
  the green cue.
- **#196 Move and drop.** Drag one marcher or the selection. Under 4 screen
  px is a click. Drops go through the existing drop-to-timeline planner,
  unchanged. Pending positions, snap-back, one undo step, the "move them
  too" toast. Nudges and field actions verified unchanged.
- **#197 Snapping, precision and locks.** Single-marcher vs group snapping,
  Shift, Alt at ¼ speed, Lock X/Y on marchers only.
- **#198 Group scale and rotate handles.** Corner, middle and rotate handles
  in the overlay, with their Shift and Alt rules, no flipping, refit after
  each transform. The inspector's rotation input uses the same transform.

## Order

#193 and #194 start after #192. #195 and #196 follow #193. Then #197, then
#198. #193 → #196 → #197 → #198 is on the critical path.

## Exit gate

- Editor unit tests cover gesture rules, snapping, hit testing and transform
  math.
- Each ticket's scenarios pass on Fabric (with only the rules-table changes
  edited in) and on the new field.

## Handoff notes

Append notes the next tickets need: file locations, seams, surprises.

### #193 Editor core: click selection

**Files.** The editor is `apps/desktop/src/field/editor/` (no React, no
three.js):

- `fieldEditor.ts`: `FieldEditor`. The renderer reports `pointerDown`,
  `pointerMove`, `pointerUp`, `pointerCancel` and `pointerLeave` with a
  `FieldPointer` (field point, screen point in CSS px from the field element's
  top-left, button, Shift/Alt/Ctrl/Meta). It reads and writes everything else
  through `FieldEditorPorts`: the app's selection, the drawn marchers, the
  zoom, and `canSelect` (false for dimmed marchers, UI-9). `subscribe` fires on
  cursor and gesture changes. `CLICK_SLOP` is the 4 px rule.
- `hitTest.ts`: `marcherAt` (nearest selectable dot within a radius) and
  `hitRadius(zoom)`. `selectionRules.ts`: `selectionAfterClick`.
- `activeFieldEditor.ts`: the mounted field's editor, for app actions. The
  `selectAllMarchers` action uses it when the new field is on screen.

**The seam for #195 and #196.** A primary-button press is a `FieldPress`
(`start` pointer, `hit` marcher or null). Once it moves 4 screen px it's no
longer a click, and `FieldEditor.startDrag(press, pointer)` decides what it
becomes: return a `FieldGesture` (`kind`, `move`, `end`, `cancel`) and the
editor routes the rest of the press to it, and reports its `kind` as
`activeGesture()`. #193 returns null (nothing happens). Marquee and lasso
start from `hit === null`, a move from a hit. The lasso's double-click needs
the previous click's time and place: keep it in the editor, not the renderer.
Right, middle and (on a Mac) Ctrl presses return false from `pointerDown`, so
they're #194's.

**Selection.** The one selection is `SelectedMarchersContext` (Marcher
objects). `ThreeField` gives the editor ids through a ref that holds the last
write until React renders it, so two quick clicks build on each other. Hidden
marchers (#199's `FieldMarchers.hidden`) have no click target and aren't
selected by Ctrl/Cmd+A; the context also drops hidden marchers from the
selection.

**Renderer side** (`src/field/three/`): `fieldPointerInput.ts` attaches the
canvas's pointer events to the editor (touch is left to #194) and shows its
cursor. It cancels the editor's press only when the pointer it captured is
lost, so navigation's own captures don't. `FieldMarchers.setSelection` marks `selected` (`Uint8Array`, by `ids`
index) and bumps `selectionVersion`; `MarchersLayer` draws a 2 px ring in the
same instanced draw (`aSelected`). `selectionRing.ts` sizes dots and rings for
both. `FieldOverlay.tsx` is the SVG overlay over the canvas
(`pointer-events: none`), re-rendering on `FieldMarchers.subscribe`: it draws
the box around 2+ selected marchers. **#198** adds handles there and makes
`handles()` read them; the overlay needs `pointer-events` on the handles only.

**Decided changes.** Four Fabric behaviors differ, all from #189's stories,
each a `change:` scenario in `e2e/browser/tests/click-selection.spec.mts`
marked `test.fail` on Fabric, and in the rules table: a click on one of several
selected marchers narrows to it; a click on empty field inside the box clears;
Shift+click on empty field keeps the selection; a second Ctrl+A keeps
everything selected. **#196:** pressing a selected marcher and dragging must
still move the whole selection: the narrowing happens only on a click.

**Decided for #195 and #196.** A drag that starts on empty field inside a
multi-selection's box moves the selection, as Fabric does (owner decision); a
plain click there still clears it. #196 pins this with a scenario. The editor's
`startDrag` gets `press.hit === null` there, so the box test belongs in
`startDrag`: inside the box it's a move, outside it's a marquee or lasso.

**For #202.** A first press on the field during a paused preview selects on
the new field, where Fabric only clears the preview (story 60). #202 needs a
hook at the start of `FieldEditor.pointerDown` that can swallow the press
(done: `FieldEditorPorts.takePress`).

**Not covered yet.** The scenarios check the field's selection against the
inspector and the toolbar's Select tab, not the timeline (it reads the same
context). Dimming (story 20) has unit tests only; a scenario needs an isolated
move. Rings and the box are checked by eye (screenshots on the PR), since the
test API has no reading for them; #198's `handles()` covers the box. The hover
cursor updates on pointer moves only, so it can be stale while marchers move
under a still pointer (playback). Shift+click on empty field keeping the
selection follows the rules table's Shift row (a zero-size Shift marquee adds
nothing); decided by the orchestrator, and on the #208 hands-on checklist.

**Found while testing.** `move-marchers` "undo and redo a move" fails about 2
times in 3 on Fabric in the browser, on `field-renderer` before #193 too.
With `FIELD=three` under parallel load, the undo steps of `edit-positions`
("select all, then align", "copy every position") fail, also on the base;
they pass alone and in Electron.

### #194 Navigation

**Files.**

- `apps/desktop/src/field/editor/view.ts`: the view rules as plain
  functions, with Fabric's numbers: zoom limits (0.2 to 25), `zoomAt` (keeps
  the point under the cursor), `clampPan` (the field scrolls at most one element's size past an edge),
  `baseZoom` and `centerAtBase` (the opening and Reset view), `fullscreenFit`,
  `wheel` (mouse mode zooms, trackpad mode pans, Ctrl/Cmd or a pinch zooms in
  both), `pinchStep` (touch) and `isPanButton`. Unit tests in
  `editor/__test__/view.test.ts`.
- `apps/desktop/src/field/three/fieldNavigation.ts`: the thin DOM side.
  `attachFieldNavigation(surface, field, settings)`, `isPanPress`,
  `resetView` and `fitFullscreen`; `threeZoomControls`, which the existing
  `CanvasZoomControls` drives (its prop is now the `ZoomControlsCanvas`
  interface, which `OpenMarchCanvas` already satisfies; no Fabric behavior
  changed).
- `fieldView.ts`: the store now also holds `baseZoom` (100% in the zoom
  controls), `panning` and the `field` size. `fitView` is gone; the field
  opens at `centerAtBase`, as Fabric's.

**Seams for the editor tickets.**

- Navigation listens on `ThreeField`'s root div (the one with
  `data-testid="threeField"`), so it reaches the SVG overlay too. It
  measures from the canvas element, and leaves presses on controls
  (buttons, links, inputs, menus, dialogs) to them.
- **One pan-button rule:** `isPanButton` in `editor/view.ts` (right, middle,
  Ctrl+left on a Mac). `FieldEditor.isEditButton` uses it, so the editor
  skips exactly the presses navigation pans with; DOM code can use
  `isPanPress(event)` from `fieldNavigation.ts`. Navigation doesn't stop
  their propagation, so document-level "pointer down outside" handlers still
  see them. Touch presses aren't pan presses (touch editing is out of scope).
- The test API's `activeGesture()` is `"pan"` while `panning`, otherwise the
  editor's gesture.
- App actions that move the view call `setView` from `fieldNavigation.ts`
  (zoom and pan limits, and it counts as the user's navigation). "Zoom to
  collisions" (#201, `field/zoomToCollisions.ts`) does.

**Behavior notes.**

- The view opens once the field and a page are loaded, and centers again on
  each resize until 250 ms later, as the panels around the field settle (Fabric
  centers once more at 250 ms). Unlike Fabric, none of that undoes a zoom or
  pan the user has already made. A resize keeps the zoom and the top-left anchor; in
  fullscreen it fits again.
- **Decided (for the #208 checklist):** the new field applies the pan limit
  after every navigation. Fabric skipped it for right-drag, the zoom buttons
  and touch pinch (a right-drag could take the field off screen until the
  next wheel event). Accepted as a fix.
- **Decided (for the #208 checklist):** on a Mac, Ctrl+click without a drag
  no longer selects: it's a pan press (Ctrl-drag pans, per the rules table,
  and Ctrl+click is the Mac's secondary click). Accepted.
- The resize and the zoom buttons' limits are Fabric's as is: a resize
  doesn't re-apply the pan limit, and the buttons disable by the percentage
  (relative to the base zoom), so they can stay enabled at the real limits.
- Fullscreen fit is Fabric's as is, including that it measures the room with
  the 128 px above the field, so a height-limited fit runs the field's back
  edge up to about 40 px off the bottom (1600 × 1000 window). The
  `navigation` scenario pins this; fixing it is a separate decision.
- The fullscreen perspective tilt (`PerspectiveButton`) isn't on the new
  field yet; it isn't navigation.
- Scenarios: `e2e/browser/tests/navigation.spec.mts`. The fixture option
  `uiSettings` starts the app with given UI settings (mouse mode is
  `{ mouseSettings: { trackpadMode: false } }`). Touch goes through CDP
  `Input.dispatchTouchEvent`, one session per gesture.

### #196 Move and drop

**Files.** `src/field/editor/moveGesture.ts`: `MoveGesture`, the drag. It
moves the marchers by the pointer's delta from the press (so a dot keeps its
offset from the pointer) through a `MoveTransform`. `FieldEditor.startMove`
decides what a drag moves: a selected marcher moves the selection (no
narrowing), another marcher is selected first (Shift adds it, then the whole
selection moves), and empty field inside a multi-selection's box moves the
selection (`selectionBoxPadding` port, the box the overlay draws). Elsewhere
on empty field `startDrag` returns null: **#195** adds the marquee and lasso
there, after the `startMove` call. A release past the slop with no move event
in between still drags (start, move and end at once).

**The seam for #197.** `FieldEditorOptions.moveTransform` gets the raw
delta in field units, the pointer (its modifiers) and where the marchers
started, and returns their positions. `followPointer` is today's: snapping,
Alt at ¼ speed and Lock X/Y replace it. Nothing else changes.

**Live, pending and snap-back** are the editor's. It writes positions through
the `showPositions` port, which `ThreeField` maps to
`FieldMarchers.setOverrides`: overridden marchers are drawn there through
every fill (the playhead, isolation), with no React state; marchers dropped
from the map are sampled again. A drop calls the `drop` port and keeps the
marchers where they were dropped until it settles ("saved" once the write
reached the resolver, "refused" otherwise); only the last drop's answer
clears, and a drag in progress stays under the pointer. Hit testing and the
next drag start from the drawn positions, overrides included.

**Drops** go through `src/field/fieldDrop.ts`, which calls Fabric's
`canvasCoordinateWriter` and `moveMarchersInTargetMutationOptions` unchanged
(range, home, isolation, refusals, Move them too, one undo step). Its promise
must settle on every path, or marchers stay pinned.

**Isolation plan.** Only Fabric's canvas published the isolated move's plan,
so every drop in isolation was refused ("still loading") until the new field
published it too; it now does through #201's `useTimelineVisuals`.

**Scenarios.** `e2e/browser/tests/move-and-drop.spec.mts` (group drag and one
undo, box drag, unselected marcher, the 19 px flick as a `change:`, page and
home drops, Move them too, pending, isolation with the playhead moving to the
end, a pending drop in isolation, Basic's past-the-last-page refusal) and
`field-actions.spec.mts` (nudges with every modifier on the step grid,
distribute, flip, circle, keep, set to next page). `app.mts` gained
`dragFrom`, `dragMarcher`, `goTo` and `selectPage`. Fabric draws dots half a
unit off, so drop expectations allow a field unit. Fabric's handles sit on a
two-marcher selection's corners: pick a pressed marcher clear of them.

The pending scenarios record where the dot is drawn on every frame from the
release (`recordDrawn`): `window.electron` can't be patched in Electron, so
the database can't be held. A drop that settles before the resolver has the
save fails both. The editor logs an error if a drop hasn't settled in 30 s.

**Not covered / open.** The timeline's "nothing selected" state isn't
reachable from the UI any more; the refusal scenario uses Basic's "past the
last page", through the same toast and snap-back. In
isolation with the playhead before the move's end, a pending drop is drawn at
the dragged spot (at the end beat) until the save lands, then moves by the
plan's offset: the writer doesn't return the positions it writes. Shift+press
on an unselected marcher and drag adds it and moves the selection (as
Fabric); for the #208 checklist.

**For #202.** Fabric swallows the first press on the field while a paused
preview frame is held (`Canvas.tsx`, the preview-swallowing effect, story 60);
#202 added the same on the new field: `FieldEditorPorts.takePress` at the
start of `FieldEditor.pointerDown` (see #202's notes in
`04-timeline-and-tools.md`).

### #195 Marquee and lasso

**Files.** `editor/selectionArea.ts` holds the pure rules: `lassoCloses`
(under `LASSO_CLOSE_DISTANCE`, 50 screen px, measured as field distance times
the current zoom), `pointInPolygon`, `marchersInRect`, `marchersInPolygon`,
and `selectionAfterArea`. `editor/areaGestures.ts` has the two
`FieldGesture`s, `startMarquee` and `startLasso`; each exposes `shape()`, a
stable snapshot the overlay reads through `FieldEditor.areaShape()`.

**`startDrag` now** is `startMove(press) ?? startArea(press)`: #196's move
wins (a marcher, or empty field inside a multi-selection's box, the one box
test `insideSelectionBox`); the rest of the empty field is a lasso after a
double-click, else a marquee. The editor calls the gesture's `move` with the
first pointer, so a quick flick (released past the slop with no move in
between) selects at once. `area-selection.spec.mts` pins that a drag from
inside the box draws no marquee and keeps the selection.

**Double-click.** The editor keeps the last click (time, screen point, hit). A
press within `DOUBLE_CLICK_MS` (500) and `DOUBLE_CLICK_SLOP` (8 screen px) of a
click on empty field is a double press; dragged, it's a lasso; released, it's
a plain click, and starts no triple. The clock is `FieldEditorOptions.now`.
`pointerCancel` keeps the last click: `fieldPointerInput` cancels on
a lost pointer capture after every release.

**Rules as built.** The marquee takes every marcher whose dot it touches (its
click target, `hitRadius`), as Fabric's marquee touches objects; the lasso
takes centers. Both skip hidden and dimmed marchers, like a click and Ctrl+A.
Shift at the press adds; a marquee over nothing clears (Shift keeps). A lasso
released 50 px or more from its start changes nothing. The overlay draws the
marquee in the theme's shape color at 20% fill, the lasso dashed in
`primaryStroke`, and `nextPath` green while a release would close it.

**Scenarios.** `e2e/browser/tests/area-selection.spec.mts`: marquee scenarios
on both fields; one `change:` (Shift+drag is a marquee that adds, not
Fabric's lasso) is `test.fail` on Fabric; lasso scenarios skip on Fabric. The
green cue and the drawn shapes are checked by eye (the test API has no reading
for overlay shapes). The closing rule at other zooms is unit-tested only:
the new field can't zoom until #194 lands.

**Open for the #208 checklist.** Without Shift, the first click of a
double-click on empty field clears the selection, so a lasso that doesn't
close leaves nothing selected (with Shift, the selection is kept). "Within 50
screen px" is strict: exactly 50 doesn't close.
A lasso (Shift+double-click-and-drag included) can't start inside an existing
multi-selection's box: there the drag moves the selection (owner decision).

### #197 Snapping, precision and locks

**Files.** `src/field/editor/moveRules.ts`: `ruledMove(rules)` is the
`MoveTransform` `ThreeField` passes the editor. It reads `MoveRules` on every
pointer event (the coordinate-rounding settings, Lock X/Y from
`useUiSettingsStore`, the field's grid), so a setting changed mid-drag applies
at the next move. One marcher snaps through `getRoundCoordinates2`, the
function Fabric's `CanvasMarcher.handleMoving` uses; a group's delta is
rounded to whole multiples of each axis's rounding step. Shift or Alt turns
snapping off; a locked axis stays where the marchers started (a single locked
marcher snaps on the other axis only, as on Fabric).

**Alt** is in `MoveGesture`, not the transform: `precisionDelta` counts the
pointer's distance since the last event at ¼ while Alt is down, so the
transform gets the slowed delta (the seam's "raw delta" is that now). Pressing
Alt re-anchors on where the first marcher is drawn (`anchorAt`), so a snapped
drag goes on from the grid point with no jump. Releasing Alt keeps the lag
and snaps again. A modifier pressed while the pointer stands still applies at
the next pointer move: the renderer reports pointer events only. So a release
where the last move left the pointer drops the positions last drawn (Alt up
or Shift down just before letting go doesn't change the drop); a release
that moved evaluates the rules with its own modifiers.

**Scenarios.** `e2e/browser/tests/snapping-and-locks.spec.mts`. The rounding
ones set `coordinateRounding` through localStorage and reload; the grid comes
from the show file (`fieldGrid` in `positions.mts`, through the host bundle's
`FieldProperties`). `change:` scenarios on Fabric: a group snapping in whole
steps, Alt at ¼ speed, Alt pressed mid-drag. Fabric drops land up to about
1.1 field units off the pointer (half a unit for its dot offset, the rest
whole-pixel mouse positions zoomed out), so drags aim a quarter step off the
grid and compare within 1.5 units.

**For #198 and #204.** Lock X / Lock Y must not constrain shape or group
handles (rules table; Fabric locks them, a `change:` to pin there). Alt's
quarter speed for handles can reuse `precisionDelta` and `anchorAt`.

### #198 Group scale and rotate handles

**Files.** `src/field/editor/groupTransform.ts` holds the pure rules:
`handlePoints` (where the eight scale handles and the rotate handle sit on
the padded box, 40 CSS px above it for `rot`, turned with the box while a
rotation is dragged), `handleAt` (a 13 CSS px square per handle, Fabric's
control size; the nearest wins), `handleCursor`, `scaleFor` and
`scalePositions` (corners uniform along the diagonal, Shift frees them;
middles one axis, Shift ignored; `MIN_SCALE` instead of a flip),
`turnBetween`, `snapRotation` (15°, free with Shift or Alt) and
`rotatePositions`. `src/field/editor/transformGestures.ts` has
`ScaleGesture` and `RotateGesture`, the `FieldGesture`s, with Alt through
#197's `precisionDelta` (and `anchorAt` for the snapped angle).

**In the editor.** `pointerDown` asks `handleAt` after `takePress` and
before the marcher hit test, so a handle wins over a marcher under it, and
`startDrag` is `startTransform ?? startMove ?? startArea`. The editor
hit-tests the handles itself (the box is `selectionBoxPadding` around the
drawn selection), so the overlay stays `pointer-events: none`: no DOM
handle targets, and the one pointer path stays the canvas's. A click on a
handle does nothing. Handle drags drop through `drop`, the same pending,
snap-back and timeline path as a move, and never call `moveTransform`, so
Lock X / Lock Y and snapping don't apply.

**The overlay** draws the box from `three/selectionFrame.ts`
(`drawnSelectionBox`): the selected marchers' bounds, or during a rotation
the press's box turned by the gesture's angle (`FieldEditor.rotationFrame`).
The test API's `handles()` reads the same function, so it returns what's
drawn.

**The inspector's rotation input** (`MarcherRotationInput.tsx`) picks the
field on screen through `subscribeActiveFieldEditor`. On the new field it
calls `FieldEditor.rotateSelection(degrees)` while typing or dragging, and
`endRotation()` on blur or drag end; a rotation left at 0 saves nothing.
It shows what's typed until the rotation ends, then 0 again: the input
remounts on `FieldEditor.rotationVersion()`, which goes up whether a blur
or a press on the field saved it (the press saves first, before the blur).
That's a `change:`: Fabric's input shows the selection's angle since it
was made, and a typed value sets that angle. Whether the input is enabled
comes from the app's selection, which the editor's ref only catches up with
after render. A typed rotation is refused while the line tool is on
(#203's `lineTool`, which also takes every press first, so the handles are
inert and not drawn then), and is dropped unsaved when the selection
or page changes, when the input unmounts without a blur, or when a drop it
was typed over is refused. Transforms that change nothing (a whole turn, an
axis scaled by 1) return the positions exactly as they were, so they save
nothing even off the thousandths grid. During a handle rotation it doesn't follow the angle live (Fabric
did): that would re-render the inspector on every pointer move.

**Decided changes** (`change:` in `scale-and-rotate.spec.mts`, `test.fail`
on Fabric): Shift on a middle handle still scales its axis ("Shift does
nothing there"; Fabric cancels the scale while Shift is down), Alt is
precision on scale and rotate (Alt pans on Fabric), and a press on a handle
held over 300 ms but moved under 4 px changes nothing (Fabric's click has a
time limit, so it transforms). As on Fabric, Lock X / Lock Y leave the group
handles free, and the box fits the marchers again after a rotation (Fabric
rebuilds its selection after the save).

**Differences in the numbers, not pinned.** Fabric's box reaches past the
dots (dot size, labels), so it scales from a corner a few units outside the
outermost marchers and rotates about a center a little higher; the new field
scales from the outermost marchers and rotates about their bounds' center.
Scenarios compare within those few units. Fabric snaps the group's angle
since the selection was made; the new field snaps each drag's angle, which
is the same thing since Fabric's selection is rebuilt after every save.

**No flip, in numbers.** Dragged far past the opposite side, a handle
stops at `MIN_SCALE` (1%): the marchers stack about 1% of their spread
apart, in order. Fabric's `lockScalingFlip` holds the last valid scale
instead, wherever the pointer crossed. On the #208 checklist.

**For #204.** The box tool's own handles can reuse `handlePoints`,
`handleAt` and the gesture base in `transformGestures.ts`. Lock X / Lock Y
must not constrain them either.
