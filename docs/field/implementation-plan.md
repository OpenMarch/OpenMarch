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

| Area                              | Rule                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Click vs drag                     | Moving under 4 screen px is a click. No time limit (today's "< 300 ms **and** < 20 px" is dropped). Shape handles use the same rule.                                                                                                                                                                      |
| Click                             | A click on a marcher selects only it, also when it's one of several selected (#189 story 23; Fabric kept the whole selection). A click on empty field clears the selection, also inside a selection's box (story 30; Fabric kept it). Shift+click on empty field keeps the selection (Fabric cleared it). |
| Select all                        | Ctrl/Cmd+A selects every marcher that can be selected, every time (story 31; Fabric's second press cleared the selection).                                                                                                                                                                                |
| Click target                      | A marcher's dot and outline, but never under 5 screen px in radius; overlapping targets go to the nearest dot. Dimmed marchers have none, and while the line tool is on no marcher has one (story 20; on Fabric a marcher whose dimming ends mid-tool gets one back).                                     |
| Snapping (coordinate rounding on) | One marcher snaps to the rounding grid. A group moves in whole rounding steps and keeps its offsets. Shift turns snapping off.                                                                                                                                                                            |
| Alt                               | Precision: ¼ pointer speed with no snapping, for move, scale and rotate. Alt no longer pans. Pressing Alt mid-drag goes on slowly from where the selection is drawn, with no jump; releasing it goes on at full speed from there, snapping again (#197).                                                  |
| Panning                           | Right-drag (Ctrl-drag on a Mac), middle-drag (fixed) and trackpad two-finger scroll. The mouse/trackpad mode setting is kept. No new pan inputs.                                                                                                                                                          |
| Lock X / Lock Y                   | Marchers only, not shape handles.                                                                                                                                                                                                                                                                         |
| Shift                             | Means "add to selection" (click, marquee, lasso) or "drop the constraint" (snapping, uniform corner scale, 15° rotation). It no longer starts a lasso.                                                                                                                                                    |
| Lasso                             | Double-click-and-drag on empty field. Replaces the selection; Shift adds. Selects only if released within **50 screen px** of the start, the same on screen at every zoom (today it's 50 field units), with today's green "will close" cue.                                                               |
| Marquee                           | Drag on empty field replaces the selection; Shift+drag adds. A drag from empty field inside a multi-selection's box moves the selection instead, as today (owner decision); a click there still clears it.                                                                                                |
| Handles                           | Corners scale uniformly, and Shift frees them. Middle handles scale one axis, and Shift does nothing there. Rotation snaps to 15°, and Shift frees it. A single marcher has no handles. No flipping. Handles are drawn as filled squares (Fabric: outlines; owner 2026-10-15).                            |
| Dot position                      | Dots are drawn exactly on their coordinates (the half-grid-line offset is dropped). Exports follow.                                                                                                                                                                                                       |
| Labels                            | Scale with the field and fade out below a readable size.                                                                                                                                                                                                                                                  |
| Touch                             | Unchanged (pan, pinch).                                                                                                                                                                                                                                                                                   |
| Lost pointer                      | A drag (move, marquee, lasso, handle) is cancelled when the window loses the pointer mid-drag (Alt+Tab, an OS dialog): nothing moves or is saved, and the next press works. Fabric kept the drag going (owner decision 2026-10-15).                                                                       |

The lasso distance was confirmed by the owner on #189 (2026-10-14): screen
pixels, not field units.

The conversion spec lists every interaction from the inventory: selection,
lasso, move and drop, group transform, line tool, shape handles, kept-mark
hover, isolation Escape, preview swallowing, navigation, nudges and actions.
Export improvements are written into the same spec.

### Export improvements

Drill charts (and the launch page preview, which uses the same SVG) are drawn
from show data since #206 (on the `field-renderer` branch), in
`apps/desktop/src/components/exporting/utils/drillChartSvg.ts`. Content and
layout are today's, except:

| Area             | Change                                                                                                                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Position         | Dots, pathways, midpoints, endpoints, grid lines, hashes and labels sit exactly on their coordinates. Fabric drew everything half a grid line down and right, so the whole chart moves 0.5 px.                                                             |
| Centered text    | Drill numbers and yard-line labels are centered by the SVG renderer (`text-anchor`), not from widths Fabric measured in the browser that ran the export. The PDF draws them in Helvetica (svg-to-pdfkit's fallback, as today), now centered on their spot. |
| Yard numbers     | Centered on their yard line. Fabric put their left edge 22 px left of the line, so their place depended on the font.                                                                                                                                       |
| Side labels      | Left labels end 10 px left of the field (`text-anchor: end`) instead of being placed from a measured width.                                                                                                                                                |
| Border           | One closed 3 px outline just outside the field, instead of four lines with uneven ends.                                                                                                                                                                    |
| Hashes           | Centered on their checkpoint and yard line, without the 1 px nudges Fabric needed for its own offset.                                                                                                                                                      |
| Missing position | A marcher with no position on a page isn't drawn on that page. Fabric left it where it last stood (or at the field's corner).                                                                                                                              |
| Field image      | The export waits for the image to load before reading its size, and keeps JPEG, GIF and WebP types instead of labeling every image PNG. An image the browser can't decode is still embedded, stretched over the field.                                     |
| Hidden helpers   | No invisible hit-box rectangle per marcher; the SVGs are about a third the size. The PDFs are about 30% larger (svg-to-pdfkit writes coordinates in full).                                                                                                 |

Unchanged on purpose: every drill number is drawn under every dot, as today
(each page's `setMarcherCoords` brought all of Fabric's dots to the front), so a
neighboring dot can cover a label in both. An individual chart draws its
marcher's dot again on top of the paths.

The before/after export diffs for the demo shows are on the #206 PR.

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
