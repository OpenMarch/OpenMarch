<!-- cspell:disable -->

# Shape tools 03: the shape model (taxonomy, extensible contract, storage, assignment)

Status: research, 2026-10-10, branch `timeline/shapes`. Read-only on code. Nothing here is built.

**Owner intent this report designs for.** A shape tool is an **in-place** way to position the
selected marchers **at one point in time** (the edit window's arrival, UI-10). It is not motion
across time. It must cover lines, circles, arcs, curves, many kinds of block and an unknown
number of future shapes, without each new shape adding UI.

## 0. What exists today (grounding)

| Area                                   | What is there                                                                                                                                                                                                                                                                                                                                | Where                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Spec shapes                            | 5 kinds: `line` (2 points), `freehand` (polyline), `circle` (center, radius, start angle, direction), `box` (hollow rectangle perimeter), `block` (grid: origin, rows, cols, spacing)                                                                                                                                                        | spec §5.1 DDL `kind IN (...)`, §5.2, `packages/core/src/timeline/types.ts` `ShapeRow` |
| Sampling (R-13)                        | Open paths: equal arc length, `t_i = i/(n−1)`. Closed: `t_i = i/n`. Block: row-major `origin + ((i mod C)·dx, ⌊i/C⌋·dy)`, with `rows·cols ≥ slot_count` (I-T4)                                                                                                                                                                               | `geom.ts` `sampleDestinations`, `destPath`                                            |
| Validation                             | One `switch (kind)` per concern: `validateShapeGeometry` (I-S1), `destPath`, `sampleDestinations`, `shapeOutline`, `shapeHandles`, `dragHandle`, `newShapeThrough`, `convertShape`, `shapeBounds`                                                                                                                                            | `validate.ts`, `geom.ts`, `timelineShapeEditor.ts`, `timelineShapeCanvas.ts`          |
| Shape editor (P8.2) and canvas (P7.11) | Inspector edits a spec shape (kind, geometry). Canvas draws the outline and handles with fixed roles (`point`, `move`, `rim`, `origin`, `corner`, `spacing`). Releasing a handle commits one geometry edit. `newShapeThrough` fits a new shape to the selected marchers.                                                                     | `apps/desktop/src/timeline/timelineShape*.ts`                                         |
| Canvas tools in timeline mode          | Line tool, circle (`createCircle` in core), align, distribute, flip, nudge all compute x/y and go through one seam, `timelineCoordinateWrites.ts`, into the edit window as **individual destinations** (D-16). A per-marcher edit on a shape-backed transition **converts it to points** (Q-14 workaround), so the shape link silently ends. | `timelineCoordinateWrites.ts`, `db-functions/timelineMoves.ts`                        |
| How moves are stored                   | A marcher in a window gets its own **one-slot shapeless `direct` transition** spanning the timeline (C-11, "at most one transition per timeline"). Group moves are therefore many one-slot transitions, not one n-slot shaped transition.                                                                                                    | `implementation-plan.md` C-11, `timelineMoves.ts` `ownPageMoves`                      |
| Legacy page shapes                     | SVG path (`M`/`L`/`Q`/`C`) per page, marchers distributed equally along it in a stored order. Converted to individual destinations; the editable curve was dropped (C-8, ADR 0008).                                                                                                                                                          | `MarcherShape.ts`, `StaticMarcherShape.distributeAlongPath`, `ShapePoint.ts`          |
| Assignment                             | Hungarian in core (`hungarianAlgorithm`, `computeOptimalCoordinateMapping`). Casting (P8.4) uses it on Euclidean distance; capped at `MAX_CAST_SLOTS = 500`, measured about 30 ms at 500.                                                                                                                                                    | `packages/core/src/shapes/utils.ts`, `timelineCasting.ts`                             |
| Units                                  | Field units are canvas "pixels": `PIXELS_PER_INCH = 0.5`, an 8-to-5 step is 22.5 in, so `pixelsPerStep = 11.25`. 8 steps between 5-yard lines. Side 1 is negative x (audience left). Hashes and yard lines are `yCheckpoints`/`xCheckpoints`. Step-size warning threshold defaults to 45 in (a 4-to-5).                                      | `packages/core/src/field/FieldProperties.ts`                                          |

Gaps against the owner's list: no **arc** shape (the spec's `arc` is a _path style_, i.e.
motion, D-15), no **spline** (freehand is a polyline), no **fixed interval** on any path (spacing
is always "fit n between the endpoints"), no **stagger/checkerboard**, no **hollow block with an
interval**, no **rotation** on box or block (both axis-aligned), and no remainder rule when `n`
doesn't fill the grid (the trailing cells stay vacant, row-major).

Naming hazard to settle early: "arc" means motion in the spec and in the UI today. The shape
should be called **Arc** in the picker and `arc_path` (or `circle_arc`) in code; the motion stays
"Curved path" in UI text. Owner to confirm the words.

## 1. Taxonomy of formations

Conventions in the tables:

- **Spacing mode** is the main count interaction:
  - **Fit**: the endpoints (or size) are fixed and the spacing is derived, `s = L/(n−1)` (open)
    or `L/n` (closed). This is what the spec samples today.
  - **Interval**: the spacing is fixed (for example 2 steps), and the length is derived,
    `L = s·(n−1)`, grown from an **anchor** (start, center or end).
  - **Count-free**: a grid whose rows or columns are derived from `n` and one given dimension.
