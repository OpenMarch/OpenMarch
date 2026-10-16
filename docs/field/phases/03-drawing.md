# Phase 3: Drawing

Make the new field look like today's in every show, and keep it working on
weak machines.

## Tickets

- **#199 Marcher appearance.** The appearance cascade from tags, sections and
  the field theme, and every dot shape, in the one instanced marcher draw.
  Dots sit exactly on their coordinates. Labels scale with the field and fade
  out below a readable size.
- **#200 Field themes and background image.** Every theme and field variant,
  and the background image with its fit or fill and opacity.
- **#201 Timeline visuals.** Pathways, previous and next positions,
  midpoints, step-size warnings, dimmed marchers, the isolation focus layer,
  kept marks, collision markers and "zoom to collisions". Needs #199 and
  #200.
- **#205 Weak machines.** Low-quality mode on software or missing WebGL with
  a one-time explanation, the Performance mode setting, the GPU blocklist
  override with a crash fallback, context-loss recovery, and the in-app
  benchmark ported from the prototype.

## Exit gate

- Render comparisons against Fabric on the demo shows show only the listed
  changes (dot offset, label fade).
- The in-app benchmark runs on production builds. Software-GL numbers are
  lower bounds; real hardware is checked in #208.

## Handoff notes

Append notes the next tickets need: file locations, seams, surprises.

### #199 Marcher appearance

**Resolution is shared, not re-implemented.** `resolveMarcherLook` in
`src/entity-components/appearance.ts` (on top of `resolveAppearanceFromStack`)
is the one place a stack becomes fill, outline, shape, visible, label visible
and the X's line color. The drill-chart export (`drillChartSvg.ts`) and the new
field both call it. Which stack applies at a beat is the timeline rule in
`services/appearance/appearanceSteps.ts` (the last flag crossed), through
`useMarcherAppearanceSteps`, the same steps the Fabric field and
`SelectedMarchersContext` use.

**Where it lives on the new field:**

- `FieldMarchers` samples the appearance with the positions. After each
  `fill(beat)` it holds `stacks` (per index in `ids`, null for the theme's
  default), `hidden` (a `Uint8Array`, 1 per hidden marcher) and
  `appearanceVersion`. It re-samples only when the ids change or the beat
  crosses an appearance change (`changeIndexAtBeat`), so playback costs a
  binary search per frame. `ThreeField` hands it the steps
  (`setAppearanceSteps`) from `PlayheadDriver`.
- `marcherLooks.ts` writes the per-instance buffers (`writeMarcherLooks`) and
  which labels show (`labelsShown`).
- `MarchersLayer`: `aFill`, `aOutline` (rgba 0–1) and `aShape` (`MARCHER_SHAPE`,
  -1 hidden) per instance. Every shape is a signed distance in the fragment
  shader, sized as Fabric and the export draw them; the 1-unit outline
  straddles the edge with mitered corners, as Fabric strokes. Hidden instances
  collapse to a point off screen. **#201**: dimming can be one more
  per-instance attribute here (an opacity), written the same way.
- `LabelsLayer`: a hidden label lays out as no glyphs. All labels take the
  theme's label color, as on Fabric (no appearance sets a label color).

**For #193 (hit testing):** skip marchers with `fieldMarchers.hidden[i] === 1`.
The scenario `marcher-appearance` › "a click goes through a hidden marcher"
(hidden F2 stands on F1; a click selects F1) passes on Fabric and waits on
#193 on the new field.

**Field test API:** each marcher has a `look` (shape, fill, outline, label
color, visible, label visible), read from Fabric's objects and from the new
field's stacks. Hidden marchers stay in `marchers()` with `look.visible` false.

