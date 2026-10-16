# Phase 1: Foundation

Pin today's behavior, and get the new field drawing the show behind a dev
switch.

## Tickets

- **#190 ADR 0005 and the work-package plan.** This folder and
  [ADR 0005](../../adr/0005-three-field-renderer.md).
- **#191 Field test API over Fabric.** The read-only field test
  API (see [the plan](../implementation-plan.md#the-field-test-api)) over
  today's Fabric field. The browser scenario helpers and existing scenarios
  switch to it. Behavior doesn't change.
- **#192 Tracer bullet.** A hidden dev switch turns on the React Three Fiber
  field. It draws the field and every marcher and label at the playhead,
  driven by playback and scrubbing, and follows the renderer guard rails.
  Field geometry and marcher positions come from modules shared with the 3D
  View. The field test API gets its second implementation.
- **#206 SVG exports from show data.** Coordinate sheets and drill-chart SVGs
  are generated from show data with no canvas, so exports stop depending on
  Fabric. Dots sit exactly on their coordinates.

## Exit gate

- The scenario suite reads the field only through the field test API, and
  passes on Fabric.
- The same scenarios can be pointed at the new field behind the dev switch,
  even though most fail until phase 2.
- Coordinate sheets and drill charts no longer import Fabric. The video export
  still draws on a Fabric canvas (`exporting/video/videoCanvas.ts`) until #207.

## Handoff notes

Append notes the next tickets need: file locations, seams, surprises.

- **#206** (fork PR #213, into `field-renderer`): `exporting/utils/drillChartSvg.ts` draws the field, dots, labels
  and individual-chart paths as plain SVG from `FieldProperties`, positions
  and appearance stacks; `svg-generator.ts` keeps `generateDrillChartExportSVGs`
  and adds `getFieldImageForExport`. It mirrors `createFieldGrid` element for
  element (minus Fabric's half-pixel offset), so #200 can lift its line and
  label layout if the new field wants a shared 2D field plan. The Fabric
  helpers the video export needs (`initializeCanvasForRendering`,
  `applyMarcherAppearancesForPage`, `getFieldPropertiesImageElement`) moved
  unchanged to `exporting/video/videoCanvas.ts`; #207 deletes them.
- **#206:** the lab web build can't open the page-era demos in dev or build
  (`Buffer` in `electron/database/backup.ts`, and `lab:dev` pre-bundles
  drizzle's migrator past the `fs` shim). The export diffs used converted
  copies of the demos.
- **#230:** if CI's core `test` job fails once and passes on rerun, suspect a
  fast-check generator. `fc.float`/`fc.double` draw NaN unless you pass
  `noNaN: true`, even with `min`/`max` set (those already keep out
  infinities). Reproduce with `fc.check(..., { numRuns: 200000 })`.
- **#224:** to read several tables as one committed state outside the editor's
  write lock (the 3D View window, an export, a test API reading), use
  `db.batch([...])`: main runs the reads in one synchronous call and waits out
  any open transaction (ADR 0002, amendment 2026-10-15). For the timeline,
  `readTimelineTablesSnapshot` does this and `acquireExportResolver` uses it.
  `readTimelineTables` reads one statement at a time: use it only inside a
  transaction or under `withTimelineWriteLock`. A test database without batch
  reads (the sql.js fixture) makes `readTimelineTablesSnapshot` throw.

### #192 Tracer bullet

**Turning it on.** `localStorage.setItem("openmarch:dev:field", "three")`
and reload, or `?field=three` in a browser build. `src/field/fieldRenderer.ts`
reads it once at startup; `App.tsx` mounts `ThreeField` instead of Fabric's
`Canvas`. Remove both in #209. With no WebGL the field throws "Error creating
WebGL context" into the app's error boundary; #205 owns that.

**Files** (`apps/desktop/src/field/three/`):

- `ThreeField.tsx`: the R3F `Canvas` (`frameloop="demand"`, orthographic,
  `antialias: false`), plus two non-drawing components. `FieldCamera` refits
  the view on every resize and points the camera at the view store.
  `PlayheadDriver` fills the marcher positions: paused, from a
  `useTimelineSelectionStore` subscription on `displayedBeat` (with the
  isolation plan, as Fabric's static render); playing, in a `useFrame` at
  priority -1 from `getLivePlaybackPosition`, invalidating each frame.
- `fieldView.ts`: the one view store (zoom in CSS px per field unit, pan as
  where field (0, 0) sits from the canvas's top-left). `cameraBounds` maps it
  to the camera, `fieldToElement` to the page. **#194** writes zoom and pan
  here, and must replace `FieldCamera`'s refit-on-resize with its own rules
  (today's fit and limits). The initial view differs from Fabric's until then
  (it shows the whole field with a margin).
- `fieldMarchers.ts`: positions outside React (ids, a `Float64Array`, a
  `version` and an `idsVersion`). Layers copy it into GPU buffers in
  `useFrame` when the version changes. **#193** can add selection the same
  way (a per-marcher buffer plus a version), read by `MarchersLayer`.
- `layers/`: `FieldLayer` (every field rectangle in one instanced draw, lines
  at least one device pixel wide and faded by coverage; yard numbers and
  checkpoint labels as two SDF batches), `MarchersLayer` (instanced dots shaded
  in the fragment shader, at least 1.5 CSS px in radius), `LabelsLayer`
  (marcher labels, one SDF batch, faded between 4 and 7 CSS px per em).
- `sdfText.ts`: the prototype's glyph atlas and text batch, in y-down field
  units, with a color per glyph.
- `threeFieldTestApi.ts`: the second field test API. `selection()` is `[]`,
  `handles()` and `activeGesture()` are null until the editor tickets.
  `marchers()` reports the positions last sampled, which draw on the next
  frame.

**Shared with the 3D View** (ADR 0005 D-2.5):

- Field geometry: `fieldGeometry.ts` calls the 3D View's `planField` with the
  `theme` style and only maps meters to field units. The checkpoint labels
  outside the field are planned in `fieldGeometry.ts`, because the 3D surface
  has none.
- Marcher positions: `src/timeline/positionBuffer.ts` (`PositionBuffer`,
  `playbackBeat`) is the one sampler. Fabric uses it as
  `TimelinePositionBuffer`, the new field through `FieldMarchers`, and the 3D
  View's `ShowPositions` over its own resolver.

**For the drawing tickets:**

- **#199**: `MarchersLayer` colors every dot with the theme's
  `defaultMarcher` (uniforms). Per-marcher appearance means per-instance
  attributes there and per-glyph colors in `LabelsLayer` (`TextBatch` already
  takes a color per label).
- **#200**: `planField` gets `image: null`; the grid and half-line settings
  aren't honored yet (`planTheme` always draws both). Fonts are SDF stand-ins:
  yard numbers in Times New Roman centered on the 3D plan's number band
  (Fabric uses its default font, `charSpacing: 160`, 22 units left, top at the
  inside line), checkpoint labels in bold Courier New (Fabric: `mono`). Render
  comparisons will show both.
- **#205**: MSAA is off on purpose: dots and text antialias in their shaders.
  On llvmpipe, MSAA took 2,000-marcher playback from 56 to 34 fps. DPR is
  `[1, 2]`.

**Scenarios.** `FIELD=three` selects the new field (fixture option `field`;
see `e2e/browser/README.md`). `existing-show` (load, page change) and the new
`playback` scenario pass on both fields, in the browser and Electron. On the
new field the scenarios that select or drag marchers fail until #193, #196 and
#198. `field-test-api`'s view scenario now finds the field by
`data-testid="fieldCanvas"`, which both fields carry, instead of Fabric's
`canvas.upper-canvas`.

**Fabric touched once:** `MarcherRotationInput` returns early when there is
no Fabric canvas (`window.canvas`), which the new field doesn't create. No
Fabric behavior changes.