- Intervals are entered in steps (8-to-5) and stored in field units. Common values are 1, 1.5, 2,
  2.5, 3 and 4 steps; interval snapping to whole or half steps is the default.
- **Handles** are what the user drags on the canvas. Every kind also has a **move** handle (body
  drag) and, where it has an orientation, a **rotate** handle.

### 1.1 1D path shapes (one ordered row of slots along a path)

| Shape                                              | Parameters                                                                            | Handles                                       | Count interaction                                                                                                                                   | Notes                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Line                                               | `a`, `b`; spacing mode; interval; anchor                                              | `a`, `b`, move                                | Fit: `s =                                                                                                                                           | ab                                                                                                         | /(n−1)`. Interval: `b`is derived, so dragging`b` changes direction only (length shown, locked) | The 90% shape. "Line on the 40, 4 steps apart" is interval with the line snapped to a yard line |
| Polyline (segmented line, "corner", "Z", "zigzag") | vertices `v₀…vₖ`; spacing mode; `cornersGetMarchers: bool`                            | each vertex, insert-on-edge, move             | Fit along total length. With `cornersGetMarchers`, counts are split per segment so a marcher stands on every corner (rounding by largest remainder) | Drill writers usually want a marcher on each corner of a "V" or wedge outline                              |
| Arc                                                | center, radius, start angle, sweep (or 3 points: ends plus one on the arc); direction | both ends, mid (bulge), center, move          | Fit by angle; Interval as arc length (`sweep = s(n−1)/r`, anchored)                                                                                 | Distinct from the spec's motion `arc`. Can exceed 180° (a "C"), unlike the motion's `                      | bulge                                                                                          | ≤ ½`                                                                                            |
| Circle                                             | center, radius, start angle, direction                                                | rim (radius and start), center                | Closed: `s = 2πr/n`. Interval: radius derived `r = s·n/2π`                                                                                          | Start angle decides which marcher stands at, say, 12 o'clock; exposed as a rim handle                      |
| Ellipse/oval                                       | center, rx, ry, rotation, start                                                       | two axis handles, rotate                      | Equal **arc length**, not equal angle (equal angle crowds the ends)                                                                                 | Needs numeric arc-length inversion; precompute a fine table                                                |
| Spline / curve through points                      | control points; `tension`; closed?; spacing mode                                      | each point, insert, delete, move              | Fit along arc length of the curve                                                                                                                   | Catmull-Rom (centripetal) passes through the points, which is what users draw. Sampled by arc-length table |
| Freehand                                           | stroke points (simplified)                                                            | none during draw; becomes a spline afterwards | Fit                                                                                                                                                 | Simplify the stroke (Ramer–Douglas–Peucker), then treat as a spline                                        |
| Spiral                                             | center, start radius, end radius, turns, direction                                    | center, inner end, outer end                  | Fit along length; Interval grows turns                                                                                                              | Archimedean; rare, but cheap once the path machinery exists                                                |
| Sine/wave                                          | `a`, `b`, amplitude, wavelength or cycles, phase                                      | ends, amplitude                               | Fit or Interval along the wave's length                                                                                                             | Used for "snake" pictures                                                                                  |

All path kinds share one engine: build a path (segments of line, circular arc, cubic), build an
arc-length table, then sample `n` points by `fit` or `interval`. The legacy SVG path model already
mixes `L`, `Q` and `C` segments, so a converter from legacy shapes into this engine is direct.

### 1.2 2D fill shapes (a region filled with a lattice)

| Shape                                           | Parameters                                                                                                                                | Handles                                                                                  | Count interaction                                                                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---- | -------------- | --------------------------------------------------------------------- |
| Block (filled rectangle grid)                   | origin/center, rotation, `cols` _or_ `rows`, interval `dx` (between files) and `dy` (between ranks), remainder rule                       | corner (sets cols/rows at fixed interval), spacing handle on the next cell, rotate, move | Count-free: give one dimension, the other is `⌈n/cols⌉`. The remainder (`n mod cols`) goes to the back or front rank, aligned left, center, right or spread |
| Hollow box                                      | rectangle (origin, w, h, rotation); spacing mode; `cornersGetMarchers`                                                                    | 2 corners, rotate                                                                        | A closed polyline: Fit (spacing from perimeter) or Interval (size from n). Corners on marchers needs `(n)` split per side                                   |
| Staggered / brick / checkerboard                | block params plus `staggerAxis` (rows or files), `staggerOffset` (default ½ interval), `pattern` (every other cell vacant = checkerboard) | as block, plus an offset handle on the second rank                                       | Count-free. Checkerboard halves density, so `cells = 2n`                                                                                                    |
| Files & ranks with gaps                         | block plus `rankGaps[]`/`fileGaps[]` (extra interval after rank k), or `groupSize` (gap every g files)                                    | as block                                                                                 | Count-free. Sections in their own blocks with a gap is the common use                                                                                       |
| Diamond                                         | center, rotation 45°, either "block rotated" or a lattice of `                                                                            | x                                                                                        | +                                                                                                                                                           | y   | ≤ k` | corner, rotate | Count-free by rings; a diamond of `k` rings holds `2k²+2k+1` (filled) |
| Wedge / triangle                                | apex, base width/depth, interval; filled rows `1,2,3…` or `1,3,5…`                                                                        | apex, base corners                                                                       | Rows derived: smallest `r` with `r(r+1)/2 ≥ n` (or `r² ≥ n`)                                                                                                |
| Filled circle / concentric rings                | center, ring interval, start radius, per-ring spacing                                                                                     | rim, center                                                                              | Rings filled from inside out, ring `k` gets `⌊2πr_k / s⌋` slots until `n` is used up                                                                        |
| Scatter / organic fill                          | region (any closed path), min spacing `d`, seed                                                                                           | region handles, "reshuffle"                                                              | Poisson-disk (Bridson) with exactly `n` points: relax with Lloyd iterations inside the region. Seeded so a re-edit is reproducible                          |
| Region fill (any closed shape, lattice clipped) | closed path, lattice (square, staggered, hex), interval, lattice rotation                                                                 | path handles, lattice offset                                                             | Interval fixed, count may not match: report "fits 74, selected 80" and either grow interval or let the user scale                                           |

