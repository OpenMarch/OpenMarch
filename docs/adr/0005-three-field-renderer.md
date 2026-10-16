# 0005: A three.js field behind a renderer-independent editor

- Status: accepted
- Implemented: fork #209 (2026-10-15) made the new field the only field and
  deleted Fabric, on the `field-renderer` branch.
- Date: 2026-10-14
- Spec: fork issue #189. Work packages: [docs/field](../field/README.md),
  tickets #190 to #209.
- Related: [ADR 0002](0002-3d-view.md) (3D View, which already uses React
  Three Fiber)

## Context

The 2D field editor is built on Fabric.js 5. Three problems hold it back.

- **It slows down as shows grow.** On a slower CPU, a 385-marcher show plays
  at 34 fps and drags at 24 fps. A 1,925-marcher show plays at about 1 fps.
  About 3,000 lines of Fabric-specific speed workarounds hide part of this:
  cache atlases (`cacheAtlas.ts`, `drawFromCache.ts`), a viewport raster
  cache, monkey-patched internals and a blurry-then-sharp zoom. The field's
  coordinate dots are switched off because they make the canvas too slow.
- **Editing logic is tangled into Fabric.** Selection, dragging, snapping and
  the scale and rotate handles live in Fabric events and subclasses
  (`OpenMarchCanvas`, `CanvasMarcher`, the listeners in
  `src/components/canvas/listeners`). Several behaviors depend on the order
  Fabric fires events in, or reach into Fabric's private internals. That
  logic can't be unit-tested, and it can't survive a change of renderer.
- **Some behaviors are inconsistent.** A quick 19 px flick does nothing, but
  a slow 3 px wobble saves a move. A single marcher snaps while dragging but
  a group appears not to. Lock X/Y also locks shape handles. Middle-drag
  panning is coded but never works. Dots are drawn half a grid line off
  their stored position.

The 2D field and the 3D View also draw the field separately, each with its
own copy of the field geometry.

### Prototype

A throwaway prototype on fork branch `proto/three-canvas` (never merged;
results in `apps/desktop/canvas-proto/RESULTS.md`) drew the field with a
three.js orthographic scene and compared it with the Fabric web editor. Both
were production builds on the same machine and in the same Chromium. That
machine had no working GPU driver, so every WebGL number is software GL
(llvmpipe or SwiftShader) and is a lower bound.

| Show and condition                  | Fabric (play / drag fps) | three.js (play / drag fps) |
| ----------------------------------- | ------------------------ | -------------------------- |
| 385 marchers, 4× slower CPU         | 34 / 24                  | 60 / 59                    |
| 1,925 marchers, 4× slower CPU       | 1.2 / 4                  | 60 / 58                    |
| 385 marchers, no GPU (SwiftShader)  | 60 / 59                  | 29 / 26                    |

What the prototype showed:

1. With any working GPU, WebGL wins, and the gap grows with show size and a
   slower CPU. The whole field took about 12 draw calls regardless of
   marcher count, with under 1 ms of main-thread work per frame.
2. Labels, the largest risk the research named, are solved. Signed-distance
   field (SDF) glyphs in one instanced draw stay sharp from fully zoomed out
   to 12× in.
3. With no GPU at all, Fabric is faster on mid-size shows, because it caches
   every marcher as a bitmap. A naive Canvas2D fallback that redraws paths
   and text each frame stalls for seconds.
4. React must stay out of the frame loop. Re-rendering the toolbar on every
   pointer move held drags at 37 fps on a 6× slower CPU. Splitting overlay
   updates (every change) from chrome updates (at most 10 Hz) brought them
   to 56 to 59 fps. The React development build doubled the per-move cost,
   so only production builds are benchmarked.
5. An SVG overlay on the same view transform draws the marquee, selection
   box and handles without drifting from the WebGL layer.

The prototype didn't cover shape tools, curved pathways, per-marcher
appearances, background images, exports, collision markers or the timeline
overlays. Those are work packages in the plan.

