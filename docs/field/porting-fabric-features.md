<!-- cspell:words dblclick pointerdown mousedown havok fenris -->

# Porting a Fabric Feature to the New Field

**Fabric is gone as of #209.** The in-flight Fabric features (#181, #187,
#188, #182, #114) must port to the new field by this guide before they can
land on `main`.

Field work that was still in progress on Fabric when the migration started
isn't ported by the migration (owner decision, 2026-10-15). This guide is for
whoever moves one of those features onto the new field.

Read [ADR 0005](../adr/0005-three-field-renderer.md), the
[implementation plan](implementation-plan.md) (architecture rules and the
interaction rules table) and the handoff notes in [phases/](phases/) first.
The notes name the seams in more detail than this page.

Paths below are under `apps/desktop/src/` unless they start with `docs/` or
`e2e/`. The handle names (#198) and the line tool's (#203) were on fork PRs
#237 and #238 when this was written; check them against `field-renderer`.

## Where things went

| On Fabric                                                                                                        | On the new field                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canvas.on("mouse:down" …)`, listener classes (`DefaultListeners`, `LineListeners`)                              | The editor (`field/editor/fieldEditor.ts`). The renderer reports `pointerDown`/`pointerMove`/`pointerUp`/`pointerCancel`/`pointerLeave` with a `FieldPointer` (field point, screen point, button, modifiers). A drag becomes a `FieldGesture` (`kind`, `move`, `end`, `cancel`) through `startDrag`: `startTransform ?? startMove ?? startArea` (#198, #196, #195). A tool that owns every press is a mode, like `LineTool` (#203). |
| `mouse:down:before`, overriding `canvas._target`, capture-phase listeners on the wrapper                         | `FieldEditorPorts.takePress` (asked first on every edit press; `field/takeFieldPress.ts`), or a rule in the editor that runs before the marcher hit test (handles do this: `handleAt` comes before `marcherAt`). No DOM listeners compete with the editor.                                                                                                                                                                          |
| Pan presses (Alt-drag, right-drag) checked by hand                                                               | One rule: `isPanButton` in `field/editor/view.ts`, `isPanPress` in `field/three/fieldNavigation.ts`. The editor never sees pan presses.                                                                                                                                                                                                                                                                                             |
| `fabric.Object`s added to the canvas (`fabric.Rect`, `fabric.Line`, `fabric.Text`, polygons)                     | Static or many shapes: a plan of strokes, dots and labels (`field/timelineOverlays.ts` style) drawn by `three/layers/OverlayLayer` (`StrokeBatch`, `DotBatch`). Gesture previews, handles and outlines that change on every pointer move: an SVG component in `three/FieldOverlay.tsx` (see `LineToolPreview` in #203). Per-marcher looks: `MarchersLayer` and `LabelsLayer` buffers.                                               |
| `canvas.requestRenderAll()`                                                                                      | Nothing to call for the overlay (React). For GPU layers, bump a version and `invalidate()`; the canvas draws on demand.                                                                                                                                                                                                                                                                                                             |
| `canvas.getZoom()`, `viewportTransform`, `after:render` to place HTML                                            | The one view store `three/fieldView.ts` (`useFieldViewStore`, `fieldToElement`, `elementToField`). Layers read zoom through `useFieldDraw()` (`three/fieldDrawContext.ts`), never the store directly, or exports draw at the screen's zoom. HTML placed over the field subscribes to the view store, as `KeptMarksPlacer` does.                                                                                                     |
| `canvas.getCanvasMarchers()`, `CanvasMarcher.getMarcherCoords()`                                                 | Drawn positions: `FieldMarchers` (`three/fieldMarchers.ts`: `ids`, `positions`, `version`, overrides included), which the editor sees as `FieldEditorPorts.marchers()`. Saved positions: the timeline resolver. Names and drill numbers: the marchers query, not the field.                                                                                                                                                         |
| `window.canvas` reads in app code                                                                                | `activeFieldEditor()` (`field/editor/activeFieldEditor.ts`) for actions on the field on screen (`selectAll`, `rotateSelection`). In tests, the field test API.                                                                                                                                                                                                                                                                      |
| `window.canvas` reads in tests                                                                                   | The field test API, `window.fieldTest` (`field/fieldTestApi.ts`), plus saved show data. Add an optional reading there (as `lineTool()` in #203) and implement it in `three/threeFieldTestApi.ts`.                                                                                                                                                                                                                                   |
| `setActiveObject`, `getActiveObjects`, `selection:created`/`cleared`, `setSelectionLocked`                       | The one app selection, `SelectedMarchersContext`. The editor writes it through `FieldEditorPorts.selection` and the rules in `field/editor/selectionRules.ts` (`selectionAfterClick`) and `selectionArea.ts`. Locking the selection while a tool is open means the tool's mode takes every edit press, as the line tool does.                                                                                                       |
| `object:moving` and `object:modified` writes                                                                     | `MoveGesture` (`field/editor/moveGesture.ts`) with live positions through `showPositions`; the drop through the `drop` port, `field/fieldDrop.ts` (`dropMarchersOnTimeline`), the drop-to-timeline planner unchanged. Pending, snap-back and one undo step come with it.                                                                                                                                                            |
| `getRoundCoordinates2` on move, Alt and Shift checks, `lockMovementX/Y`                                          | `MoveTransform` (`ruledMove` in `field/editor/moveRules.ts`). Alt's quarter speed is `precisionDelta`, and re-anchoring when Alt goes down is `anchorAt`.                                                                                                                                                                                                                                                                           |
| Fabric controls (`hasControls`, corner controls, `setControlsVisibility`)                                        | `handlePoints`, `handleAt` and `handleCursor` (`field/editor/groupTransform.ts`), and the `HandleGesture` base with `ScaleGesture` and `RotateGesture` (`field/editor/transformGestures.ts`) from #198. The editor hit-tests handles itself; the overlay stays `pointer-events: none`.                                                                                                                                              |
| Double click (`mouse:dblclick`)                                                                                  | The editor keeps the last click (`DOUBLE_CLICK_MS`, `DOUBLE_CLICK_SLOP`) and marks the next press `double` (#195). Extend that; don't add a DOM listener.                                                                                                                                                                                                                                                                           |
| Click vs drag thresholds                                                                                         | `CLICK_SLOP` (4 screen px, no time limit) in `fieldEditor.ts`, for every press, handles included.                                                                                                                                                                                                                                                                                                                                   |
| Hover cursor set on Fabric objects                                                                               | `FieldEditor.cursor()` (`FieldCursor`), shown by `three/fieldPointerInput.ts`.                                                                                                                                                                                                                                                                                                                                                      |
| `canvasObjects/` helpers with no Fabric in them (`stepSizeWarning.ts`, `labelForms.ts` on box v1)                | Move them out of `global/classes/canvasObjects/` before #209 deletes the folder.                                                                                                                                                                                                                                                                                                                                                    |
| Fullscreen perspective: `rotateX` on the wrapper of Fabric's canvas in `Canvas.tsx`, reset on leaving fullscreen | The `fieldTilt` wrapper in `three/ThreeField.tsx` tilts the canvas and its overlays together (#209). The field takes no input in fullscreen, so nothing hit-tests through the tilt; the canvas sizes by layout (`resize={{ offsetSize: true }}`), not by its tilted box.                                                                                                                                                            |

## Guard rails

From the spec (#189) and the plan. Reviews check them.

- The editor is plain TypeScript: no React, no three.js, no Fabric. New
  editor and renderer code imports nothing from `fabric`,
  `components/canvas/` or `global/classes/canvasObjects/`.
- The field draws on demand. One component per layer, never one per marcher.
- Per-frame data goes into GPU buffers through refs, from a frame hook or a
  store subscription. No React state changes per frame.
- The SVG overlay reads the camera through `fieldView.ts` only.
- Layers read zoom and quality through `useFieldDraw()`.
- Performance claims come from production builds only. Headless WebGL on the
  agent machine is software GL; say so with any number.

## Checklist for one feature

1. **List the Fabric seams** the feature uses. Diff it against its base and
   look for `fabric` imports, `window.canvas`, `canvas.on(`, `_target`,
   `setActiveObject`, `requestRenderAll`, `getCanvasMarchers` and files under
   `components/canvas/` or `global/classes/canvasObjects/`.
2. **Keep the pure parts.** State machines, geometry and data writes usually
   carry over unchanged. Only the glue to Fabric is rewritten.
3. **Pick a seam per Fabric use** from the table above. Write down any rule
   that changes, and check it against the
   [interaction rules table](implementation-plan.md#interaction-rules). A
   conflict with a row is an owner decision, not a porting choice.
4. **Write the scenarios first**, through the field test API and saved data
   (see the next section). Add a test API reading if the feature has state a
   user sees that the API can't read yet.
5. **Write editor unit tests** (Vitest, `field/editor/__test__/`) for the
   gesture rules and math.
6. **Build it** on the seams. Keep changes inside the feature's files; a
   new port or mode on `FieldEditor` is fine, a change to another gesture's
   rules isn't.
7. **Check by eye** what the test API can't read (overlay shapes, colors),
   with screenshots on the PR.
8. **Run the scenarios yourself**, in the browser and in Electron. CI doesn't
   run them. Put the commands and pass counts in the PR body.

## Scenarios on both drivers

Scenarios live in `apps/desktop/e2e/browser/tests/`. They drive real pointer
and keyboard events and assert on the field test API and saved positions,
never on R3F components, three.js objects or shaders.

- **Before #209**, pin today's behavior on Fabric first, then run the same
  scenarios on the new field. A rule that changes on purpose is a `change:`
  scenario marked `test.fail(field === "fabric", …)`, and it points at a row
  of the rules table.
- **After #209**, Fabric is gone. If the feature's Fabric behavior matters,
  pin it by running the scenarios against the feature's old branch first, and
  record the result in the PR.

Commands, from `apps/desktop`:

```sh
# Browser
pnpm run build:browser
pnpm exec playwright test --project=browser tests/<spec>.spec.mts

# Electron (om-capture's runner on the agent machine), one worker per display
~/om-capture/e2e --repo <worktree> --project=electron-scenarios --workers=1 tests/<spec>.spec.mts
```

To run a scenario against Fabric, check out `field-renderer-pre-209` (a
detached worktree). Only there do `FIELD=three`/`FIELD=fabric` and the
fixture's `field` and `webgl` options exist:

```sh
# field-renderer-pre-209 checkout only
pnpm exec playwright test --project=browser tests/<spec>.spec.mts              # Fabric
FIELD=three pnpm exec playwright test --project=browser tests/<spec>.spec.mts  # the new field then
FIELD=fabric ~/om-capture/e2e --repo <worktree> --project=electron-scenarios tests/<spec>.spec.mts
```

The fixture options (`uiSettings`, `showFile`, `seedSql`, `initScript`,
`fieldQualityNotice`) are in `e2e/browser/fixtures.mts` and
`e2e/browser/README.md`. Shared steps are in
`app.mts` (`dragFrom`, `dragMarcher`, `goTo`, `selectPage`) and
`timeline.mts` (`goToPage`, `isolate`, `emptyField`).

## Inventory of in-flight Fabric work (2026-10-15)

Checked: every open fork PR (`gh pr list -R AlexDumo/OpenMarch-timeline
--state open`) and the fork branches with commits since 2026-10-09 that touch
Fabric field code. The migration's own ticket branches (`field/*`) aren't
listed. #237 (#198) and #238 (#203) touch `MarcherRotationInput.tsx` and
`fabricFieldTestApi.ts` only as part of the migration.

| Work                                                                                                                                            | Fabric seams                                                                                                            | Plan                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **#181** `shapes/box-v1`: box shape tool, with placed boxes (#187 `shapes/placed-boxes`) and box selection (#188 `shapes/box-select`) merged in | Many; see [below](#box-v1-181-with-187-and-188)                                                                         | Port on hold (#204); decisions first        |
| **#182** `tempo/rebase-main`: tempo lab                                                                                                         | Mounts `<TapTheBeatPanel />` in Fabric's `Canvas.tsx`. Nothing else.                                                    | Mount it beside the field instead           |
| **#114** `timeline/p8-12-replan` (docs only)                                                                                                    | None of its own; the P8.12 plan it records names `Canvas.tsx` and the canvas listeners as readers of `useSelectedPage`. | Update the plan's list                      |
| P7.11 spec-shape handles (on `main` and `field-renderer`, not a PR)                                                                             | `useTimelineShapeCanvas.ts`, `TimelineShapeOverlay.ts`, `isTimelineShapeHandle` in `canvasListeners.selection.ts`       | Dropped; deleted in #209 (owner decision)   |
| `shapes-draw`, `timeline/shapes`                                                                                                                | Earlier shape UI                                                                                                        | None: both are ancestors of `shapes/box-v1` |

No Fabric field code in: #227 (stop returns), #216 (playback speed), #137
(Control+G), #147 (cue storage), #118, #119, #120 (cues), #150, #151 (3D
uniforms and flags), #153 (floor ADR).

### #182 Tempo lab

`TapTheBeatPanel` is an absolutely placed panel over the field; it doesn't
read Fabric. Mount it in the element both fields share in `App.tsx` (the
parent of `<ThreeField />`), or in `ThreeField`'s root div after #209. Its
pointer events must not reach the field: the editor only sees presses on the
canvas element, and `attachFieldNavigation` already leaves presses on
controls alone. Check that a wheel over the panel doesn't zoom the field.

### #114 P8.12 replan

When P8.12 is built after #209, the field's selected-page read is
`useSelectedPage()` in `field/three/ThreeField.tsx`; the editor reads none.
Replace `Canvas.tsx` and "selection and movement listeners" in the plan's
list with that.

### P7.11 spec-shape handles

Dropped (owner decision on #209). The inspector's shape editor
(`components/inspector/TimelineShapesEditor.tsx`) drew the picked shape on
Fabric with handles to drag (`timeline/useTimelineShapeCanvas.ts`,
`TimelineShapeOverlay.ts`; geometry and commits in
`timeline/timelineShapeCanvas.ts`). #209 deleted all three, since nothing
else used the geometry; the inspector still edits shapes through its inputs.
A later port can take `timelineShapeCanvas.ts` (`shapeOutline`,
`shapeHandles`, `dragHandle`, the store's `commit`) back from
`field-renderer-pre-209` and draw the handles as an SVG component in
`FieldOverlay`, with a handle gesture on the `HandleGesture` base.

### Box v1 (#181, with #187 and #188)

**What it does.** The Shape tool's box (B, or the inspector's Box button):
drag a footprint, marchers fill it on half steps, handles stretch the
intervals, ± and `[` `]` change the file count, Enter places and Esc
cancels. Placed boxes are saved as recipes, outlined on the field by the View
tab's **Shapes** setting, and kept true to the field as members move. A click
on a member selects the whole box (Figma-like), a double click selects that
marcher, and a selected box is edited in place. It also adds marcher label
forms to the View tab (auto, numbers only, off; size; above or beside) and
removes the old shape UI. Specs:
`docs/timeline/research/shapes/06-box-v1.md` and `07-placed-boxes.md` on the
branch.

**Keep as is (no Fabric).** `shapes/tool/toolMachine.ts` (`press`,
`pointerMove`, `release`, `pressTarget`, `slotsOf`, `targetsOf`), `toolKind.ts`,
`shapes/box/` (`boxGeometry.ts`, `boxTool.ts`), `shapes/kinds/`,
`shapes/geometry/`, `shapes/assign.ts`, `shapes/placed/liveBox.ts`,
`placedBox.ts`, `boxMembership.ts`, `commitBox.ts`, the stores, the keys
components, `db-functions/shapeRecipes.ts`, and
`canvas/previewContext.ts` (reads the timeline stores only).

**Fabric seams and their new homes.**

| Box v1 file                                                                                                                                                   | Uses                                                                                                                         | New seam                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool/ShapeToolLayer.ts`                                                                                                                                      | Capture-phase `pointerdown`/`mousedown`/`dblclick` on Fabric's wrapper, `stopPropagation`, `fabric.Polygon/Circle/Line/Rect` | A tool mode on `FieldEditor` (like `setLineTool`) that routes edit presses to `toolMachine` after `takePress`; an SVG preview in `FieldOverlay` (outline, spots, walks, handles) from a snapshot the editor exposes, like `lineToolShape()`.                              |
| `tool/useShapeToolCanvas.ts`                                                                                                                                  | `canvas.shapeToolLayer`, `setSelectionLocked(true)`                                                                          | A hook in `ThreeField` that turns the mode on and off from `useShapeToolStore`. The mode takes every edit press, so the selection can't change; decide whether Ctrl/Cmd+A is allowed (it isn't asked by `takePress`).                                                     |
| `tool/toolEnv.ts` (`toolEnvFor`), `canvas/shapeCanvasContext.ts` (`shapeContextFor`)                                                                          | `canvas.fieldProperties`, `canvas.uiSettings`, `canvas.getZoom()`                                                            | `FieldProperties` from its context and settings from `useUiSettingsStore`, read per event (as `ruledMove` does); zoom from the editor's `zoom()` port. `HANDLE_REACH_PX / zoom` stays.                                                                                    |
| `canvas/shapeCanvasContext.ts` (`marchersOnCanvas`, `currentCanvas`)                                                                                          | `window.canvas`, `getCanvasMarchers()`, `getMarcherCoords()`                                                                 | Drawn positions from `FieldEditorPorts.marchers()` / `FieldMarchers`; drill ranks from the marchers query.                                                                                                                                                                |
| `tool/ShapeToolReadout.tsx`, `placed/PlacedBoxReadout.tsx`                                                                                                    | `canvas.on("after:render")` to place HTML                                                                                    | Place from `fieldToElement` with a `useFieldViewStore` subscription, as `KeptMarksPlacer` does.                                                                                                                                                                           |
| `placed/PlacedBoxLayer.ts`, `placed/usePlacedBoxesCanvas.ts`                                                                                                  | `fabric.Rect` and `fabric.Text` per box                                                                                      | A plan (outline strokes and a label per box) drawn by an `OverlayLayer`; or the SVG overlay if few. Hidden during playback and while the tool is open, as today. Decide whether exports draw it (they don't today).                                                       |
| `placed/useBoxSelection.ts`, `placed/boxClick.ts`                                                                                                             | `mouse:down:before` replacing `canvas._target`, `mouse:dblclick`, `selection:cleared`, `setActiveObjects`                    | A click rule in the editor: a port such as `groupOf(id)` that `selectionAfterClick` consults, and the double press (#195's last click) on a member to enter the box. Leaving the box on an empty-field click or Esc.                                                      |
| `placed/useLiveBox.ts`                                                                                                                                        | A second `ShapeToolLayer` with claims; hides Fabric's controls on the active group                                           | When the selection is a placed box, `startTransform` returns the box's handle gestures (on the `HandleGesture` base) instead of #198's scale and rotate, and the overlay draws the box's handles; `handles()` in the test API must report the ones drawn.                 |
| `placed/leftBoxToast.ts` (`nameOf`)                                                                                                                           | `getCanvasMarchers()` for a drill number                                                                                     | The marchers query.                                                                                                                                                                                                                                                       |
| `shortcuts/handlers/useCursorActionHandlers.ts`                                                                                                               | Fabric's select-all path also writes the app's selection; the line tool's actions are removed                                | Drop the select-all change: on the new field `selectAllMarchers` calls `activeFieldEditor()?.selectAll()`, which writes the app's selection. The removed `applyQuickShape` and `alignmentEventDefault` handlers go with the line tool decision below.                     |
| `OpenMarchCanvas.refreshMarcherLabels`, `CanvasMarcher.labelBeside/labelNumbersOnly/labelFontSize/labelsOff`, `canvasObjects/labelForms.ts` (`crowdedLabels`) | Fabric text objects per marcher                                                                                              | `LabelsLayer` (one `TextBatch`): text, size, offset and visibility per label, recomputed in a store subscription when positions or settings change, not per frame. Settings through `useFieldDraw()` so exports can choose. Move `labelForms.ts` out of `canvasObjects/`. |

**Decide before porting** (the guide doesn't decide these):

- **Migration number.** #181 adds `0021_mature_havok` (the recipe tables).
  Fork `main` already has `0021_blue_dust` from #148, and #147 queues
  `0022_right_fenris`. The recipes migration needs a new number on top of
  whatever has landed, and the snapshot regenerated with the repository's
  script.
- **ADR 0004 isn't accepted.** The recipe model is
  `docs/adr/0004-shape-recipes.md` on #181, status "proposed", and box v2's
  feedback (binary membership, no overrides) amends its decision 3. The
  number 0004 is also taken by `0004-performer-cues.md` on the cue branches
  (#118), also unaccepted. One of them needs a new number.
- **The line tool.** Box v1 deletes the old line tool (`LineListeners.ts`,
  `AlignmentEventStore.ts`, `AlignmentEditor.tsx`) and the P7.11 shape editor
  in `44ac11ba8`. #203 ports that line tool to the new field through
  `AlignmentEventStore` (`field/fieldLineTool.ts`). Keep it, and #181 drops
  the deletion; or remove it, and the port also removes `LineTool`,
  `fieldLineTool.ts`, `LineToolPreview` and the test API's `lineTool()`.
- **Rules table conflicts.** A click on a box member selects the whole box,
  where the Click row (story 23) says a click selects only that marcher. The
  box tool's Alt means "don't snap" at full speed, where the Alt row says
  quarter speed for move, scale and rotate. Lock X / Lock Y must not
  constrain box handles (Lock row). Each needs a row edit or a box-specific
  exception, decided by the owner.
- **Box v1's own open questions** for the owner: the pressed back corner is
  empty when the short back rank is centered; later-page box copies go stale
  when an earlier page is edited; the split scores cells rather than
  edge-to-edge intervals.

**Scenarios.** Box v1's checks are om-capture scripts
(`~/om-capture/scenarios/box-v1.mjs`, `placed-boxes.mjs`, `box-select.mjs`)
on Fabric, not browser scenarios. A port writes them as browser scenarios
(#204's acceptance), with test API readings for the tool's state (outline,
spots, handles, readout) and assertions on saved positions and recipes.