**Render comparisons** (`e2e/browser/tests/render-compare.spec.mts`, opt-in
with `RENDER_COMPARE=<folder>`, then `e2e/browser/render-compare.py <folder>`):
captures the converted demo shows from `view3d-web/public/demos` (the page-era
copies in `web/public/demos` open with every marcher at 0, 0 in the harness)
plus a part 1 variant with every shape, outlines, a hidden section and hidden
labels, at two window sizes and three times, and pairs them in field units.
It needs Pillow (`pip install pillow`, in a virtual environment). The fixture's new
`showFile` option starts a test from any show file. **#200 and #208** can add
regions or shows there. Differences it shows that aren't #199's: the grid sits
half a line off on Fabric (the dropped offset), yard numbers and label glyphs
differ by about a pixel (SDF fonts, #200). Since #194 both fields open at
the same view. At very low zooms the new field's dots are larger than Fabric's, because
of #192's 1.5 CSS px minimum dot radius (Fabric has none).

### #200 Field themes and background image

**One 2D field plan.** `apps/desktop/src/field/fieldPlan.ts` (`planField2d`)
lays out the flat field in field units: today's `createFieldGrid`, element
for element, minus Fabric's half-pixel offset. It was lifted from #206's
`drillChartSvg.ts`, which now renders it to SVG (byte-identical output for
every template, variant and option); `three/fieldGeometry.ts` turns the same
plan into rectangles and SDF labels. The new field no longer uses the 3D
View's `planField`: its `theme` plan is in meters, clipped to the checkpoint
footprint (wrong for fields whose checkpoints aren't centered), has no
outside labels and puts the border inside the edge. The 3D View keeps
`planTheme` for its surface. Unifying the two (planTheme from `planField2d`)
would change how the 3D View looks; that's a separate ticket if wanted.

**Settings.** `FieldLayer` reads the grid lines and half lines settings from
`useUiSettingsStore` and rebuilds when they change. Fonts are named as Fabric
names them: yard numbers `"Times New Roman"`, checkpoint labels `"mono"` (a
family that doesn't exist, so both fields get the platform fallback), each
in its own glyph atlas; marcher labels keep bold Courier New. `TextLabel`
gained `letterSpacing` (em, between characters) for the yard numbers'
`charSpacing`.

**Field image.** `layers/BackgroundImageLayer.tsx` draws it at render order
-1, between the background (its own one-rectangle draw at -2) and the lines
(0). The bytes come from the 3D View's `useFieldImage` (decoded once per
image). Placement is `planFieldImage`, Fabric's fit/fill rule; like Fabric a
filled image isn't cropped to the field. Render order so far: background -2,
image -1, lines 0, field text 1, marchers 2, labels 3. **#201**: put timeline
overlays between 1 and 2, or above 3, as they sit in Fabric. (Since #208 the
labels are at 1.9, under the dots: see the phase 5 notes.)

**The image moves 0.5 field units relative to the lines, vs Fabric** (about
12 px at the maximum zoom of 25). Fabric draws its lines, background and
marchers half a grid line down and right in its plane, but not the image; the
new field draws all of them exactly on their coordinates, as the export does
(the spec's no-offset rule; accepted in review). Listed for the owner's
hands-on checklist (#208).

**Field test API.** `fieldImage()` returns where the image is drawn (field
units) and its opacity, or null. Because of the shift above, the Fabric
reading is half a field unit up and left of the new field's. `field-image.spec.mts` pins fit, fill and hidden on
both fields.

**Render comparisons.** `e2e/browser/render/` (Playwright project `render`;
see its README) captures every template, theme and variant on both fields at
the same view and writes side-by-side and diff PNGs. **#208** can extend its
case list to the demo shows and marchers. Differences it shows, all expected:
lines are pixel-snapped on the new field where Fabric smooths them over
two pixels; yard numbers are centered on their yard line (the export's rule)
where Fabric left-aligns them 22 units left of it; with a translucent
border color, Fabric's corners are darker, because its four border lines
overlap there and the new field's don't.

### #205 Weak machines

**Quality.** `src/field/fieldQuality.ts` (plain TypeScript) classifies the
WebGL renderer string (`hardware`, `software` or `none`), decides the mode
(`fieldQuality`: no WebGL, then a GPU crash, then software GL, then the
Performance mode setting) and holds what low quality changes in one table,
`QUALITY_SETTINGS`: DPR 1 instead of `[1, 2]`, labels hidden below 8 CSS px
per em instead of 4 (and not drawn at all when hidden), and field lines under
30% of a device pixel skipped instead of faded. MSAA is off in both modes
(field lines antialias in their shader since #249).
`src/field/three/useFieldQuality.ts` has `useFieldQuality()` for React and
`currentFieldQuality()` for frame hooks.

- **#199, #201 and other layers:** read `currentFieldQuality().settings` in
  the frame hook for anything worth cheapening (e.g. skip pathways' dashes or
  midpoints in low quality), and add the knob to `QUALITY_SETTINGS` rather
  than checking the mode.
- The setting is `fieldPerformanceMode` in `UiSettings`, shown in Settings,
  Appearance only while the dev switch picks the new field. **#209:** drop
  that condition and add `settings.general.performanceMode` to the
  Appearance section's `searchKeys`.

**What's on screen.** `FieldQualityNotice.tsx`: the one-time toast for
software GL (remembered in `localStorage` under
`openmarch:field:qualityNoticeSeen`) and for a GPU crash (once a session),
and `FieldUnavailable`, shown in place of the field without WebGL. The
default export of `ThreeField.tsx` is now an error boundary around
`ThreeFieldView`, so a canvas that can't get a context shows the
explanation instead of the app's error boundary.

**Context loss.** `fieldRecovery.tsx`'s `ContextLossGuard` (inside the
Canvas) asks for a frame when the browser restores the context (three
rebuilds its GPU state; the on-demand loop would otherwise never draw), and
starts the field over on a new canvas (a new `key`) if it isn't back within
2 s. Anything that holds GPU objects outside the layers' `useMemo` (like the
glyph atlases' textures) is re-uploaded by three on its own; keep CPU-side
copies of anything you upload.

**Desktop.** `ignore-gpu-blocklist` and the `gpu:crashed` /
`gpu:process-gone` channels: see ADR 0005 D-3, "How #205 built it". The app-wide switch was confirmed by the owner on 2026-10-15
(#208), including its effect on Fabric and the 3D View.

**Benchmark.** "Run field benchmark" in the command palette (on both fields
since #208) opens `src/field/benchmark/FieldBenchmark.tsx`; scripts call
`await window.fieldBenchmark.run()` for the same report as JSON
(`benchmarkMarkdown` turns it into the table). Each scenario runs 4 s and
measures every drawn frame through R3F's `addEffect`/`addAfterEffect`.
Scenarios are in `fieldScenarios.ts`:

- **#194:** zoom and pan write `useFieldViewStore` directly, bypassing the
  limits. That's fine for measuring; keep the store's shape or update them.
- **#196:** `drag` is a stub (reported as skipped). Make it select every
  marcher and drag them in a circle through the editor's move gesture, as
  the prototype's `bench("drag")`, and undo afterwards.
- **#208:** run it on production builds only (the dialog warns on a
  development build). Real-hardware rows come from there; software-GL rows
  are lower bounds.

**Scenarios.** `e2e/browser/tests/weak-machines.spec.mts` (new field only):
low-quality mode and its one-time notice under software GL, DPR 1 on a 2×
screen, no WebGL (browser only, through the new `initScript` fixture
option), a lost context restored and one never restored (simulated with
`WEBGL_lose_context`, checked on screen pixels), a killed GPU process
(Electron only, `show.killGpuProcess()`), and the benchmark from the command
palette. The fixture now marks the software-GL notice as already shown,
unless a test sets `fieldQualityNotice: true`, so the toast covers nothing
in other scenarios.

**First numbers** (2026-10-15, the in-app benchmark through
`window.fieldBenchmark.run()`, production browser build, headless Chromium,
SwiftShader, low-quality mode, 1206 × 699 CSS px at 1×, seeded shows of 8
pages, while four other agents loaded the machine). fps for play / scrub /
zoom / pan:

| Marchers | CPU       | fps                   | CPU ms per frame |
| -------- | --------- | --------------------- | ---------------- |
| 95       | 1×        | 50 / 33 / 54 / 55     | 0.2–0.4          |
| 95       | 4× slower | 31 / 26 / 41 / 38     | 0.9–1.5          |
| 385      | 1×        | 19 / 20 / 25 / 22     | 0.2–0.8          |
| 385      | 4× slower | 14 / 14 / 23 / 18     | 0.8–2.7          |
| 1,925    | 1×        | 4.9 / 4.9 / 7.1 / 5.4 | 0.3–1.6          |
| 1,925    | 4× slower | 3.5 / 4.2 / 7.2 / 5.2 | 0.7–4.9          |

Main-thread time stays under 5 ms a frame, so single-threaded software
drawing is the limit, as in the prototype (its 385-marcher SwiftShader
row: 29 / 26 fps). Low quality's cuts so far (DPR, labels, faint lines) don't
change that much: the marcher dots and labels at readable zooms are the fill
cost. #208's real-hardware rows are the ones that count.

### #201 Timeline visuals

**Same data as Fabric, new drawing.** The renderer-free parts of the Fabric
hooks were split out unchanged, and both fields use them:
`useTimelinePathSamples` (in `useTimelinePathRender.ts`),
`useTimelineFocusScene` (`useTimelineFocusScene.ts`; it also publishes the
isolation plan, which the playhead driver and drops in isolation need),
`useKeptMarks` (`useKeptMarks.ts`) and the kept-mark placement
(`timelineKeptMarks.ts`). The Fabric hooks keep their signatures.

**Plans, then two primitives.** `src/field/timelineOverlays.ts` turns the data
into plain strokes, dots and labels, sized as the Fabric objects they replace
(`planPathOverlay`, `planFocusOverlay`, `planCollisionOverlay`), and computes
"Zoom to collisions" (`collisionsView`). Unit-tested in
`field/__test__/timelineOverlays.test.ts`. `three/overlayBatches.ts` draws
them: `StrokeBatch` (one instance per segment, miter joins so translucent
lines never double up, dashes along the whole polyline, never under one device
pixel) and `DotBatch` (a fill and an outline centered on the edge). Buffers are
persistent and only grow; a new plan is written in place. `layers/OverlayLayer`
is one layer per plan, and only sets the zoom on a frame.

**Where they sit:** the isolation scene at render order 1.4 and the page's
pathways at 1.5 (over the field text, under the marchers), collision markers
at 4 (over the labels). Plans are in field units (pathways, collisions, which
scale with the zoom as Fabric's objects do) or CSS pixels (the isolation
scene, as `TimelineFocusLayer`).

**Dimming** is `three/fieldDimming.ts`, set from the timeline selection store
outside React. The marchers layer has an `aOpacity` per instance, and the
labels layer dims label colors. The field test API reads it as each marcher's
`dimmed`, on both fields. Hit testing already skips dimmed marchers (#193's
`canSelect`).

**Kept marks** are an SVG over the canvas (`three/KeptMarks.tsx`):
React renders the marks only when they change, and `KeptMarksPlacer` moves
them in a frame hook from the drawn positions and the view store. The hover
tooltip listens for pointer moves on the field's root element, hit-tests in
field units (`keptMarkAt`), and uses the same test id as Fabric's.

**Collisions.** Collision detection was off app-wide from upstream commit
b61834d8b until #226 (below). The scenarios that need a collision at a known
spot put one on the page through `window.openmarchCollisions`, which exists
only in Playwright sessions and stops detection from replacing it.
Fabric draws every collision marker and label at the field's top-left corner
(its objects hold the right coordinates; Fabric places them wrong). The new
field draws them where they are. "Zoom to collisions" goes through
`field/zoomToCollisions.ts`: Fabric as before, the new field with the same
framing written to the view store, and nothing while playing (as Fabric, which
has no markers then). **#194**: if the view store gains limits or
a setter, route this through it (Fabric doesn't clamp this zoom).

**Render comparisons.** `e2e/browser/render/timeline-render.spec.mts` (project
`render`, three first, then Fabric) captures pathways, mid-move, warnings,
next paths forced past their toggle, two isolated moves (4 and 91 of 95 marchers),
an isolation with a member selected, kept marks and collisions, plus a
baseline with none of them. Every case diffs within ±0.3 points of the
baseline (32.6% at fit, 14.7% large): what differs is the field grid
(#200's pixel snapping), not the timeline drawing. Known differences in the
drawing: Fabric stacks each marcher's path, midpoint and endpoint together,
where the new field draws all paths, then all dots; isolation lines use miter
joins and round ends where Fabric's Canvas2D uses round joins; collision
markers, as above. Shared helpers moved to `render/compare.mts`.

**For #202:** the kept-mark tooltip, and that dimmed marchers can't be
selected, are in and pinned (`timeline-visuals.spec.mts`). The "first press after a paused
preview" swallowing and Escape leaving isolation remain. **For #207:** the
video export can draw the same plans; `OverlayLayer` needs only a plan and a
render order. **For #209:** `planPathOverlay` imports the step-size rules from
`global/classes/canvasObjects/stepSizeWarning.ts` (no Fabric in it): move that
file out of `canvasObjects/` before deleting the folder.

### #226 Collision detection

**Where.** `global/classes/CollisionDetection.ts` is pure: `detectCollisions`
samples a `PositionSource` (the resolver, as the fields' `PositionBuffer` does)
between two beats and sweeps the marchers sorted by x, once per pair, where
they first come within `COLLISION_RADIUS` (10 field units, as before). Each
beat is sampled so the marcher moving most in it travels at most half the
radius between samples (1 to 32 samples a beat), so two marchers passing
through each other are caught. A collision's x and y are now the point
between the pair (it was one marcher's spot). `collisionWindow` is what the
selected page reports: from its positions (its end beat) through the move to
the next page, as the tab's "on the next page" always meant; the last page
checks only its own positions. Unit tests in
`global/classes/__test__/CollisionDetection.test.ts`.

**When.** `hooks/useCollisionDetection.ts`, mounted in `TimelineResolverHost`,
is a TanStack query keyed by the resolver version and the window, combined
with the marchers query for drill-number labels (`_combineCollisions`). It runs
for the selected page only, once the page and the version have held still for
150 ms, or at once when the cache has the answer (going back to a page). An
edit, undo or redo is a new version and so a new query. Never per frame, and
never while playing or scrubbing (`scrubbing` in the timeline selection
store), when the selected page follows the playhead. A drag's pending
positions aren't committed, so it doesn't run mid-drag. It reads the resolver
directly, not through `timelineStore.positionsAt`, so idle warming keeps
starting where the user is looking.

**The store.** `useCollisionStore` keeps each page's answer at the current
version (`setCollisions(page, list, version)`; a new version drops the rest).
`setCurrentCollision(page)` shows a known answer, and otherwise keeps showing
the last one until detection answers: blanking it made the toolbar close the
Collisions tab on every page change. The toolbar also doesn't close the tab
while playing or scrubbing; it waits for the page the playhead stops on. Both
fields still hide the markers during playback.

**Cost** (production browser build, a 6-core desktop CPU; detection is CPU-only,
so software GL doesn't matter here): 2,000 marchers in a 50 × 40 block moving
10 units a beat over a 16-beat page took 26 to 39 ms (20 units apart) and 34
to 38 ms (12 apart) per page, 1.5 to 2 ms on the last page. That's one long
task after a page change or an edit. The performance panel shows each run as
the `openmarch:collisions` measure. If shows with longer pages make it
noticeable, chunk it over idle callbacks or move it to a worker with the
resolver.

**Scenario.** `e2e/browser/tests/collisions.spec.mts` drags T1 onto T2, checks
the Collisions tab lists the pair and "Review" frames it, that the next page
(with a collision of its own) keeps the tab open and lists that pair, and that
undo takes the first away, on both fields. Store rules:
`stores/__test__/CollisionStore.test.ts`.

**Open.** Two marchers on exactly the same spot have `distance` 0, so the
marker disc (radius = distance, as Fabric's `CollisionMarker`) has no size;
only the label shows. The tab's "steps" are field units. Both predate #226.

### #249 Line widths

**Field lines antialias in their shader.** `FieldLayer`'s line rectangles are
drawn one device pixel wider on each side, and the fragment shader covers each
pixel by the share of it the rectangle covers (the screen-space derivative of the field
position), as Canvas2D does. Lines of one width now draw at one width at every
zoom; before, edges snapped to whole pixels, so yard lines were 1 or 2 px wide
side by side. Lines under a device pixel are still drawn a pixel wide and
faded by coverage (and skipped under `minLineCoverage` in low quality). The
field background keeps the plain shader, since its fill would pay for the
edge math over the whole field. The video export draws through the same
layer, so its frames get the same lines with no export change.

**Why not MSAA.** Both fix the widths (worst spread in a zoom sweep: 0.25 px
with MSAA, 0.2 px with the shader, 1 px before). On SwiftShader, MSAA cost
385-marcher playback about 10% at DPR 1 and 30% at DPR 2; the shader about 5%
at DPR 2 and nothing measurable at DPR 1. Those are software-GL numbers, and
MSAA is usually much cheaper on a real GPU: the shader was chosen because it
fixes the lines at about no cost, touches only the lines, and leaves marchers,
labels and the export alone. MSAA stays off (`fieldQuality.ts`).

**Scenario.** `e2e/browser/tests/line-widths.spec.mts` (both fields) turns the
grid and half lines off, zooms in from the fit in steps up to 6×, and checks
that the yard lines across the field's middle row have the same ink (the sum
of how dark their pixels are) within 0.5 px, and about zoom × DPR each. Any
new line drawing (pathways, shape outlines) can be checked the same way.