This record changes cross-package ownership (field geometry shared with the
3D View), the desktop app's GPU flags and the field's renderer, so
`docs/conventions/architecture-decisions.md` requires it.

## Decision

### D-1 Three parts with one boundary

- **The editor** is plain TypeScript, with no React and no three.js. It owns:
  - the selection, which is the app's selection (no separate canvas
    selection);
  - hit testing in field coordinates;
  - gestures (click, marquee, lasso, move, scale, rotate, line tool, shape
    handles) and their modifier rules;
  - snapping, through the existing coordinate-rounding settings;
  - live positions during a gesture, and the pending and snap-back state
    after a drop;
  - the view: zoom, pan, limits, and mouse or trackpad mode.

  A drop hands its result to the existing drop-to-timeline planner, which is
  reused unchanged.
- **The field renderer** is a React Three Fiber Canvas, separate from the 3D
  View's. It draws what the editor exposes and reports nothing but pointer
  positions. It draws the field, background image, marchers, labels,
  pathways, ghosts, timeline overlays and collision markers.
- **The SVG overlay** is React. It draws the selection box, handles,
  marquee, lasso and line-tool previews from the same editor state and the
  same view transform.

### D-2 Renderer guard rails

1. It draws only on demand. Playback and gestures request frames.
2. One component per layer, never one per marcher.
3. Positions, selection and appearances are written into GPU buffers through
   refs, from a frame hook or store subscriptions. React state never changes
   per frame.
4. The SVG overlay reads the camera through one shared view store.
5. The 2D and 3D Canvases stay separate but share the field geometry and
   marcher position modules.
6. The SVG overlay re-renders on every editor change. The rest of the app's
   chrome re-renders at most about 10 times a second during gestures and
   playback.

The drawing techniques proven in the prototype are the starting point:

- all marchers in one instanced draw, shaded in the fragment shader;
- labels as SDF glyphs from an atlas built in the browser, in one instanced
  draw;
- field lines that follow the zoom but never get thinner than one screen
  pixel;
- pathways in one persistent buffer rewritten in place.

### D-3 WebGL only, with a low-quality mode

- WebGL is used when it's hardware-accelerated.
- When WebGL is software (SwiftShader, llvmpipe, Microsoft Basic Render) or
  missing, the field runs in **low-quality mode**: DPR 1, no MSAA, labels
  hidden sooner and cheaper layers. It shows a one-time explanation of why
  and how to turn graphics acceleration on.
- A manual **Performance mode** setting forces low-quality mode.
- The desktop app turns on Chromium's `ignore-gpu-blocklist`, and drops to
  low-quality mode if the GPU process crashes.
- The field recovers by itself when the WebGL context is lost.
- No Canvas2D fallback ships. One is built only if real users need it, and it
  must then cache marcher and label sprites as Fabric does.

How #205 built it:

- **GPU switch.** The main process appends `ignore-gpu-blocklist` at startup,
  for the whole app (the Fabric field and the 3D View draw on the same GPU
  process). Windows 7 still turns hardware acceleration off. The owner
  confirmed the app-wide switch on 2026-10-15, including its effect on the
  Fabric field and the 3D View's compositing on drivers Chromium blocks.
- **IPC contract.** Two channels, both carrying no data from the renderer:
  `gpu:crashed` (`invoke`, answers whether the GPU process ended with
  anything but a clean exit this session) and `gpu:process-gone` (main to
  every window, no payload, sent on such an exit). The preload exposes them
  as `gpuCrashed()` and `onGpuCrashed(callback)`. The renderer gains no new
  capability: it learns one boolean. The web build answers `false`, since the
  browser owns its GPU process. Names live in `electron/main/gpu.ts`.
- **What "low quality" means** is one table, `QUALITY_SETTINGS` in
  `src/field/fieldQuality.ts`, so later layers read the same switch.
- **Without WebGL** the field shows an explanation in its place instead of
  throwing into the app's error boundary, and the rest of the app keeps
  working.

### D-4 One cut-over, and a field freeze until then

