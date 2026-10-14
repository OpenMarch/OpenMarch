# Field Renderer Migration: Implementation Plan

Shared context for every ticket. The decision and its reasons are in
[ADR 0005](../adr/0005-three-field-renderer.md); the full spec, with user
stories, is fork issue #189. When this plan and #189 disagree, #189 and its
owner comments win. Fix this file in the same PR.

## Tickets and blocking order

Status lives in the issues, not here (see [README](README.md)).

| Ticket | Phase                                | Title                                                     | Blocked by                  |
| ------ | ------------------------------------ | --------------------------------------------------------- | --------------------------- |
| #190   | [1](phases/01-foundation.md)         | ADR 0005 and the work-package plan                        | none                        |
| #191   | [1](phases/01-foundation.md)         | Field test API over Fabric                                | none                        |
| #192   | [1](phases/01-foundation.md)         | Tracer bullet: the new field shows the show               | #191                        |
| #206   | [1](phases/01-foundation.md)         | SVG exports from show data                                | none                        |
| #193   | [2](phases/02-editor.md)             | Editor core: click selection                              | #192                        |
| #194   | [2](phases/02-editor.md)             | Navigation on the new field                               | #192                        |
| #195   | [2](phases/02-editor.md)             | Marquee and lasso                                         | #193                        |
| #196   | [2](phases/02-editor.md)             | Move and drop                                             | #193                        |
| #197   | [2](phases/02-editor.md)             | Snapping, precision and locks                             | #196                        |
| #198   | [2](phases/02-editor.md)             | Group scale and rotate handles                            | #197                        |
| #199   | [3](phases/03-drawing.md)            | Marcher appearance on the new field                       | #192                        |
| #200   | [3](phases/03-drawing.md)            | Field themes and background image on the new field        | #192                        |
| #201   | [3](phases/03-drawing.md)            | Timeline visuals on the new field                         | #199, #200                  |
| #205   | [3](phases/03-drawing.md)            | Weak machines: low-quality mode, GPU flags, context loss  | #192                        |
| #202   | [4](phases/04-timeline-and-tools.md) | Timeline interactions on the new field                    | #193, #201                  |
| #203   | [4](phases/04-timeline-and-tools.md) | Line tool on the new field                                | #197                        |
| #204   | [4](phases/04-timeline-and-tools.md) | Box shape tool on the new field (rebuild of box v1, #181) | #198                        |
| #207   | [4](phases/04-timeline-and-tools.md) | Video export and field previews through the new field     | #201                        |
| #208   | [5](phases/05-gate-and-switch.md)    | Parity gate run                                           | #194, #195, #198, #202–#207 |
| #209   | [5](phases/05-gate-and-switch.md)    | Switch to the new field and delete Fabric                 | #208                        |

Phases group tickets by theme. A ticket can start as soon as its own
blockers merge, even if earlier phases have open tickets.

### Order

- **Start at once:** #190, #191, #206.
- **Critical path:** #191 → #192 → #193 → #196 → #197 → #198 → #204 → #208 →
  #209.
- **After #192:** #193, #194, #199, #200 and #205 can run in parallel.
- **After #193:** #195 and #196. After #197: #198 and #203.
- **After #199 and #200:** #201. After #201: #207, and #202 (which also
  needs #193).
- **#208** needs the owner's hands-on rounds and a real-hardware benchmark.
  **#209** needs the owner's explicit OK to merge.

## Architecture rules

These come from ADR 0005 D-1 and D-2. Every ticket follows them.

