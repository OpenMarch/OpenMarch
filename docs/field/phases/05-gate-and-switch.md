# Phase 5: Parity gate and switch

## Tickets

- **#208 Parity gate run.** The full gate from
  [the plan](../implementation-plan.md#parity-gate): the scenario suite on
  both drivers, render comparisons across the corpus, export diffs, the
  in-app benchmark on a real low-end Chromebook and an integrated-GPU laptop,
  and the owner's hands-on checklist in a lab build. Needs the owner.
- **#209 Switch to the new field and delete Fabric.** The new field becomes
  the only field. Deletes Fabric, its speed workarounds and unit tests, the
  Fabric driver of the field test API and the dev switch. There's no rollback
  setting. Merging needs the owner's explicit OK. Features still in
  progress on Fabric aren't ported; they follow
  [the porting guide](../porting-fabric-features.md) after the switch.

## Exit gate

#209 merged. The field freeze ends: remove the freeze notes from
`apps/desktop/AGENTS.md`, `apps/desktop/src/components/canvas/README.md`
and [the README](../README.md). (Done in #209.)

## Handoff notes

Append notes the next tickets need: file locations, seams, surprises.

**From #223 (undo/redo shortcuts dropped).** The undo and redo scenarios
(move-marchers "undo and redo a move", edit-positions' undo steps) failed
because the shortcut handler dropped presses, not because of the field. It
gated on the `canUndo`/`canRedo` queries, which refetch only after a write
commits, and on an in-flight flag that stayed set until the previous action's
queries were fetched again. A press right after an edit, or a redo right after an
undo, was ignored. Now presses queue in order (`historyPressQueue.ts`), and
`performHistoryAction` reports `nothingToDo` from inside its lock turn. For
#208: scenarios can press Ctrl+Z or Ctrl+Shift+Z as soon as the saved data
shows the previous step, with no wait for the history queries. On the new
field, move-marchers still fails at the drag until #196.

**From #239 (porting guide).** [porting-fabric-features.md](../porting-fabric-features.md)
maps Fabric seams to the new ones and lists the in-flight Fabric work with a
plan for each. For #209: P7.11's spec-shape handles (`useTimelineShapeCanvas.ts`,
`TimelineShapeOverlay.ts`, the inspector's `TimelineShapesEditor`) have no
port in any ticket, so deleting Fabric removes them unless the owner decides
otherwise (box v1 #181 deletes them too). Move the Fabric-free helpers out of
`global/classes/canvasObjects/` before deleting the folder
(`stepSizeWarning.ts`, see #201's notes). #182 mounts `TapTheBeatPanel` in
Fabric's `Canvas.tsx`; whichever of #182 and #209 lands second moves it
beside the field.

**From #208 (labels under dots).** The render comparison found the new field
drawing drill numbers over neighboring dots, where Fabric and the drill
chart export draw every dot over every number. Owner decision: match Fabric.
`LabelsLayer` is at render order 1.9 now (pathways 1.5, marchers 2), which
also applies to the video export; `label-stacking.spec.mts` pins it on both
fields by screen pixels.

**From #208 (benchmark on both fields).** "Run field benchmark" and
`window.fieldBenchmark` work on the Fabric field too, so real hardware can
compare the two until #209 (`FabricFieldBenchmark.tsx`, mounted beside
Fabric's `Canvas` in `App.tsx`; `fabricBenchmark.ts` reads Fabric through
`window.canvas` and its render events). The runner takes a `FrameProbe` and
a `BenchmarkView` per field; the new field's probe is
`three/benchmarkFrames.ts`, kept out of `benchmark/` so the Fabric field's
first chunk never imports three.js (`fieldChunk.test.ts`). Zoom is a pinch
(Ctrl+wheel) through each field's own input, since Fabric draws its grid
from a cache while it zooms. Reports carry `environment.field`. Compare the
fields by fps and frame intervals only: the CPU columns measure different
spans (the new field's frame hooks, uploads and render; Fabric's
`renderAll`), and Fabric's draw calls are "n/a". **#209:** delete
`FabricFieldBenchmark.tsx` and `fabricBenchmark.ts` with Fabric.

**From #208 (the gate's automated half).** Results:
[parity-gate-results.md](../parity-gate-results.md); the owner's checklist:
[parity-checklist.md](../parity-checklist.md). Left for the owner: the
checklist in the lab build, and the benchmark on a Chromebook and an
integrated-GPU laptop (steps in the results doc). New tools in
`e2e/browser/render/` (see its README): `corpus-render` (the corpus at three
zooms and four times), `stressShow.mts` (the 1,925-marcher show),
`export-compare` + `export-diff.mts` (drill chart SVG and PDF diffs) and
`benchmark` (the in-app benchmark on the corpus). For #209:

- The show fixture now waits for the field to hold still before every
  scenario (`waitForSettledField`): both fields center their view again once
  the panels settle, later in Electron. Keep it when Fabric goes.
- Run Electron scenarios with one worker per display (`--workers=1` per
  om-capture container). Several Electron windows on one Xvfb display drop
  gestures on the new field now and then (#236): a new window takes
  activation and the field cancels a press that loses pointer capture.
- The playback scenario can fail with parallel workers on either field: the
  clock and the field read the stepping audio clock at different moments
  (#250).
- Delete the Fabric halves with Fabric: `FabricFieldBenchmark.tsx`,
  `fabricBenchmark.ts`, the Fabric pass of the render and export capture
  specs (`setFabricView` in `render/compare.mts`).

**From #209 (the switch).** The three.js field is the only field. For later
tickets (#204, #214, and the features in
[the porting guide](../porting-fabric-features.md)):

- Gone: `components/canvas/` except `CanvasZoomControls.tsx`,
  `global/classes/canvasObjects/`, `MarcherVisualGroup` and the
  `marcherWithVisuals` query, `CanvasStore`, `useAnimation`,
  `useTimelineAppearance`, the Fabric timeline hooks
  (`useTimelineStaticRender`, `useTimelineFocusRender`, `useTimelineKeptMarks`,
  the canvas half of `useTimelineDimming`), `fieldRenderer.ts`, and the
  Fabric benchmark. `window.canvas` no longer exists. To read Fabric's code,
  check out `field-renderer-pre-209`.
- Moved: `stepSizeWarning.ts` is in `timeline/`. `useTimelinePathRender.ts`
  is `useTimelinePathSamples.ts` (sampling only; its tests moved with it).
- P7.11's spec-shape handles are deleted with `timelineShapeCanvas.ts` (owner
  decision). `TimelineShapesEditor` keeps its typed inputs; its canvas help
  text and the drag-commit link are gone.
- The Playwright codegen mode (`attachCodegenListeners`) recorded Fabric
  mouse events on marchers; it went with Fabric. The codegen IPC
  (`window.electron.codegen`) is still there; #254 tracks recording field
  presses again.
- Fullscreen's perspective tilt is ported: the `fieldTilt` wrapper in
  `ThreeField.tsx` tilts the canvas and its overlays, the canvas sizes by
  layout (`offsetSize`), and leaving fullscreen flattens it. The field takes
  no input in fullscreen, so pointer mapping never meets the tilt; a feature
  that wants input there must map through the transform.
- `window.canvas` is gone, and the plugin example in the 2025-06-12 blog post
  used it. The owner accepted the break: no replacement, and the plugin
  system is to be removed (#255).
- The e2e fixture has no `field` or `webgl` option. Electron always gets
  software GL (`--use-angle=swiftshader`). Run Electron scenarios one worker
  per display (#236).
- The render capture specs (`e2e/browser/render/`) compare two runs
  (`RENDER_LABEL`, `RENDER_BASE`) instead of two fields; `render-compare.py`
  takes two labels. For Fabric comparisons, use the harness on
  `field-renderer-pre-209`.
- The benchmark report still has `environment.field` (always `"three"`) and
  says "three.js field", so its reports compare with the pinned build's.
- `~/om-capture/e2e` passes `FIELD` through; nothing reads it now. Several
  om-capture custom scenarios (`scenarios/dc-lib.mjs`, `appear-parity.mjs`,
  `page-cascade.mjs`, `perf/scenarios/play-layer-probe*.mjs`,
  `scrub-parity.mjs` and others) read Fabric through `window.canvas` and need
  the field test API before they work again.

**From #256 (reload scenario).** Not a field bug. `reload.spec.mts` pressed
Shift+E to go to the last page, but #178 rebound Shift+E to step one beat
(last page is End, Alt+E or Alt+Shift+E now). After a reload the app opens at
the show's start (page 0, playhead 0), so one beat forward stopped partway
through page 1's move. The field drew marcher 1 there correctly, and
`expectCanvasMatchesShow` compared it with page 1's end. Fabric
(`field-renderer-pre-209`) failed the same way. Two things to know for later
scenarios: `expectCanvasMatchesShow` compares end-of-page spots for the page
`fieldTest.pageId()` reports, so it only holds with the playhead on a page
flag, never mid-move. A reopened show doesn't restore the page or playhead
it was left on, so a scenario that reloads has to navigate back itself.
Whether it should restore them is an open product question.
