# Phase 4: Timeline interactions, tools and exports

Port the remaining field behavior and the outputs that draw the field.

## Tickets

- **#202 Timeline interactions.** The kept-mark hover tooltip, Escape leaving
  isolation (except during an alignment event, overlay or clip gesture), the
  first press after a paused preview only clearing it, and dimmed marchers
  that still can't be selected, including while a tool is active.
- **#203 Line tool.** The line tool (L) as today, with its previews in the
  overlay.
- **#204 Box shape tool.** Rebuilt on the editor and overlay from box v1's
  design (fork PR #181): its state machine and geometry. #181 stays held and
  isn't merged on Fabric.
- **#207 Video export and field previews.** Video frames rendered through
  the new field off screen, at today's quality or better. Field previews
  (such as the launch page's) use the new field.

## Exit gate

- Each ticket's scenarios pass on the new field.
- Video export and previews no longer need Fabric.

## Handoff notes

Append notes the next tickets need: file locations, seams, surprises.

### #202 Timeline interactions

**One hook in the editor.** `FieldEditorPorts.takePress` is asked first on
every edit press (primary button, not a pan); true makes the editor ignore
the whole press (no click, drag or drop; the pointer is still captured, so
its moves and release do nothing either). The new field passes
`src/field/takeFieldPress.ts`, which takes a press in two cases:

- **A paused preview holds a frame** (`cursorBeat !== null && playback ===
null`): it clears the cursor and takes the press, as Fabric's `Canvas.tsx`
  swallow does (story 60). **#196:** this is what keeps a drag during a held
  frame from writing held-frame positions; no change needed in the move
  gesture. A taken press also forgets the last click, so it can't be the
  first half of #195's double-click lasso. Only edit presses are checked: a right- or middle-press after a
  held preview pans on the new field and leaves the preview held, where
  Fabric swallowed it too (its pan listens to the same mouse events). On the
  #208 list.
- **The line tool is on** (`alignmentEvent === "line"`): every press is
  taken, so no marcher can be selected mid-tool, which closes Fabric's known
  gap (docs/timeline/ui.md: a marcher whose dimming ends mid-tool becomes
  selectable). **#203:** replace this branch with the line tool's own press
  handling (a gesture or mode in the editor), and keep it from selecting any
  marcher; the `change:` scenario below must keep passing. Ctrl/Cmd+A during
  the tool is unchanged (`selectAll` doesn't ask the hook).

**Escape** is the app's, not the field's: `useIsolationEscape` in
`TimelineIsolationBar.tsx` listens on the window in the capture phase and
skips alignment events, open overlays (`overlayOpen`) and clip gestures
(`clipGestureActive`). It works unchanged with the new field mounted.

**A test-only hook.** A user holds a preview frame only mid-scrub over
playback, with the button still down on the timeline, so a scenario can't
also press the field. `window.openmarchPreview.hold(beat)` (Playwright
sessions only, at the bottom of `TimelineSelectionStore.ts`) cues the beat
while paused. `src/utilities/playwrightSession.ts` is the shared check (the
collisions hook uses it too).

**Scenarios** (Fabric first, then unchanged on the new field):
`timeline-interactions.spec.mts` (the kept-mark tooltip's delay, the 1.5×
dot-radius hit, the mark beside the dot, no tooltip while a button is down,
hidden on press and on leaving the field; Escape with marchers selected, with
the line tool on, with a dialog open; the line-tool `change:`) and
`paused-preview.spec.mts` (a click and a drag after a held preview). Shared
timeline steps (`goToPage`, `isolate`, `emptyField`) moved to
`e2e/browser/timeline.mts`. Escape during a clip gesture has no scenario: the
demo shows' moves are page moves, which have no clip, and the rule is the
timeline's alone (`TimelineClipResize.test.tsx` pins it).

**Fabric bug found, not fixed (freeze):** the kept-mark tooltip stays up when
the pointer leaves the field over the grid. Fabric's `mouse:out` names the
object last under the pointer (the field grid, or a marcher), and
`useTimelineKeptMarks` hides only when there is none. The scenario is
`test.fail` on Fabric; the new field hides it when the pointer leaves its element. On the #208
list.

### #203 Line tool

**Files.** `src/field/editor/lineTool.ts`: the pure rules (`lineOrder`,
`orderAlongLine`, `spacedAlong`, `lineUp`, `roundToStep`, which uses
`getRoundCoordinates2` at whole steps, as #197 does) and `LineTool`, the
tool's state (no line, drawing, finished). `FieldEditor.setLineTool(ids |
null)` turns it on and off; `lineToolShape()` is the snapshot the overlay
and the test API read. `src/field/fieldLineTool.ts` keeps it in step with the
app's alignment event (`useFieldLineTool`) and gives the finished line's
positions back to it (`publishLinePreviews`), so Shift+Enter
(`applyQuickShape`) and Escape (`cancelAlignmentUpdates`) are the app's
actions, unchanged: one undo step through the timeline's rules.

**Presses.** While the tool is on, every edit press is the tool's (after
`takePress`, so the first press after a held preview still only clears it):
the first starts a line, the second finishes it, and later ones do nothing
until a right-click clears the line. No press selects or drags anything, so
#202's line-tool branch in `takeFieldPress.ts` is gone and its `change:`
scenario passes through the editor. Ctrl/Cmd+click doesn't touch the line.
A right press is navigation's (it pans); the editor clears the line only on
a right release within `CLICK_SLOP` of the press, so a right-drag pans to the
line's far end and keeps it. Navigation captures right presses on the
field's root, so `fieldPointerInput` hands the editor right releases from a
document listener. Turning the tool on (again) empties the alignment event's
previews, so Shift+Enter can't apply a line no longer drawn. The cursor is a
crosshair. Ctrl/Cmd+A during the tool is unchanged.

**Overlay.** `FieldOverlay`'s `LineToolPreview` draws Fabric's look in field
units (it scales with the field): the line in the theme's shape color, dashed
pathways in `tempPath` with a midpoint and an endpoint, and a dashed square
outline around each of the tool's marchers.

**Test API.** `lineTool()` (optional on `FieldTestApi`): the tool's
marchers, its line (`drawing` while the end follows the pointer) and the
previews' positions, over Fabric (read from `LineListeners`, read-only) and
the new field. Scenarios: `e2e/browser/tests/line-tool.spec.mts`.

**Decided changes (`change:` scenarios, on the #208 checklist).**

- Once a line is finished, a click on a marcher selects nothing (rules
  table: Click target). Fabric makes the marchers selectable again then, and
  a press goes to its default listeners (marquee, select, drag).
- A right-drag pans and keeps the line being drawn (story 5: pan to reach
  the line's far end). Fabric clears the line on every right press.
- Shift+Enter saves exactly where the previews are drawn (rules table: Dot
  position). Fabric saves the line half a field unit right of and below where
  it draws it (`MarcherLine`'s grid offset).

**Kept as Fabric (for the #208 checklist).** A right-click clears the line,
but a finished line's previews stay, and Shift+Enter still applies them,
until the next line is finished. The second click finishes the line at that
click's point (Fabric used the last move's; the same unless the pointer
jumped). A finished line lines its marchers up again whenever they're drawn
somewhere else (a page change or playback mid-tool), as Fabric's
`refreshMarchers` does: `FieldEditor.refreshLineTool` on every
`FieldMarchers` fill, publishing only when the targets change. That has unit
tests only; the line-tool scenarios use a one-page show. The previews and
outlines draw above the dots (the overlay is over the canvas); Fabric drew
its marchers on top. Ctrl/Cmd+click during the tool does nothing, where
Fabric selected with it (same rule as the first `change:`).

### #207 Video export and field previews

**The video export draws through the new field, whichever field is on
screen.** `src/field/three/offscreenField.tsx` (`createOffscreenField`) mounts
the on-screen field's layers (field, image, marchers, labels) in their own
React Three Fiber root (`createRoot`, `frameloop: "never"`) on a canvas that's
never in the page. `draw(beat)` fills a `FieldMarchers` from the export's own
resolver (`ResolverFrameSampler.source`) and runs `advance` for that root
only, synchronously, so the canvas holds the frame when it returns
(`preserveDrawingBuffer`). `videoFrameRenderer.ts` copies it onto the 2D frame
canvas and draws the overlay and branding there, as before. Fabric's video
canvas (`videoCanvas.ts`) is gone.

- **View and quality reach the layers through `fieldDrawContext.ts`**
  (`useFieldDraw()`): by default the one view store and the machine's quality
  mode, as before; the export provides its own view store and
  `EXPORT_QUALITY` (full quality on any machine, labels never fade, as
  Fabric's export drew them). **New layers must read the zoom and quality
  through `useFieldDraw()`, not `useFieldViewStore` or
  `currentQualitySettings()`, or they'll draw exports at the screen's zoom.**
- **Resolution.** Video frames are drawn at DPR 1, one field pixel per video
  pixel (`computeFieldView`: the field fitted with 40 units of margin, then
  the user's framing). The dialog's preview draws at the screen's DPR
  (`pixelRatio`), so it's sharp.
- **Appearance** comes from the field's appearance steps
  (`useMarcherAppearanceSteps`, the last flag crossed), the same rule the old
  per-page map applied by time. `getPlaybackPageForTimeMs` went with it.
- **No WebGL.** `createOffscreenField` rejects with `NoWebGLError`
  (`fieldQuality.ts`). The dialog then says the export needs WebGL and
  disables Export. This holds on the Fabric field too: a machine with no
  WebGL loses video export, which drew on Canvas2D before (no Canvas2D
  fallback, per the spec).
- **Context lost mid-export:** `draw` throws `FieldContextLostError`, and the
  export stops with that message and deletes the partial file, instead of
  saving frames with no field. The preview logs it and stays blank.
- **three.js stays lazy:** `createVideoRenderContext` imports
  `offscreenField` dynamically (`fieldChunk.test.ts` would fail otherwise).
- The export draws no pathways, collisions or dimming, as before. A later
  export option can add `OverlayLayer`s with a plan and a render order.
- **Speed** (software GL, headless, a busy machine): the three demo exports
  at 1080p took 3.6 / 3.9 / 5.1 min against Fabric's 1.2 / 1.5 / 2.2 min.
  Software GL is the bottleneck, as everywhere on the new field; #208's
  real-hardware runs should time an export too.

**Previews.** `components/field/FieldPreview.tsx` (the new show wizard's field
step) is an SVG image from `fieldSvg` (`drillChartSvg.ts`); the launch page's
show previews were already SVG (#206). Nothing outside
`components/canvas/`, `global/classes/canvasObjects/` and the frozen timeline
hooks constructs an `OpenMarchCanvas` now, apart from the editor's own
`Canvas.tsx`.

**Scenarios.** `video-export.spec.mts` exports a short seeded show and reads
frames with ffmpeg (size, length, marchers where the show file puts them),
checks the no-WebGL explanation, and loses the export's context mid-export
(both browser only). The harness gained the
export's IPC (`host/index.ts`), `show.videoExportPath`, and the `webgl`
option (Electron software GL on the Fabric field).
`render/video-compare.spec.mts` + `video-compare.sh` produce before/after
frame pairs; the #207 run is fork prerelease `field-video-207`. **#208:**
rerun it for the export diffs; the differences are the field drawing's
(pixel-snapped grid, no half-line offset, centered yard numbers, image shift,
SDF label glyphs). **#209:** `staticGridExport.test.ts`'s comment refers to
the old static field cache; it goes with Fabric.