- **The editor** is plain TypeScript, with no React and no three.js. It owns
  selection (the app's selection, never a copy), hit testing, gestures,
  snapping, live and pending positions, and the view. Drops go through the
  existing drop-to-timeline planner, unchanged.
- **The field renderer** is a React Three Fiber Canvas, separate from the 3D
  View's. It draws what the editor exposes and reports only pointer
  positions.
  1. It draws on demand. Playback and gestures request frames.
  2. One component per layer, never one per marcher.
  3. Per-frame data goes into GPU buffers through refs. React state never
     changes per frame.
  4. The SVG overlay reads the camera from one shared view store.
  5. It shares field geometry and marcher position modules with the 3D View.
- **The SVG overlay** draws the selection box, handles, marquee, lasso and
  line-tool previews. It re-renders on every editor change. The rest of the
  app's chrome re-renders at most about 10 times a second during gestures
  and playback.
- **WebGL only.** Software or missing WebGL, or the Performance mode
  setting, means low-quality mode. No Canvas2D fallback.

### The field test API

The one renderer-specific test boundary. It's read-only. The parity suite
uses only it plus saved show data. #191 implements it over Fabric first, to
pin today's behavior; #192 onward implement it over the new field. The
starting shape:

```ts
interface FieldTestApi {
  marchers(): {
    id: number;
    x: number;
    y: number;
    screen: { x: number; y: number };
    onScreen: boolean;
  }[];
  selection(): number[]; // marcher ids
  viewport(): { zoom: number; pan: { x: number; y: number } };
  handles(): Record<
    "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rot",
    { x: number; y: number }
  > | null;
  activeGesture(): string | null; // "marquee" | "lasso" | "move" | "scale" | "rotate" | "line" | …
}
```

## Interaction rules

This table is the conversion spec's summary. All of today's behavior is kept
unless a row says otherwise. Each rule becomes given/when/then scenarios in
the parity suite; a scenario that changes on the new field must point at a
row here.

| Area                              | Rule                                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Click vs drag                     | Moving under 4 screen px is a click. No time limit (today's "< 300 ms **and** < 20 px" is dropped). Shape handles use the same rule.                                                                                                        |
| Snapping (coordinate rounding on) | One marcher snaps to the rounding grid. A group moves in whole rounding steps and keeps its offsets. Shift turns snapping off.                                                                                                              |
| Alt                               | Precision: ¼ pointer speed with no snapping, for move, scale and rotate. Alt no longer pans.                                                                                                                                                |
| Panning                           | Right-drag (Ctrl-drag on a Mac), middle-drag (fixed) and trackpad two-finger scroll. The mouse/trackpad mode setting is kept. No new pan inputs.                                                                                            |
| Lock X / Lock Y                   | Marchers only, not shape handles.                                                                                                                                                                                                           |
| Shift                             | Means "add to selection" (click, marquee, lasso) or "drop the constraint" (snapping, uniform corner scale, 15° rotation). It no longer starts a lasso.                                                                                      |
| Lasso                             | Double-click-and-drag on empty field. Replaces the selection; Shift adds. Selects only if released within **50 screen px** of the start, the same on screen at every zoom (today it's 50 field units), with today's green "will close" cue. |
| Marquee                           | Drag on empty field replaces the selection; Shift+drag adds.                                                                                                                                                                                |
| Handles                           | Corners scale uniformly, and Shift frees them. Middle handles scale one axis, and Shift does nothing there. Rotation snaps to 15°, and Shift frees it. A single marcher has no handles. No flipping.                                        |
| Dot position                      | Dots are drawn exactly on their coordinates (the half-grid-line offset is dropped). Exports follow.                                                                                                                                         |
| Labels                            | Scale with the field and fade out below a readable size.                                                                                                                                                                                    |
| Touch                             | Unchanged (pan, pinch).                                                                                                                                                                                                                     |

The lasso distance was confirmed by the owner on #189 (2026-10-14): screen
pixels, not field units.

The conversion spec lists every interaction from the inventory: selection,
lasso, move and drop, group transform, line tool, shape handles, kept-mark
hover, isolation Escape, preview swallowing, navigation, nudges and actions.
Export improvements are written into the same spec.

## Parity gate

Required before #209 (ADR 0005 D-6), run as #208:

1. The scenario suite passes on the new field. It must already pass on
   Fabric, with only the rows above edited in.
2. Render comparisons across a corpus of shows (at least the two demo shows
   and the 1,925-marcher stress show), at several zoom levels and playback
   times, show no unexplained differences.
3. Exports have the same content, checked with a visual diff plus the
   owner's review.
4. The owner's hands-on rounds in lab builds pass, against a written
   checklist.
5. The in-app benchmark, on a real low-end Chromebook and an integrated-GPU
   laptop, shows no regression against Fabric.

## Testing

- Test what the user sees and what gets saved, never how drawing is done. No
  tests against React Three Fiber components, three.js objects or shaders.
- **Main seam:** the browser scenario harness
  (`apps/desktop/e2e/browser/`), with real pointer and keyboard events in
  headless Chromium. Assert on saved positions and on the field test API.
  The same scenarios also run in Electron
  (`pnpm run e2e:scenarios:electron`).
- **Lower seam:** Vitest unit tests for the editor module only: gesture
  rules, snapping, hit testing and transform math.
- The drop-to-timeline planner keeps its existing tests unchanged.
- Performance: the in-app benchmark (playback, scrub, zoom, pan, drag), on
  production builds only. Headless WebGL on the agent machine is software
  GL, so its numbers are lower bounds.
- Old Fabric unit tests are deleted with Fabric in #209. Their behavior must
  already be covered by the scenario suite or editor unit tests.

## Out of scope

- A Canvas2D fallback with cached sprites (only if real users need it).
- One shared scene with the 3D View, and 3D-first editing.
- Touch editing (tap to select, long-press drag).
- New field features beyond the box shape tool rebuild.
- A visual redesign of exports beyond the conversion spec's improvements.
- Sending this work upstream to OpenMarch/OpenMarch.
- Page-era behavior and data.

## Prototype

Fork branch `proto/three-canvas` (throwaway, never merge). Its
`apps/desktop/canvas-proto/RESULTS.md` has the benchmark tables and method,
and `bench/` has the scripts, including `make-stress-show.mjs` for the
1,925-marcher show. Read it with:

```sh
git fetch timeline proto/three-canvas
git show FETCH_HEAD:apps/desktop/canvas-proto/RESULTS.md
```