### 1.3 Transform-style tools (operate on current positions; no new geometry)

These read the selected marchers' **current** positions at the window and map them. Identity
assignment (each marcher keeps its own point), so they never reshuffle.

| Tool                      | Parameters                                                                                    | Handles                        | Notes                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Shift                     | `dx, dy` (steps)                                                                              | drag body                      | Exists as drag and nudge                                                                       |
| Rotate                    | pivot (center of selection, a marcher, any point), angle, snap 15°/45°/90°                    | pivot, rotate ring             | Rotation by 90° keeps a grid on the grid                                                       |
| Scale / expand / contract | pivot, `sx, sy` _or_ "interval to" (re-space a block from 2 to 3 steps)                       | bounding-box corners and edges | "Expand to 3-step interval" is more natural to drill writers than a percent                    |
| Mirror / flip             | axis (vertical through 50, horizontal through front hash, through selection center, any line) | axis line                      | Exists as `flipHorizontal`/`flipVertical`; side-to-side mirror about the 50 is the common case |
| Distribute / equal-space  | along a path or axis; keep ends; order by current projection                                  | ends                           | Exists for horizontal/vertical; along-a-curve is the generalization                            |
| Align / snap              | to yard line, hash, nearest step, nearest ½ step, a line                                      | none                           | Exists (`alignVertically`, `getRoundCoordinates`)                                              |
| Morph between shapes      | from-shape (current) to-shape (another kind) with `t ∈ [0,1]`                                 | slider                         | Generates intermediate in-place positions; with `t=1` it is just "apply shape"                 |
| Make-equal-to (copy form) | source group's relative layout                                                                | drop point                     | Copy another group's form onto this group                                                      |

### 1.4 Composite, text and logo shapes

| Shape          | Model                                                                                             | Count interaction                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Composite      | an ordered list of child shapes, each with a weight or fixed count                                | Split `n` by path length (largest remainder) or by fixed counts per child; each child sampled independently |
| Text           | font glyph outlines → paths (open strokes for a single-line font) → composite                     | By total stroke length; minimum count per glyph so letters stay legible                                     |
| Logo / image   | imported SVG → paths → composite; or a raster mask → region fill                                  | Same; region fill for solid areas                                                                           |
| Section shapes | composite where each child is bound to a section (e.g. trumpets on the arc, battery on the block) | Count per child is the section's selected count                                                             |

## 2. The extensible "shape kind" contract