- The new field is built beside Fabric and switched on in one cut-over PR
  (#209), after the parity gate (D-6) passes. Fabric and its speed
  workarounds are deleted in that PR. There is no rollback setting.
- **Amended (owner decision, 2026-10-15, recorded on #209):** #209 lands on
  `field-renderer` after the gate's automated half, before the owner's
  hands-on checklist and real-hardware benchmark. Those now gate #214
  (`field-renderer` into `main`) instead. Fabric comparisons use the pinned
  pre-switch build (`field-renderer-pre-209`).
- Until #209 merges, **Fabric field drawing and field interaction are
  frozen**. Only fixes for real breakage are allowed, and each fix adds a
  parity scenario that pins the fixed behavior.
- The timeline panel, inspector, data layer, 3D View, export content and
  shortcuts keep moving.
- Box v1 (fork PR #181) is held. It's rebuilt on the new field in #204,
  reusing its state machine and geometry.
- Page-era behavior is out of scope. The new field never receives page-era
  data.

### D-5 Deliberate behavior changes

Everything else keeps today's behavior. The full rules are the interaction
rules table in [the plan](../field/implementation-plan.md#interaction-rules);
in short:

- a press that moves under 4 screen px is a click, with no time limit;
- one dragged marcher snaps to the rounding grid, and a dragged group moves
  in whole rounding steps and keeps its offsets;
- Alt is precision (¼ pointer speed, no snapping) and no longer pans;
- middle-drag pans;
- Lock X and Lock Y constrain marchers only, not shape handles;
- Shift adds to a selection or drops a constraint, and no longer starts a
  lasso;
- the lasso starts with a double-click-and-drag, and closes only within
  **50 screen px** of its start (today 50 field units);
- dots are drawn exactly on their coordinates, and exports follow.

### D-6 The parity gate

Before the switch:

1. One scenario suite passes on the new field. It must already pass on Fabric
   (#191 adds the field test API over Fabric first), with only the D-5
   changes edited in.
2. Render comparisons across a corpus of shows (at least the two demo shows
   and the 1,925-marcher stress show), at several zoom levels and playback
   times, show no unexplained differences.
3. Exports have the same content, checked with a visual diff and the owner's
   review.
4. The owner's hands-on rounds in lab builds pass, against a written
   checklist.
5. The in-app benchmark, on a real low-end Chromebook and an integrated-GPU
   laptop, shows no regression against Fabric.

## Consequences

- Editing rules become unit-testable TypeScript and no longer depend on a
  drawing library. About 3,300 lines of interaction code are rewritten, and
  about 3,000 lines of Fabric speed workarounds are deleted rather than
  ported.
- The estimate is 12 to 16 engineer-weeks for one developer. Field work that
  isn't breakage waits until the switch, so field features queue behind it
  (box v1 included).
- Machines without hardware WebGL get a slower, simpler field than Fabric
  gives them today on mid-size shows. The owner accepted this to avoid
  building a sprite-caching Canvas2D fallback first.
- The desktop app ignores Chromium's GPU blocklist. A GPU that crashes drops
  the field to low-quality mode.
- Tests target what the user sees and what gets saved, never three.js
  objects, React Three Fiber components or shaders. The browser scenario
  helpers stop reading Fabric and read the field test API.
- The 2D field and the 3D View share field geometry and marcher position
  code, so a field change is made once.
- `window.canvas`, the Fabric canvas that plugins could reach, is gone with
  Fabric (#209). The plugin example in
  `apps/website/src/content/blog/2025-06-12-plugins-update/index.mdx` used
  it. The owner accepted the break (2026-10-15): no replacement, and the plugin
  system itself is to be removed (#255).

## Verification

- The parity gate in D-6, run as ticket #208, is the acceptance test for this
  decision. #209 needs the owner's explicit OK to merge.
- Editor unit tests (Vitest) cover gesture rules, snapping, hit testing and
  transform math. The drop-to-timeline planner keeps its existing tests
  unchanged.
- The in-app benchmark (#205) is rerun on production builds, including the
  prototype's CPU-throttled software-GL comparison as a regression check.