Goal: a kind is a single module registered in one table. The panel, the canvas, assignment,
validation and storage never `switch` on the kind. This replaces the 9 `switch (kind)` sites
listed in §0 for the authoring side (the resolver's 5 spec kinds are a separate question, §3).

### 2.1 Types

```ts
/** A value the panel can render without knowing the kind. Lengths are in steps in the UI, field units when stored. */
type ParamSpec =
  | {
      type: "length";
      label: string;
      min?: number;
      snap?: number /* steps */;
      default: number;
    }
  | {
      type: "count";
      label: string;
      min: number;
      max?: number;
      derivedFrom?: string;
    }
  | { type: "angle"; label: string; snapDeg?: number; default: number }
  | { type: "point"; label: string } // a field position; usually also a handle
  | { type: "points"; label: string; min: number } // vertex lists (polyline, spline)
  | {
      type: "enum";
      label: string;
      options: { value: string; label: string; icon?: string }[];
      default: string;
    }
  | { type: "bool"; label: string; default: boolean }
  | {
      type: "number";
      label: string;
      min?: number;
      max?: number;
      step?: number;
      default: number;
    };

interface ParamSchema {
  fields: Record<string, ParamSpec>;
  /** Groups shown in order; "advanced" groups start collapsed. */
  groups: { label: string; fields: string[]; advanced?: boolean }[];
  /** Fields hidden unless a condition holds, e.g. interval only when spacingMode === "interval". */
  visibleWhen?: Record<string, (p: Record<string, unknown>) => boolean>;
  /** Fields shown read-only because they are derived, e.g. length when spacing is fixed. */
  derived?: Record<string, (p: Record<string, unknown>, n: number) => number>;
}

interface FitContext {
  current: XY[]; // selected marchers at the window, in selection order
  field: {
    pixelsPerStep: number;
    yardLinesX: number[];
    hashesY: number[];
    bounds: Box;
  };
  previous?: unknown; // the params last used for this kind (sticky defaults)
}

type HandleRole =
  | "point"
  | "move"
  | "rotate"
  | "radius"
  | "scalar"
  | "vertex"
  | "insert";

interface HandleDef<P> {
  key: string; // stable for the kind (not an index, survives vertex inserts better)
  role: HandleRole;
  at: XY;
  /** For "scalar": the axis the drag is projected onto, and which param it edits. */
  axis?: { origin: XY; dir: XY; param: keyof P };
}

interface Slot {
  xy: XY;
  /** Ordering tags the assignment step may use. */
  t?: number; // position along the path, 0..1 (paths)
  row?: number;
  col?: number; // lattice cell (fills)
  part?: number; // child index (composites)
}

interface ShapeKind<P> {
  id: string; // "line", "arc", "block", "spline", ... stored with the recipe
  version: number; // bump when generate() output changes for the same params
  label: string;
  icon: string;
  family: "path" | "fill" | "transform" | "composite";
  params: ParamSchema;

  /** Default params fitted to the selection (§2.3). Pure. */
  fit(ctx: FitContext): P;
  /** Canvas handles for the current params, and what dragging one does. Pure. */
  handles(p: P): HandleDef<P>[];
  drag(
    p: P,
    key: string,
    to: XY,
    mods: { shift: boolean; alt: boolean; snap: Snap },
  ): P;
  /** What to draw besides the slots (the path, the lattice outline). */
  outline(p: P): { paths: XY[][]; closed: boolean[] };

  /** The slots for n marchers. `current` is only read by transform kinds. Deterministic. */
  generate(p: P, n: number, current: XY[]): Slot[];
  /** How many slots the params hold; Infinity for count-free kinds. Used to warn "fits 74 of 80". */
  capacity?(p: P): number;
  /** The kind's natural slot order: along the path, row-major, ring by ring. */
  naturalOrder: "path" | "rowMajor" | "boustrophedon" | "rings" | "identity";

  /** Kind-specific checks beyond the generic ones (§2.5). */
  validate?(p: P, slots: Slot[]): Issue[];
  /** Optional: an exact spec shape for follow-the-leader (§3). */
  toSpecShape?(p: P, n: number): ShapeRow | null;
}
```

The registry is `const SHAPE_KINDS: ShapeKind<any>[]`. Adding a kind is one file plus one
line. Nothing else changes.

### 2.2 Shared building blocks (so kinds stay small)

- `pathSampler(segments)`: segments are `line`, `circularArc`, `cubic`; it builds an arc-length
  table and offers `fitSamples(n, closed)` and `intervalSamples(n, s, anchor)`. Line, polyline,
  arc, circle, ellipse, spline, spiral, wave, box and composites all call it.
- `lattice({ origin, rotation, dx, dy, cols, n, stagger, remainder, gaps, mask })`: block,
  hollow-box-as-grid, staggered, checkerboard, files and ranks, diamond, wedge and region fill.
- `spacingParams()`: the shared `spacingMode`/`interval`/`anchor` triple, so every path kind has
  the same three controls in the same place.
- `rotationHandle(center, radius)`, `cornerHandles(box)`: generic handle factories.

### 2.3 Fitting defaults to the selection

`fit` makes the first preview land near where the marchers already are, so "apply line" to a
rough line of 12 tidies it in place. Recipes:

- Line: principal axis of the points (PCA), ends at the extreme projections. Better than today's
  farthest pair for noisy input, and O(n). Interval = current mean neighbor spacing snapped to ½
  step.
- Arc/circle: least-squares circle fit (Kåsa, algebraic, O(n)); sweep from the extreme angles.
  Falls back to today's mean-distance circle when the fit is degenerate (collinear points → offer
  Line).
- Block: rotation from PCA snapped to 0°/90° unless the user holds Alt; `cols` = number of
  distinct x-clusters (or `round(√n)`); interval = median nearest-neighbor distance snapped.
- Spline: points ordered by selection order (or by nearest-neighbor chain), simplified to about
  `max(3, n/4)` control points.
- Transform kinds: pivot = selection center.
- Sticky defaults: `previous` params for the kind (interval, cols, stagger) carry over, so a user
  who always works at 2 steps sets it once.

### 2.4 How one generic UI renders any kind

**Panel** (inspector section "Shape"):

1. Kind picker: the 5–6 most-used kinds as icon buttons (Line, Arc, Circle, Curve, Block, Box),
   plus "More…" which opens a searchable list, also exposed in the ⌘K palette (#1031). New kinds
   appear in "More…" and the palette, not on the toolbar. Recently used kinds rotate into the row.
2. Controls generated from `params.groups`: `length` → step field with ±½ nudge; `count` →
   integer field; `enum` with icons → segmented control; `bool` → toggle; `angle` → dial plus
   field. Derived fields render read-only with a lock icon that swaps which one is derived
   (spacing ↔ length).
3. An "Order" control shared by every kind (§4): Nearest, Keep order, Drill number, Reverse.
4. A status line: "16 marchers · 2-step interval · 30 steps long", plus issues (§2.5).
5. Apply / Cancel. Enter applies, Escape cancels, as with other tools.

**Canvas** (timeline mode, at the edit window's arrival):

- Draw `outline(p)` dashed, each slot as a ghost dot, and a thin line from each marcher's current
  position to its assigned slot (preview of the move). Draw `handles(p)` by role (one glyph per
  role, not per kind).
- Dragging a handle calls `drag(p, key, to, mods)`, then `generate`, then assignment with the
  **frozen** order (§4.3), then repaints. No database write until Apply.
- Snapping is shared: points snap to step grid, yard lines and hashes; lengths snap to ½ step;
  angles to 15°.
- Apply writes one undoable edit through the existing seam (`timelineCoordinateWrites`), so the
  edit-window, isolation, keep-later-pages and "move them too" rules all apply unchanged.

### 2.5 Generic validation (all kinds)

- **Min spacing**: any two slots closer than a threshold (default 1 step; configurable) →
  warning, with the offending pair highlighted. Using a grid hash makes it O(n).
- **Coincident slots**: error (two marchers on one spot), unless the user confirms.
- **Off field**: slots outside the field bounds → warning; outside `[−10⁶, 10⁶]²` → refuse (I-S1,
  I-D2).
- **Capacity**: `capacity(p) < n` → "fits 74 of 80", offering the derived fix (more rows, smaller
  interval).
- **Step size**: from current positions to slots over the window's counts; over the field's
  `stepSizeWarningThresholdInches` → warning on the marchers that would take a too-large step. This
  is the same check page mode already shows.
- **Crossing / collision in transit** (optional, §4.2).

### 2.6 Four kinds declared

```ts
const line: ShapeKind<{ a: XY; b: XY; spacingMode: "fit" | "interval"; interval: number; anchor: "start" | "center" | "end" }> = {
  id: "line", version: 1, label: "Line", icon: "LineSegment", family: "path", naturalOrder: "path",
  params: {
    fields: { a: { type: "point", label: "Start" }, b: { type: "point", label: "End" }, ...spacingParams() },
    groups: [{ label: "Spacing", fields: ["spacingMode", "interval", "anchor"] }],
    visibleWhen: { interval: p => p.spacingMode === "interval", anchor: p => p.spacingMode === "interval" },
    derived: { length: (p, n) => p.spacingMode === "fit" ? dist(p.a, p.b) : p.interval * (n - 1) },
  },
  fit: ({ current, field }) => { const [a, b] = pcaExtremes(current); return { a, b, spacingMode: "fit",
                                  interval: snapHalfStep(meanNeighbor(current), field), anchor: "start" }; },
  handles: p => [{ key: "a", role: "point", at: p.a }, { key: "b", role: "point", at: p.b },
                 { key: "body", role: "move", at: mid(p.a, p.b) }],
  drag: (p, key, to, m) => key === "body" ? translate(p, to) : { ...p, [key]: m.shift ? snapAngle(p, key, to, 45) : to },
  outline: p => ({ paths: [[p.a, p.b]], closed: [false] }),
  generate: (p, n) => pathSampler([seg.line(p.a, p.b)]).sample(n, p),   // fit or interval+anchor
  toSpecShape: (p, n) => ({ kind: "line", geometry: { points: endsOf(this.generate(p, n)) } }),
};

const arc: ShapeKind<{ a: XY; b: XY; through: XY } & SpacingParams> = {
  id: "arc", version: 1, label: "Arc", icon: "CircleHalf", family: "path", naturalOrder: "path",
  params: { fields: { ...spacingParams() }, groups: [{ label: "Spacing", fields: ["spacingMode", "interval", "anchor"] }] },
  fit: ctx => threePointArc(kasaFit(ctx.current), ctx.current),       // ends at extreme angles, mid on the arc
  handles: p => [pt("a", p.a), pt("b", p.b), { key: "through", role: "point", at: p.through },
                 { key: "center", role: "move", at: circleThrough(p).center }],
  drag: (p, key, to) => key === "center" ? translate(p, sub(to, circleThrough(p).center)) : { ...p, [key]: to },
  outline: p => ({ paths: [flattenArc(p, 64)], closed: [false] }),
  generate: (p, n) => pathSampler([seg.arc3(p.a, p.through, p.b)]).sample(n, p),
  validate: p => collinear(p) ? [{ level: "info", msg: "These points are on a line; it will be drawn as a line." }] : [],
  toSpecShape: (p, n) => ({ kind: "freehand", geometry: { points: flattenArc(p, 32 + n) } }), // or a new spec kind, §3
};

const block: ShapeKind<{ center: XY; rotation: number; cols: number; dx: number; dy: number;
  stagger: "none" | "rows" | "files" | "checker"; staggerOffset: number;
  remainder: "back-left" | "back-center" | "front-center" | "spread"; groupEvery: number; groupGap: number }> = {
  id: "block", version: 1, label: "Block", icon: "GridFour", family: "fill", naturalOrder: "boustrophedon",
  params: {
    fields: {
      cols: { type: "count", label: "Files (across)", min: 1 },
      dx: { type: "length", label: "Interval across", snap: 0.5, default: 2 },
      dy: { type: "length", label: "Interval deep", snap: 0.5, default: 2 },
      stagger: { type: "enum", label: "Pattern", default: "none", options: [
        { value: "none", label: "Grid" }, { value: "rows", label: "Offset ranks" },
        { value: "files", label: "Offset files" }, { value: "checker", label: "Checkerboard" }] },
      staggerOffset: { type: "length", label: "Offset", snap: 0.5, default: 1 },
      remainder: { type: "enum", label: "Short rank", default: "back-center", options: [...] },
      rotation: { type: "angle", label: "Rotation", snapDeg: 15, default: 0 },
      groupEvery: { type: "count", label: "Gap every N files", min: 0 },
      groupGap: { type: "length", label: "Gap size", default: 2 },
    },
    groups: [{ label: "Size", fields: ["cols", "dx", "dy"] }, { label: "Pattern", fields: ["stagger", "staggerOffset"] },
             { label: "More", fields: ["remainder", "rotation", "groupEvery", "groupGap"], advanced: true }],
    visibleWhen: { staggerOffset: p => p.stagger === "rows" || p.stagger === "files" },
    derived: { ranks: (p, n) => Math.ceil((p.stagger === "checker" ? 2 * n : n) / p.cols) },
  },
  fit: ctx => fitLattice(ctx.current, ctx.field),          // cols from x-clusters, interval from median NN
  handles: p => [{ key: "body", role: "move", at: p.center }, { key: "rot", role: "rotate", at: rotHandle(p) },
                 { key: "cols", role: "scalar", at: lastFileHandle(p), axis: { origin: p.center, dir: across(p), param: "cols" } },
                 { key: "dx", role: "scalar", at: secondFile(p), axis: { origin: firstFile(p), dir: across(p), param: "dx" } },
                 { key: "dy", role: "scalar", at: secondRank(p), axis: { origin: firstRank(p), dir: deep(p), param: "dy" } }],
  drag: (p, key, to, m) => dragLattice(p, key, to, m),     // cols handle rounds to whole files at fixed interval
  outline: p => ({ paths: [latticeHull(p)], closed: [true] }),
  generate: (p, n) => lattice({ ...p, n }),                // tags each slot with row, col
  capacity: () => Infinity,
};

const spline: ShapeKind<{ points: XY[]; closed: boolean; tension: number } & SpacingParams> = {
  id: "spline", version: 1, label: "Curve", icon: "BezierCurve", family: "path", naturalOrder: "path",
  params: { fields: { closed: { type: "bool", label: "Closed", default: false },
                      tension: { type: "number", label: "Tension", min: 0, max: 1, step: 0.1, default: 0.5 },
                      ...spacingParams() },
            groups: [{ label: "Curve", fields: ["closed"] }, { label: "Spacing", fields: ["spacingMode", "interval", "anchor"] },
                     { label: "More", fields: ["tension"], advanced: true }] },
  fit: ctx => ({ points: rdp(chainOrder(ctx.current), ctx.field.pixelsPerStep), closed: false, tension: 0.5, ...fitSpacing(ctx) }),
  handles: p => [...p.points.map((at, i) => ({ key: `v${i}`, role: "vertex" as const, at })),
                 ...midpoints(p).map((at, i) => ({ key: `ins${i}`, role: "insert" as const, at }))],
  drag: (p, key, to) => key.startsWith("ins") ? insertVertex(p, key, to) : moveVertex(p, key, to), // Alt-click deletes
  outline: p => ({ paths: [flattenCatmullRom(p, 16)], closed: [p.closed] }),
  generate: (p, n) => pathSampler(catmullRomToCubics(p)).sample(n, p),
  toSpecShape: (p, n) => ({ kind: "freehand", geometry: { points: flattenCatmullRom(p, 8) } }),
};
```

What the generic UI derives from these, with no kind-specific UI code: the block's panel shows
Size, Pattern and a collapsed More; the line's shows only Spacing; the spline shows Closed and
Spacing; every kind gets the Order control, status line and validation for free.

### 2.7 Determinism and versioning

`generate` must be deterministic (fixed iteration counts, seeded randomness for scatter). Each
kind has a `version`. A stored recipe records `kindId@version`. If a later release changes a
kind's output, old recipes still open (the panel shows params), and re-applying uses the new
version only after the user changes something. This matters only under options (b) and (c).

## 3. Relationship to the timeline data model

### 3.1 What the model can express today

- A transition's destinations come from a spec shape **or** from individual points, never both
  (D-16, I-T6). Only the resolver reads shapes, through `destinationsOf`/`sampleDestinations`.
- The 5 spec kinds are in a DB `CHECK (kind IN (...))`, the core `ShapeKind` union and
  `validateShapeGeometry`. Every new spec kind is a schema migration, a spec revision (I-S1,
  R-13, §8.10 degenerate rules, §8.11 bounds), new fuzz and golden coverage, and editor work.
- Follow-the-leader needs a spec shape, because the trail follows `destPath` (I-T5, R-13).
- Group moves in the app are **per-marcher one-slot shapeless transitions** (C-11). A shaped move
  needs one n-slot transition with `dest_shape_id`, which is a different membership layout.
- Any per-marcher edit on a shaped transition converts it to points (Q-14 workaround), so a
  persistent shape is lost the first time a user nudges one marcher.
- Undo works on change-logged tables (`shapes`, `transitions`, `assignments`,
  `slot_destinations`), §6.1 rules U-1 to U-4.

### 3.2 The three options

|                                                                            | (a) Bake only                                                                                                                  | (b) Persistent parametric shape                                                                                                                                                  | (c) Bake plus a recipe                                                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is written                                                            | Slot destinations of the window's moves, through `timelineCoordinateWrites`                                                    | A `timeline_shapes` row (new kinds or a generic `kind = 'param'` with `{kindId, version, params}`); the moved marchers regrouped into one n-slot transition with `dest_shape_id` | (a), plus a recipe row: `{kindId, version, params, marcherIds in slot order, order mode, window (timeline id, beat)}`                             |
| Resolver change                                                            | None                                                                                                                           | Yes: the resolver must run every kind's `generate`, so the whole shape library moves into the resolver contract, bit-exact (P-7, P-8)                                            | None                                                                                                                                              |
| Spec change                                                                | None                                                                                                                           | Large: new kinds or a plug-in kind in I-S1, R-13, §8.10, §8.11, fuzzers, goldens                                                                                                 | Small: a new non-resolver table, or an app-side table outside the spec                                                                            |
| Re-edit later                                                              | No: reselect and re-apply; the params are gone (fit from positions gets close for lines and circles, not for staggered blocks) | Yes, and later edits move every marcher                                                                                                                                          | Yes: open the recipe, edit params, re-apply rewrites those marchers' destinations                                                                 |
| Nudge one marcher afterwards                                               | Just works                                                                                                                     | Converts the transition to points (Q-14); the shape stops being the source                                                                                                       | Just works; the recipe is marked **modified** ("2 marchers moved by hand"); re-apply offers to overwrite them or keep them                        |
| Follow-the-leader                                                          | Not available into this shape                                                                                                  | Available if the kind maps to a spec path                                                                                                                                        | Available through `toSpecShape` on Apply when the user picks FTL (path kinds only); the generated spec shape is the authority for that transition |
| Fits C-11 one-slot moves and the sparse "defined coordinates" model (#112) | Yes, it is what every canvas tool does today                                                                                   | No: needs regrouping into one transition and undoing it when a marcher leaves the group                                                                                          | Yes                                                                                                                                               |
| Undo                                                                       | Existing                                                                                                                       | Existing (shapes are logged)                                                                                                                                                     | Needs the recipe table change-logged (one more trigger set, same pattern)                                                                         |
| File format                                                                | Unchanged                                                                                                                      | New kinds or a new geometry schema; older app versions can't read the show                                                                                                       | One new table; an older app ignores it and still plays the show correctly, because positions are baked                                            |
| Generator changes across releases                                          | Irrelevant                                                                                                                     | Change old shows' positions unless versioned forever in the resolver                                                                                                             | Only affect re-applies                                                                                                                            |
| Upstream edits (D-5)                                                       | Absolute positions, consistent with D-5                                                                                        | Absolute, consistent                                                                                                                                                             | Absolute, consistent                                                                                                                              |

### 3.3 Recommendation (owner decision)

**Recommend (c): bake the positions, keep a re-editable recipe beside them.** Reasons:

1. It matches the owner's intent: a shape is an in-place positioning tool at one time, and the
   result is positions. The resolver contract ("one destination point per slot", D-16) already
   treats a shape as just one way to produce points.
2. It reuses the seam every canvas tool already uses, so window, isolation, keep-later-pages and
   "move them too" behave the same as for a drag. Nothing in the resolver, spec §8 or the fuzz
   evidence changes.
3. New kinds never touch the database schema, the resolver or the spec. That is the extensibility
   the owner asked for; under (b) every kind is a spec revision.
4. Nudging one marcher (very common) doesn't destroy anything; the recipe notes the drift.
5. Follow-the-leader stays possible: a path recipe can emit a spec shape at Apply time.

Recipe storage sketch (app table; name per C-4 conventions):

```sql
CREATE TABLE timeline_shape_recipes (
  id           INTEGER PRIMARY KEY,
  timeline_id  INTEGER NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  at_beat      INTEGER NOT NULL,              -- the arrival the shape positioned (window end)
  kind_id      TEXT NOT NULL,                 -- "block"
  kind_version INTEGER NOT NULL,
  params       TEXT NOT NULL CHECK (json_valid(params)),
  marcher_ids  TEXT NOT NULL CHECK (json_valid(marcher_ids)),   -- slot order, for re-apply and "modified" detection
  order_mode   TEXT NOT NULL
) STRICT;
```

"Modified" is computed, not stored: regenerate and compare with the resolver's arrivals within
`SAME_POSITION_TOLERANCE`. A recipe whose timeline is deleted cascades away; one whose marchers
were all moved elsewhere is shown as "detached" and can be deleted.

Questions for the owner:

- **O-1** (a), (b) or (c)? Recommended: (c).
- **O-2** Is the recipe per window (one per timeline end) or several per window (two shapes for
  two sections)? Recommended: several; a recipe owns a set of marchers.
- **O-3** On re-apply with hand-moved marchers: overwrite, keep, or ask? Recommended: ask once,
  with "keep my hand edits" as the default.
- **O-4** Should FTL into a generated shape be offered in the first version, or later?
- **O-5** Words: "Arc" for the shape vs "Curved path" for the motion style.

Should the owner choose (b) later, (c) does not block it: a recipe can be promoted to a spec shape
for path kinds via `toSpecShape`, and the spec's Q-14 override table would be the way to keep
hand nudges.

## 4. Assignment (which marcher goes to which slot)

### 4.1 Modes and what drill writers expect

| Mode                           | Rule                                                                                                                            | Cost                  | When writers want it                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| Nearest (default for fills)    | Minimize total cost over all marchers (Hungarian)                                                                               | O(n³)                 | "Get there the easiest way"; blocks and scatter                                                      |
| Keep order (default for paths) | Sort marchers by projection onto the shape's natural order (path `t`, or row-major/boustrophedon), match to slots in that order | O(n log n)            | Lines and arcs: neighbors stay neighbors, sections stay together, no crossing in a line-to-line move |
| Drill number                   | Sort by drill prefix and number (S1, S2, …) along the natural order                                                             | O(n log n)            | Charted orders ("trumpets 1–8 left to right")                                                        |
| By section                     | Contiguous runs per section, sections in a chosen order, nearest within each                                                    | Hungarian per section | Mixed sections in one block                                                                          |
| Selection order                | The order the user clicked                                                                                                      | O(n)                  | Hand-controlled; the legacy shape tool behaved like this                                             |
| Reverse                        | Any of the above with the slot order reversed                                                                                   | O(1) extra            | One click to flip which end gets S1                                                                  |
| Identity                       | Each marcher keeps its own point                                                                                                | O(n)                  | Transform kinds (rotate, scale, mirror)                                                              |

The UI should always show the preview lines from marchers to slots, so the user sees crossings
before applying.

### 4.2 Cost and crossings

- **Cost function.** Use **squared** distance for Nearest, not plain distance as casting does
  today. With synchronized straight-line motion (a `direct` move: everyone leaves and arrives
  together), the squared-distance optimum is the CAPT result (Turpin, Michael and Kumar, 2014):
  if start and goal positions each keep a minimum separation, the paths keep it throughout. Plain
  Euclidean distance gives non-crossing segments (a classic result for minimum-length matchings),
  but segments that don't cross can still pass very close mid-move. Squared distance also tends
  to spread the travel more evenly, so fewer marchers take very large steps.
- **Hungarian at 300 marchers.** Cubic: 500 slots measured about 30 ms (`timelineCasting.ts`),
  so 300 is about 7 ms and 250 about 4 ms. Fine for Apply. During a handle drag at 60 fps, do not
  re-solve on every frame: freeze the order (§4.3). If a live re-solve is wanted, run it in a web
  worker on pause (about 100 ms idle), or warm-start from the previous potentials (Jonker–Volgenant
  style), which is near-linear when slots move a little.
- **Above 500.** Keep today's `MAX_CAST_SLOTS` cap behavior: fall back to Keep order (projection),
  which is O(n log n) and crossing-free for path-to-path moves, or solve per section.
- **Tie-breaking.** Grids create exact ties (equal distances). Break ties by marcher drill
  number so the result is the same each time; the Hungarian in core is deterministic for a fixed
  input order, so sort the input by drill number first.
- **Crossing check (diagnostic).** After assignment, test each pair of straight paths for a
  closest approach under a threshold (grid-bucketed, near O(n)), and show "3 pairs pass within 1
  step" with the pairs highlighted. Only a warning; drill writers deliberately cross files.

### 4.3 Stability while editing

- Assignment is computed **once** when the tool opens (or when the order mode or `n` changes),
  as a map from marcher to slot **index**. Dragging handles then regenerates slots and keeps the
  same indexes, so the dots slide smoothly instead of swapping. A "Reassign" button re-runs the
  chosen mode.
- For count-free fills, the index is a `(row, col)` tag, so changing `cols` keeps marchers in the
  same rank and file where possible.
- Re-apply from a recipe uses the stored `marcher_ids` order unless the user asks to reassign.
- Morph and transform kinds always use identity.

## 5. Suggested build order (for the follow-up plan, not decided)

1. `pathSampler` and `lattice` in core, pure, with unit tests (equal arc length, interval and
   anchor, remainders, stagger), plus the `ShapeKind` registry with Line, Arc, Circle, Block.
2. Generic panel and canvas handles over the registry, writing through
   `timelineCoordinateWrites` (option a behavior).
3. Assignment modes (Keep order, Nearest with squared cost, Drill number, Reverse) and the frozen
   order during drags.
4. Recipe table plus re-edit and "modified" (option c), after the owner decides O-1.
5. Spline, hollow box, wedge, rings, composite and text; FTL via `toSpecShape`.

Existing spec-shape editor code (`timelineShapeEditor.ts`, `timelineShapeCanvas.ts`) stays for
editing the spec shapes that FTL transitions and converted shows use; its per-kind `switch`es
could later be rewritten as `ShapeKind` modules for the 5 spec kinds, which would let one canvas
handle layer serve both.
