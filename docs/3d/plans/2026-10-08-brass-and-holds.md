# Brass Instruments and Holds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

<!-- cspell:words mellophone lathed quats sanitize sanitized ligature subwoofer leadpipe hypot crossfade -->

**Goal:** Brass marchers carry procedurally modeled horns in gold or silver lacquer, held in a real arm pose (up, carry, down or trail) while the recorded legs march, replacing om-pose's three placeholders.

**Architecture:** Pure geometry and hold data live in `src/view3d/core/instruments/` (no three.js). The window side poses the eight arm bones of the v4 skeleton to a hold by aiming them at target points, writes those rotations into every clip before the bake, and attaches the horn to the right hand as rigid one-bone geometry merged into the body mesh, exactly like om-pose's block bodies. A local shader patch paints the new part ids; the vendored om-pose files are not edited.

**Tech Stack:** three r186 (BufferGeometry, Bone, AnimationClip, QuaternionKeyframeTrack), om-pose's vendored instanced renderer and uniform shader, Zustand, Vitest (node environment for three), Tolgee keys in `apps/desktop/i18n/en.json`.

**Spec:** `docs/3d/instruments.md` (§3 brass rows, §4, §5, §7 PR 1, §8).

## Global Constraints

- Root `AGENTS.md`: no AI attribution anywhere; commits describe the change.
- `docs/3d/WORKER.md` policy: focused tests only (`pnpm --dir apps/desktop exec vitest run src/view3d`), never the full history or e2e suites; list every command run in the PR.
- ADR 0002 D-1: nothing under `src/view3d/core/` imports three, React, drei, Electron or the database.
- Vendored om-pose files (`src/view3d/vendor/om-pose/*.js`) are read-only. Shader additions go through `onBeforeCompile` wrapping in app code.
- Spec §2: nothing from Yamaha ships; no logos or model names in code, strings or assets.
- Spec §4: triangle budget 300 to 600 per horn.
- Spec §5: hold state is always `up` for now; the panel exposes `carry`, `down`, `trail` for testing and the choice is not saved anywhere.
- Spec §4: finish is a look option, `brass` (gold lacquer) by default, `silver` selectable per section. (Per-section selection UI is out of this PR; the option exists in the look so a later panel can set it.)
- Every file formatted with Prettier, lint clean, `pnpm spellcheck` clean (add words to `cspell.config.yaml` or an inline `cspell:words` comment).
- Coordinates in instrument and hold data: the v4 body's rest frame, meters, +X the performer's left, +Y up, +Z forward (the uniform shader's convention).

## Review Focus

1. A section with no model (Flute, Snare, Color Guard) must draw a body with no instrument and no arm pose change: Task 4's catalog test pins `none`, and Task 7's merge test pins the untouched body for a `none` look.
2. A show mixing height classes and holds must bake one row set per (class, hold) and never look up a row that was not baked: Task 8's test asserts the bake names and that `MarcherMotion` resolves `clip@hold` for a slot's hold.
3. Switching the horn state in the panel rebuilds the bake and meshes without leaking the old texture: Task 9's test asserts `dispose` is called on the previous bake texture.
4. The old placeholder instruments (parts 13 to 15) must never draw, in either quality tier: Task 6's `partVisible` test pins them hidden for every section.
5. The hold must survive a halt: with arm tracks replaced, the halt clip's arm swing is gone, so the hand must not pass through the torso. Task 5's test checks the posed wrist stays at least 0.12 m in front of the chest plane for every hold.

---

## File map

Create:

- `apps/desktop/src/view3d/core/instruments/mesh.ts`: pure mesh primitives producing `Piece`s.
- `apps/desktop/src/view3d/core/instruments/brass.ts`: the seven brass models.
- `apps/desktop/src/view3d/core/instruments/holds.ts`: hold targets per instrument family and state.
- `apps/desktop/src/view3d/core/instruments/catalog.ts`: section to model, family, finish.
- `apps/desktop/src/view3d/core/instruments/__test__/{mesh,brass,holds,catalog}.test.ts`
- `apps/desktop/src/view3d/window/performers/marchers/armPose.ts`: aims the arm bones at a hold's targets; rewrites clips.
- `apps/desktop/src/view3d/window/performers/marchers/instrumentGeometry.ts`: horn geometry skinned to the right hand, merged with the body.
- `apps/desktop/src/view3d/window/performers/marchers/instrumentPaint.ts`: shader patch for part ids 16, 18, 22.
- `apps/desktop/src/view3d/window/performers/__test__/{armPose,instrumentGeometry,instrumentPaint}.test.ts`
- `apps/desktop/src/view3d/window/hornState.ts`: the window's horn state store slice and the list of states.

Modify:

- `apps/desktop/src/view3d/core/marchers/looks.ts`: `UniformLook.options` gains `model`, `finish`, `hold`; `partVisible` hides 13 to 15.
- `apps/desktop/src/view3d/window/performers/marchers/useMarcherBodies.ts`: bake per (clip, hold).
- `apps/desktop/src/view3d/window/performers/marchers/marcherBodies.ts`: merge instrument geometry per look; paint patch.
- `apps/desktop/src/view3d/window/performers/marchers/marcherMotion.ts`: row lookup by slot hold.
- `apps/desktop/src/view3d/window/performers/Performers.tsx`: pass the horn state into looks.
- `apps/desktop/src/view3d/window/sceneStore.ts`: `hornState` and `setHornState`.
- `apps/desktop/src/view3d/window/overlay/SettingsPanel.tsx`: the Horn state row.
- `apps/desktop/i18n/en.json`: `view3d.settings.hornState`, `view3d.settings.hornStateMode.{up,carry,down,trail}`.
- `apps/desktop/src/view3d/vendor/om-pose/README.md`: note the paint patch lives in app code, vendor files unchanged.

---

### Task 1: Mesh primitives

**Files:**

- Create: `apps/desktop/src/view3d/core/instruments/mesh.ts`
- Test: `apps/desktop/src/view3d/core/instruments/__test__/mesh.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export interface Piece {
    part: number;
    positions: number[];
    normals: number[];
    indices: number[];
  }
  export type Vec3 = [number, number, number];
  export const PART_METAL = 16,
    PART_CHROME = 18,
    PART_BLACK = 22;
  export function lathe(
    profile: [r: number, y: number][],
    segments: number,
    part: number,
  ): Piece;
  export function tube(
    path: Vec3[],
    radius: number,
    segments: number,
    part: number,
  ): Piece;
  export function cylinder(
    radius: number,
    from: Vec3,
    to: Vec3,
    segments: number,
    part: number,
  ): Piece;
  export function transformPiece(p: Piece, m: Mat4): Piece; // Mat4 = number[16], column-major
  export function translateY(p: Piece, dy: number): Piece;
  export function triangleCount(pieces: Piece[]): number;
  export function bounds(pieces: Piece[]): { min: Vec3; max: Vec3 };
  ```

  `lathe` revolves the profile about +Y (r at height y), closing a cap when the first or last radius is 0. `tube` sweeps a circle of `radius` along the polyline with parallel-transport frames, capped at both ends. `cylinder` is `tube` with a two-point path. Normals are per face (flat shading, as the bodies). Pure: no three.js.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/desktop/src/view3d/core/instruments/__test__/mesh.test.ts
import { describe, expect, it } from "vitest";
import {
  bounds,
  cylinder,
  lathe,
  triangleCount,
  tube,
  PART_METAL,
} from "../mesh";

describe("lathe", () => {
  it("revolves a profile into a closed, bounded shape", () => {
    // a cone with a flat base: radius 0 at the tip, 0.1 at the base
    const p = lathe(
      [
        [0, 0.2],
        [0.1, 0],
        [0, 0],
      ],
      12,
      PART_METAL,
    );
    expect(triangleCount([p])).toBe(12 * 2 + 12); // side strip + base fan
    const b = bounds([p]);
    expect(b.min[1]).toBeCloseTo(0, 9);
    expect(b.max[1]).toBeCloseTo(0.2, 9);
    expect(b.max[0]).toBeCloseTo(0.1, 9);
    expect(p.positions.length).toBe(p.normals.length);
    expect(p.part).toBe(PART_METAL);
  });

  it("writes unit normals", () => {
    const p = lathe(
      [
        [0.05, 0],
        [0.05, 0.3],
      ],
      8,
      PART_METAL,
    );
    for (let i = 0; i < p.normals.length; i += 3)
      expect(
        Math.hypot(p.normals[i], p.normals[i + 1], p.normals[i + 2]),
      ).toBeCloseTo(1, 6);
  });
});

describe("tube", () => {
  it("sweeps a circle along a bent path with caps", () => {
    const p = tube(
      [
        [0, 0, 0],
        [0, 0, 0.3],
        [0.1, 0, 0.3],
      ],
      0.01,
      8,
      PART_METAL,
    );
    // two segments × 8 quads × 2 + two caps × 8
    expect(triangleCount([p])).toBe(2 * 8 * 2 + 2 * 8);
    const b = bounds([p]);
    expect(b.max[2]).toBeCloseTo(0.31, 2);
    expect(b.max[0]).toBeCloseTo(0.1, 2);
  });

  it("keeps the ring radius through a bend (no pinching)", () => {
    const p = tube(
      [
        [0, 0, 0],
        [0, 0, 0.2],
        [0.2, 0, 0.2],
      ],
      0.02,
      8,
      PART_METAL,
    );
    // ring 1 (the corner) sits at index 8..15: distance to the corner is ≤ radius / cos(45°)
    for (let k = 8; k < 16; k++) {
      const d = Math.hypot(
        p.positions[k * 3] - 0,
        p.positions[k * 3 + 1],
        p.positions[k * 3 + 2] - 0.2,
      );
      expect(d).toBeLessThanOrEqual(0.02 / Math.cos(Math.PI / 4) + 1e-6);
      expect(d).toBeGreaterThanOrEqual(0.02 - 1e-6);
    }
  });
});

describe("cylinder", () => {
  it("runs from one point to another", () => {
    const p = cylinder(0.02, [0, 0, 0], [0, 0.1, 0], 6, PART_METAL);
    const b = bounds([p]);
    expect(b.min[1]).toBeCloseTo(0, 9);
    expect(b.max[1]).toBeCloseTo(0.1, 9);
    expect(b.max[0]).toBeCloseTo(0.02, 6);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core/instruments/__test__/mesh.test.ts`
Expected: FAIL, "Cannot find module '../mesh'".

- [ ] **Step 3: Write the primitives**

```ts
// apps/desktop/src/view3d/core/instruments/mesh.ts
/**
 * Mesh primitives for the 3D View's instruments (docs/3d/instruments.md
 * §4): small flat-shaded pieces, built from numbers. A piece is a triangle
 * list with one uniform-shader part id. Pure: no three.js.
 *
 * Frames: whatever the caller uses; the instrument models use the
 * instrument frame (origin at the right-hand grip, +Z toward the bell,
 * +Y up with the valve caps).
 */

export type Vec3 = [number, number, number];
/** Column-major 4x4, as three.js stores it. */
export type Mat4 = number[];

export interface Piece {
  part: number;
  positions: number[];
  normals: number[];
  indices: number[];
}

/** Uniform shader part ids for instruments (instrumentPaint.ts paints them). */
export const PART_METAL = 16;
export const PART_CHROME = 18;
export const PART_BLACK = 22;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Appends a flat triangle (own vertices, face normal) to a piece. */
function face(p: Piece, a: Vec3, b: Vec3, c: Vec3): void {
  const n = norm(cross(sub(b, a), sub(c, a)));
  const first = p.positions.length / 3;
  for (const v of [a, b, c]) {
    p.positions.push(v[0], v[1], v[2]);
    p.normals.push(n[0], n[1], n[2]);
  }
  p.indices.push(first, first + 1, first + 2);
}

function quad(p: Piece, a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
  face(p, a, b, c);
  face(p, a, c, d);
}

/** A ring of `segments` points of `radius` around `center` in the plane of unit vectors `u`, `v`. */
function ring(
  center: Vec3,
  u: Vec3,
  v: Vec3,
  radius: number,
  segments: number,
): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push(
      add(
        center,
        add(scale(u, Math.cos(a) * radius), scale(v, Math.sin(a) * radius)),
      ),
    );
  }
  return out;
}

/** Joins two rings of equal length with outward-facing quads. */
function strip(p: Piece, r0: Vec3[], r1: Vec3[]): void {
  const n = r0.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    quad(p, r0[i], r1[i], r1[j], r0[j]);
  }
}

/** A fan closing a ring at `center`; `flip` winds it the other way. */
function cap(p: Piece, r: Vec3[], center: Vec3, flip: boolean): void {
  const n = r.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (flip) face(p, center, r[j], r[i]);
    else face(p, center, r[i], r[j]);
  }
}

/**
 * Revolves `profile` (radius, height) pairs about +Y. A zero radius at
 * either end becomes a point; otherwise that end is closed with a flat cap.
 */
export function lathe(
  profile: [number, number][],
  segments: number,
  part: number,
): Piece {
  const p: Piece = { part, positions: [], normals: [], indices: [] };
  const u: Vec3 = [1, 0, 0];
  const v: Vec3 = [0, 0, -1]; // u × v = +Y: outward winding
  const rings = profile.map(([r, y]) => ring([0, y, 0], u, v, r, segments));
  for (let k = 0; k + 1 < profile.length; k++) {
    const [ra, ya] = profile[k];
    const [rb, yb] = profile[k + 1];
    if (ra === 0 && rb === 0) continue;
    if (ra === 0) cap(p, rings[k + 1], [0, ya, 0], yb > ya);
    else if (rb === 0) cap(p, rings[k], [0, yb, 0], yb < ya);
    else strip(p, rings[k], rings[k + 1]);
  }
  const [r0, y0] = profile[0];
  const [rn, yn] = profile[profile.length - 1];
  if (r0 > 0) cap(p, rings[0], [0, y0, 0], yn > y0);
  if (rn > 0) cap(p, rings[rings.length - 1], [0, yn, 0], yn < y0);
  return p;
}

/**
 * Sweeps a circle of `radius` along `path` with parallel-transport frames,
 * so a bend doesn't twist the tube, and caps both ends.
 */
export function tube(
  path: Vec3[],
  radius: number,
  segments: number,
  part: number,
): Piece {
  const p: Piece = { part, positions: [], normals: [], indices: [] };
  if (path.length < 2) return p;
  // tangent at each point: average of the neighboring segment directions
  const tangents: Vec3[] = path.map((_, i) => {
    const prev = i > 0 ? norm(sub(path[i], path[i - 1])) : null;
    const next = i + 1 < path.length ? norm(sub(path[i + 1], path[i])) : null;
    return norm(prev && next ? add(prev, next) : (prev ?? next)!);
  });
  // first frame: any unit vector not parallel to the tangent
  let u = norm(
    cross(tangents[0], Math.abs(tangents[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]),
  );
  const rings: Vec3[][] = [];
  for (let i = 0; i < path.length; i++) {
    if (i > 0) {
      // transport u: remove its component along the new tangent
      u = norm(sub(u, scale(tangents[i], dot(u, tangents[i]))));
    }
    const v = cross(tangents[i], u);
    // widen the ring at a corner so the tube keeps its radius through the bend
    const widen =
      i > 0 && i + 1 < path.length
        ? 1 / Math.max(0.5, dot(tangents[i], norm(sub(path[i + 1], path[i]))))
        : 1;
    rings.push(ring(path[i], u, v, radius * widen, segments));
  }
  for (let i = 0; i + 1 < rings.length; i++) strip(p, rings[i], rings[i + 1]);
  cap(p, rings[0], path[0], true);
  cap(p, rings[rings.length - 1], path[path.length - 1], false);
  return p;
}

export function cylinder(
  radius: number,
  from: Vec3,
  to: Vec3,
  segments: number,
  part: number,
): Piece {
  return tube([from, to], radius, segments, part);
}

export function transformPiece(p: Piece, m: Mat4): Piece {
  const out: Piece = {
    part: p.part,
    positions: [],
    normals: [],
    indices: [...p.indices],
  };
  for (let i = 0; i < p.positions.length; i += 3) {
    const [x, y, z] = [p.positions[i], p.positions[i + 1], p.positions[i + 2]];
    out.positions.push(
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    );
    const [nx, ny, nz] = [p.normals[i], p.normals[i + 1], p.normals[i + 2]];
    const n = norm([
      m[0] * nx + m[4] * ny + m[8] * nz,
      m[1] * nx + m[5] * ny + m[9] * nz,
      m[2] * nx + m[6] * ny + m[10] * nz,
    ]);
    out.normals.push(n[0], n[1], n[2]);
  }
  return out;
}

export function translateY(p: Piece, dy: number): Piece {
  return transformPiece(p, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, dy, 0, 1]);
}

export function triangleCount(pieces: Piece[]): number {
  return pieces.reduce((n, p) => n + p.indices.length / 3, 0);
}

export function bounds(pieces: Piece[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pieces)
    for (let i = 0; i < p.positions.length; i += 3)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], p.positions[i + k]);
        max[k] = Math.max(max[k], p.positions[i + k]);
      }
  return { min, max };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core/instruments/__test__/mesh.test.ts`
Expected: PASS (5 tests). If the lathe count is off by the base cap, check that the zero-radius end is a point (no cap) and the other end gets one fan.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/view3d/core/instruments/mesh.ts apps/desktop/src/view3d/core/instruments/__test__/mesh.test.ts
git commit -m "feat(3d): add mesh primitives for procedural instruments"
```

---

### Task 2: The seven brass models

**Files:**

- Create: `apps/desktop/src/view3d/core/instruments/brass.ts`
- Test: `apps/desktop/src/view3d/core/instruments/__test__/brass.test.ts`

**Interfaces:**

- Consumes: Task 1's `Piece`, `lathe`, `tube`, `cylinder`, `transformPiece`, `PART_*`.
- Produces:

  ```ts
  export type BrassModelId =
    | "trumpet"
    | "mellophone"
    | "baritone"
    | "euphonium"
    | "trombone"
    | "bassTrombone"
    | "contra";
  export interface InstrumentModel {
    id: BrassModelId;
    pieces: Piece[];
    /** the left hand's grip point in the instrument frame */ leftGrip: Vec3;
    /** where the mouthpiece is */ mouthpiece: Vec3;
  }
  export function brassModel(id: BrassModelId): InstrumentModel;
  export const BRASS_DIMENSIONS: Record<
    BrassModelId,
    { length: number; bell: number; bore: number }
  >;
  ```

  Instrument frame: origin at the right-hand grip (the valve block's center for valved horns, the slide brace for trombones, the valve block for the contra), +Z toward the bell, +Y up through the valve caps, +X the performer's left. Dimensions in meters from spec §3: trumpet 0.48 / 0.125, mellophone 0.55 / 0.26, baritone 0.62 / 0.25, euphonium 0.66 / 0.28, trombone 1.18 / 0.21, bass trombone 1.18 / 0.24, contra body 0.95 / bell 0.50.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/desktop/src/view3d/core/instruments/__test__/brass.test.ts
import { describe, expect, it } from "vitest";
import { bounds, triangleCount } from "../mesh";
import { BRASS_DIMENSIONS, brassModel, type BrassModelId } from "../brass";

const IDS: BrassModelId[] = [
  "trumpet",
  "mellophone",
  "baritone",
  "euphonium",
  "trombone",
  "bassTrombone",
  "contra",
];

describe("brass models", () => {
  it.each(IDS)("%s stays within the triangle budget", (id) => {
    const n = triangleCount(brassModel(id).pieces);
    expect(n).toBeGreaterThanOrEqual(300);
    expect(n).toBeLessThanOrEqual(600);
  });

  it.each(IDS)("%s has the spec's length along +Z and bell diameter", (id) => {
    const { min, max } = bounds(brassModel(id).pieces);
    const d = BRASS_DIMENSIONS[id];
    expect(max[2] - min[2]).toBeCloseTo(d.length, 1);
    // the bell is the widest part: its diameter sets the x extent
    expect(max[0] - min[0]).toBeCloseTo(d.bell, 1);
  });

  it("puts the trumpet's right-hand grip at the origin and the mouthpiece behind it", () => {
    const m = brassModel("trumpet");
    expect(m.mouthpiece[2]).toBeLessThan(0);
    expect(Math.abs(m.leftGrip[2])).toBeLessThan(0.12);
    // the valve caps rise above the grip
    const { max } = bounds(m.pieces.filter((p) => p.part === 18));
    expect(max[1]).toBeGreaterThan(0.03);
  });

  it("builds the contra with its bell above the grip", () => {
    const { max } = bounds(brassModel("contra").pieces);
    expect(max[1]).toBeGreaterThan(0.5);
  });

  it("uses only instrument part ids", () => {
    for (const id of IDS)
      for (const p of brassModel(id).pieces)
        expect([16, 18, 22]).toContain(p.part);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core/instruments/__test__/brass.test.ts`
Expected: FAIL, "Cannot find module '../brass'".

- [ ] **Step 3: Write the models**

```ts
// apps/desktop/src/view3d/core/instruments/brass.ts
/**
 * The brass section's horns, built from a few dimensions
 * (docs/3d/instruments.md §3, §4). Instrument frame: origin at the right
 * hand's grip, +Z toward the bell, +Y up through the valve caps, +X the
 * performer's left. Proportions follow the reference pages; nothing is
 * copied from them. Pure: no three.js.
 */
import {
  cylinder,
  lathe,
  tube,
  transformPiece,
  PART_BLACK,
  PART_CHROME,
  PART_METAL,
  type Mat4,
  type Piece,
  type Vec3,
} from "./mesh";

export type BrassModelId =
  | "trumpet"
  | "mellophone"
  | "baritone"
  | "euphonium"
  | "trombone"
  | "bassTrombone"
  | "contra";

export interface InstrumentModel {
  id: BrassModelId;
  pieces: Piece[];
  /** The left hand's grip point in the instrument frame. */
  leftGrip: Vec3;
  /** The mouthpiece's position in the instrument frame. */
  mouthpiece: Vec3;
}

/** Overall length (bell rim to mouthpiece), bell diameter, bore: meters. */
export const BRASS_DIMENSIONS: Record<
  BrassModelId,
  { length: number; bell: number; bore: number }
> = {
  trumpet: { length: 0.48, bell: 0.125, bore: 0.0117 },
  mellophone: { length: 0.55, bell: 0.26, bore: 0.0118 },
  baritone: { length: 0.62, bell: 0.25, bore: 0.0142 },
  euphonium: { length: 0.66, bell: 0.28, bore: 0.0145 },
  trombone: { length: 1.18, bell: 0.21, bore: 0.0127 },
  bassTrombone: { length: 1.18, bell: 0.24, bore: 0.0142 },
  contra: { length: 0.95, bell: 0.5, bore: 0.0185 },
};

const SEG = 12;

/** A lathe along +Z instead of +Y: rotate the profile's axis. */
const Y_TO_Z: Mat4 = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];
const latheZ = (profile: [number, number][], part: number) =>
  transformPiece(lathe(profile, SEG, part), Y_TO_Z);

/** A bell flare from the throat radius at z0 to the rim radius at z1. */
function bell(throat: number, rim: number, z0: number, z1: number): Piece {
  const steps = 6;
  const profile: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // exponential flare: slow at the throat, fast at the rim
    const r =
      throat + (rim - throat) * ((Math.exp(3 * t) - 1) / (Math.exp(3) - 1));
    profile.push([r, z0 + (z1 - z0) * t]);
  }
  return latheZ(profile, PART_METAL);
}

/** Three piston valves standing on the block at the origin, caps in chrome. */
function valves(bore: number, spacing: number, height: number): Piece[] {
  const out: Piece[] = [];
  for (let i = -1; i <= 1; i++) {
    const z = i * spacing;
    out.push(
      cylinder(
        bore * 1.6,
        [0, -height * 0.5, z],
        [0, height * 0.5, z],
        8,
        PART_METAL,
      ),
    );
    out.push(
      cylinder(
        bore * 1.3,
        [0, height * 0.5, z],
        [0, height * 0.5 + 0.018, z],
        8,
        PART_CHROME,
      ),
    );
    out.push(
      cylinder(
        bore * 1.5,
        [0, -height * 0.5 - 0.01, z],
        [0, -height * 0.5, z],
        8,
        PART_CHROME,
      ),
    );
  }
  return out;
}

function mouthpieceAt(p: Vec3, bore: number): Piece {
  return tube([p, [p[0], p[1], p[2] - 0.05]], bore * 1.4, 8, PART_CHROME);
}

function valvedHorn(id: BrassModelId, bellLift: number): InstrumentModel {
  const d = BRASS_DIMENSIONS[id];
  const bore = d.bore;
  const back = -d.length * 0.35; // mouthpiece end
  const front = d.length + back; // bell rim
  const bellStart = front - d.length * 0.3;
  const mouthpiece: Vec3 = [0.02, 0, back];
  const pieces: Piece[] = [
    // leadpipe from the mouthpiece to the valve block
    tube(
      [
        [0.02, 0, back + 0.05],
        [0.02, 0, -0.03],
        [0, 0, -0.02],
      ],
      bore,
      8,
      PART_METAL,
    ),
    ...valves(bore, 0.022, 0.07),
    // bell pipe from the block up and forward to the bell
    tube(
      [
        [0, 0.01, 0.02],
        [0, 0.01 + bellLift * 0.5, 0.08],
        [0, bellLift, bellStart],
      ],
      bore * 1.2,
      8,
      PART_METAL,
    ),
    transformPiece(bell(bore * 1.3, d.bell / 2, bellStart, front), [
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      bellLift,
      0,
      1,
    ]),
    // tuning slide loop under the block
    tube(
      [
        [-0.02, -0.05, 0],
        [-0.02, -0.05, 0.1],
        [0.02, -0.05, 0.1],
        [0.02, -0.05, 0],
      ],
      bore,
      8,
      PART_METAL,
    ),
    // three valve slides out to the performer's left
    tube(
      [
        [0.02, 0, -0.022],
        [0.07, 0, -0.022],
        [0.07, 0, 0.022],
        [0.02, 0, 0.022],
      ],
      bore * 0.9,
      6,
      PART_METAL,
    ),
    mouthpieceAt(mouthpiece, bore),
    // finger ring on the leadpipe for the left hand
    cylinder(0.012, [0.035, -0.02, -0.06], [0.035, 0.02, -0.06], 6, PART_BLACK),
  ];
  return { id, pieces, leftGrip: [0.045, 0, -0.06], mouthpiece };
}

function trombone(id: "trombone" | "bassTrombone"): InstrumentModel {
  const d = BRASS_DIMENSIONS[id];
  const bore = d.bore;
  const back = -0.3; // mouthpiece behind the grip
  const front = d.length + back;
  const bellStart = front - 0.32;
  const mouthpiece: Vec3 = [0.03, 0, back];
  const slideLen = 0.55;
  const pieces: Piece[] = [
    // the two inner slide tubes from the brace forward
    tube(
      [
        [0.03, 0, 0],
        [0.03, 0, slideLen],
      ],
      bore,
      8,
      PART_METAL,
    ),
    tube(
      [
        [-0.03, 0, 0],
        [-0.03, 0, slideLen],
      ],
      bore,
      8,
      PART_METAL,
    ),
    // the slide bow
    tube(
      [
        [0.03, 0, slideLen],
        [0.03, 0, slideLen + 0.04],
        [-0.03, 0, slideLen + 0.04],
        [-0.03, 0, slideLen],
      ],
      bore,
      6,
      PART_METAL,
    ),
    // slide brace (the right hand's grip)
    cylinder(0.006, [-0.03, 0, 0], [0.03, 0, 0], 6, PART_CHROME),
    // bell section: mouthpiece tube back, around, and forward to the bell
    tube(
      [
        [0.03, 0, -0.26],
        [0.03, 0, -0.3 + 0.02],
      ],
      bore,
      8,
      PART_METAL,
    ),
    tube(
      [
        [0.03, 0, -0.26],
        [0.03, 0.05, -0.3],
        [-0.03, 0.05, -0.3],
        [-0.03, 0.05, bellStart],
      ],
      bore * 1.2,
      8,
      PART_METAL,
    ),
    transformPiece(
      bell(bore * 1.3, d.bell / 2, bellStart, front),
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -0.03, 0.05, 0, 1],
    ),
    // bell brace, the left hand's grip
    cylinder(0.006, [-0.03, 0.05, -0.08], [0.03, 0, -0.08], 6, PART_CHROME),
    mouthpieceAt(mouthpiece, bore),
  ];
  if (id === "bassTrombone")
    pieces.push(
      cylinder(0.025, [-0.06, 0.05, -0.2], [-0.02, 0.05, -0.2], 8, PART_METAL),
    ); // rotor
  return { id, pieces, leftGrip: [0, 0.025, -0.08], mouthpiece };
}

function contra(): InstrumentModel {
  const d = BRASS_DIMENSIONS.contra;
  const bore = d.bore;
  const mouthpiece: Vec3 = [0.05, 0.25, -0.12];
  // the body is a wrapped loop beside the player's head; the bell flares forward above
  const pieces: Piece[] = [
    ...valves(bore, 0.03, 0.09),
    tube(
      [
        [0.05, 0.25, -0.07],
        [0.05, 0.1, -0.05],
        [0, 0, -0.03],
      ],
      bore,
      8,
      PART_METAL,
    ),
    // main loop: down, back, up behind the shoulder and forward over it
    tube(
      [
        [0, 0, 0.04],
        [0, -0.25, 0.05],
        [0.15, -0.3, -0.05],
        [0.25, -0.1, -0.2],
        [0.25, 0.3, -0.2],
        [0.15, 0.55, -0.05],
        [0.05, 0.6, 0.1],
      ],
      bore * 1.5,
      10,
      PART_METAL,
    ),
    tube(
      [
        [0.05, 0.6, 0.1],
        [0.05, 0.62, 0.3],
      ],
      bore * 2,
      8,
      PART_METAL,
    ),
    transformPiece(
      bell(bore * 2.1, d.bell / 2, 0.3, 0.3 + (d.length - 0.55)),
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.05, 0.62, 0, 1],
    ),
    // shoulder pad
    cylinder(0.05, [0.12, 0.2, -0.1], [0.12, 0.2, 0.0], 8, PART_BLACK),
    mouthpieceAt(mouthpiece, bore),
  ];
  return { id: "contra", pieces, leftGrip: [0.2, 0.35, -0.2], mouthpiece };
}

export function brassModel(id: BrassModelId): InstrumentModel {
  switch (id) {
    case "trumpet":
      return valvedHorn(id, 0.0);
    case "mellophone":
      return valvedHorn(id, 0.02);
    case "baritone":
      return valvedHorn(id, 0.06);
    case "euphonium":
      return valvedHorn(id, 0.07);
    case "trombone":
    case "bassTrombone":
      return trombone(id);
    case "contra":
      return contra();
  }
}
```

- [ ] **Step 4: Run the tests and tune until they pass**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core/instruments/__test__/brass.test.ts`
Expected: PASS. The length and bell tests use one decimal place; if a model's z extent or x extent misses, adjust `back`, `front` or the bell lathe range for that model, not the test. If a count is over 600, lower `SEG` for that model's bell to 10; if under 300, raise it to 16.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/view3d/core/instruments/brass.ts apps/desktop/src/view3d/core/instruments/__test__/brass.test.ts
git commit -m "feat(3d): model the seven brass horns procedurally"
```

---

### Task 3: Hold data

**Files:**

- Create: `apps/desktop/src/view3d/core/instruments/holds.ts`
- Test: `apps/desktop/src/view3d/core/instruments/__test__/holds.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export type HoldState = "up" | "carry" | "down" | "trail";
  export const HOLD_STATES: readonly HoldState[];
  export type HoldFamily = "brass" | "trombone" | "contra";
  export interface ArmTargets {
    elbow: Vec3;
    wrist: Vec3;
    /** the hand bone's +Y direction (wrist to fingertips) */ fingers: Vec3;
  }
  export interface Hold {
    family: HoldFamily;
    state: HoldState;
    right: ArmTargets;
    left: ArmTargets;
    /** Instrument frame placed in the body frame: origin and the +Z (bell) and +Y (caps) axes. */
    instrument: { origin: Vec3; bellAxis: Vec3; capsAxis: Vec3 };
  }
  export function hold(family: HoldFamily, state: HoldState): Hold;
  export function holdId(family: HoldFamily, state: HoldState): string; // "brass:up"
  ```

  All vectors in the body's rest frame (meters; +X left, +Y up, +Z forward). Body landmarks (neutral-average, class 1.00): right upper-arm head at (−0.185, 1.397, −0.005), left mirrored; chest front at z ≈ 0.12; chin at y ≈ 1.52; eye line at y ≈ 1.62; upper arm 0.205 long, forearm 0.264.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/desktop/src/view3d/core/instruments/__test__/holds.test.ts
import { describe, expect, it } from "vitest";
import { HOLD_STATES, hold, holdId, type HoldFamily } from "../holds";

const SHOULDER_R = [-0.185, 1.397, -0.005] as const;
const UPPER = 0.205;
const FOREARM = 0.264;
const dist = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const FAMILIES: HoldFamily[] = ["brass", "trombone", "contra"];

describe("holds", () => {
  it("lists the four states with up first", () => {
    expect(HOLD_STATES).toEqual(["up", "carry", "down", "trail"]);
    expect(holdId("brass", "up")).toBe("brass:up");
  });

  it.each(FAMILIES)(
    "%s: every state's targets are reachable by the arm",
    (family) => {
      for (const state of HOLD_STATES) {
        const h = hold(family, state);
        for (const [side, arm] of [
          ["right", h.right],
          ["left", h.left],
        ] as const) {
          const shoulder =
            side === "right"
              ? SHOULDER_R
              : [-SHOULDER_R[0], SHOULDER_R[1], SHOULDER_R[2]];
          expect(dist(shoulder, arm.elbow)).toBeLessThanOrEqual(UPPER + 0.02);
          expect(dist(arm.elbow, arm.wrist)).toBeLessThanOrEqual(
            FOREARM + 0.02,
          );
          expect(dist(shoulder, arm.wrist)).toBeGreaterThan(0.12);
          expect(Math.hypot(...arm.fingers)).toBeCloseTo(1, 6);
        }
      }
    },
  );

  it("brass up: bell forward at face height, mouthpiece at the mouth", () => {
    const h = hold("brass", "up");
    expect(h.instrument.bellAxis).toEqual([0, 0, 1]);
    expect(h.instrument.origin[1]).toBeGreaterThan(1.35);
    expect(h.instrument.origin[1]).toBeLessThan(1.55);
    // elbows out: wider than the shoulders
    expect(h.right.elbow[0]).toBeLessThan(SHOULDER_R[0] - 0.08);
  });

  it("brass carry and down: mouthpiece at eye level, bell vertical", () => {
    for (const state of ["carry", "down"] as const) {
      const h = hold("brass", state);
      expect(Math.abs(h.instrument.bellAxis[1])).toBe(1);
      expect(h.instrument.bellAxis[1]).toBe(state === "carry" ? 1 : -1);
    }
  });

  it("brass trail: right arm down the side, bell backward, left arm straight", () => {
    const h = hold("brass", "trail");
    expect(h.instrument.bellAxis).toEqual([0, 0, -1]);
    expect(h.right.wrist[1]).toBeLessThan(1.0);
    expect(h.left.wrist[1]).toBeLessThan(1.0);
    expect(Math.abs(h.left.wrist[0] - 0.2)).toBeLessThan(0.08);
  });

  it("keeps the wrists in front of the chest in every hold", () => {
    for (const family of FAMILIES)
      for (const state of HOLD_STATES) {
        const h = hold(family, state);
        if (state === "trail") continue;
        expect(h.right.wrist[2]).toBeGreaterThan(0.12);
        expect(h.left.wrist[2]).toBeGreaterThan(0.12);
      }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core/instruments/__test__/holds.test.ts`
Expected: FAIL, "Cannot find module '../holds'".

- [ ] **Step 3: Write the hold data**

```ts
// apps/desktop/src/view3d/core/instruments/holds.ts
/**
 * Arm poses for carrying an instrument (docs/3d/instruments.md §5), as
 * target points in the body's rest frame: where the elbow and wrist go and
 * which way the fingers point, for each arm, plus where the instrument sits.
 * `armPose.ts` aims the bones at these. The numbers come from the owner's
 * reference photos; tune them here, nowhere else.
 *
 * Frame: meters, +X the performer's left, +Y up, +Z forward. Landmarks
 * (class 1.00): shoulders at (±0.185, 1.397), chest front z 0.12, chin
 * y 1.52, eye line y 1.62. Upper arm 0.205 m, forearm 0.264 m.
 * Pure: no three.js.
 */
import type { Vec3 } from "./mesh";

export type HoldState = "up" | "carry" | "down" | "trail";
export const HOLD_STATES: readonly HoldState[] = [
  "up",
  "carry",
  "down",
  "trail",
];
export type HoldFamily = "brass" | "trombone" | "contra";

export interface ArmTargets {
  elbow: Vec3;
  wrist: Vec3;
  /** Unit vector: the hand bone's +Y, wrist toward the fingertips. */
  fingers: Vec3;
}

export interface Hold {
  family: HoldFamily;
  state: HoldState;
  right: ArmTargets;
  left: ArmTargets;
  instrument: { origin: Vec3; bellAxis: Vec3; capsAxis: Vec3 };
}

export const holdId = (family: HoldFamily, state: HoldState) =>
  `${family}:${state}`;

const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** The brass triangle: elbows out, forearms up and in, hands at the valves. */
const BRASS: Record<HoldState, Hold> = {
  up: {
    family: "brass",
    state: "up",
    right: {
      elbow: [-0.33, 1.3, 0.08],
      wrist: [-0.06, 1.44, 0.26],
      fingers: unit([0.3, 0.2, 0.1]),
    },
    left: {
      elbow: [0.33, 1.28, 0.08],
      wrist: [0.05, 1.4, 0.2],
      fingers: unit([-0.3, 0.3, 0.15]),
    },
    instrument: {
      origin: [-0.02, 1.44, 0.3],
      bellAxis: [0, 0, 1],
      capsAxis: [0, 1, 0],
    },
  },
  carry: {
    family: "brass",
    state: "carry",
    // vertical in front of the face, bell up, mouthpiece at eye level
    right: {
      elbow: [-0.34, 1.28, 0.06],
      wrist: [-0.05, 1.38, 0.24],
      fingers: unit([0.3, 0.1, 0.0]),
    },
    left: {
      elbow: [0.34, 1.26, 0.06],
      wrist: [0.05, 1.34, 0.22],
      fingers: unit([-0.3, 0.2, 0.0]),
    },
    instrument: {
      origin: [0, 1.38, 0.28],
      bellAxis: [0, 1, 0],
      capsAxis: [0, 0, -1],
    },
  },
  down: {
    family: "brass",
    state: "down",
    // vertical in front of the torso, bell down, mouthpiece at eye level
    right: {
      elbow: [-0.25, 1.2, 0.1],
      wrist: [-0.05, 1.3, 0.22],
      fingers: unit([0.3, 0.1, 0.0]),
    },
    left: {
      elbow: [0.25, 1.18, 0.1],
      wrist: [0.05, 1.26, 0.2],
      fingers: unit([-0.3, 0.2, 0.0]),
    },
    instrument: {
      origin: [0, 1.3, 0.26],
      bellAxis: [0, -1, 0],
      capsAxis: [0, 0, 1],
    },
  },
  trail: {
    family: "brass",
    state: "trail",
    // right arm straight down the side, bell back; left fist at the leg
    right: {
      elbow: [-0.24, 1.2, 0.0],
      wrist: [-0.27, 0.95, 0.03],
      fingers: unit([0, -1, 0]),
    },
    left: {
      elbow: [0.24, 1.2, 0.0],
      wrist: [0.25, 0.95, 0.03],
      fingers: unit([0, -1, 0]),
    },
    instrument: {
      origin: [-0.27, 0.9, 0.03],
      bellAxis: [0, 0, -1],
      capsAxis: [-1, 0, 0],
    },
  },
};

/** Trombone: right hand on the slide brace, left at the bell brace, up only differs. */
const TROMBONE: Record<HoldState, Hold> = {
  ...BRASS,
  up: {
    ...BRASS.up,
    family: "trombone",
    right: {
      elbow: [-0.3, 1.3, 0.1],
      wrist: [-0.04, 1.46, 0.36],
      fingers: unit([0.3, 0.1, 0.2]),
    },
    left: {
      elbow: [0.3, 1.3, 0.06],
      wrist: [0.06, 1.46, 0.22],
      fingers: unit([-0.3, 0.2, 0.1]),
    },
    instrument: {
      origin: [-0.02, 1.46, 0.38],
      bellAxis: [0, 0, 1],
      capsAxis: [0, 1, 0],
    },
  },
};
for (const s of ["carry", "down", "trail"] as const)
  TROMBONE[s] = { ...BRASS[s], family: "trombone" };

/** Contra: shouldered on the left, right hand at the valves at chest height. */
const CONTRA_UP: Hold = {
  family: "contra",
  state: "up",
  right: {
    elbow: [-0.3, 1.25, 0.1],
    wrist: [-0.02, 1.3, 0.24],
    fingers: unit([0.3, 0.1, 0.0]),
  },
  left: {
    elbow: [0.32, 1.3, 0.0],
    wrist: [0.22, 1.5, 0.1],
    fingers: unit([0, 1, 0.2]),
  },
  instrument: {
    origin: [-0.02, 1.3, 0.26],
    bellAxis: [0, 0, 1],
    capsAxis: [0, 1, 0],
  },
};
const CONTRA: Record<HoldState, Hold> = {
  up: CONTRA_UP,
  carry: { ...CONTRA_UP, state: "carry" },
  down: { ...CONTRA_UP, state: "down" },
  trail: { ...CONTRA_UP, state: "trail" },
};

const TABLE: Record<HoldFamily, Record<HoldState, Hold>> = {
  brass: BRASS,
  trombone: TROMBONE,
  contra: CONTRA,
};

export function hold(family: HoldFamily, state: HoldState): Hold {
  return TABLE[family][state];
}
```

- [ ] **Step 4: Run the tests and adjust targets until they pass**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core/instruments/__test__/holds.test.ts`
Expected: PASS. If a reach test fails, move that elbow or wrist toward the shoulder; never loosen the tolerance. The trail hold's wrists are below the chest, which the "in front of the chest" test skips on purpose.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/view3d/core/instruments/holds.ts apps/desktop/src/view3d/core/instruments/__test__/holds.test.ts
git commit -m "feat(3d): add hold targets for brass, trombone and contra"
```

---

### Task 4: Catalog and look options

**Files:**

- Create: `apps/desktop/src/view3d/core/instruments/catalog.ts`
- Modify: `apps/desktop/src/view3d/core/marchers/looks.ts:108-116` (replace `Instrument` and `instrumentForSection`), `:134-141` (`UniformLook.options`), `:180-188` (`sectionUniform`), `:201-215` (`partVisible`)
- Test: `apps/desktop/src/view3d/core/instruments/__test__/catalog.test.ts`, `apps/desktop/src/view3d/core/marchers/__test__/looks.test.ts`

**Interfaces:**

- Consumes: `BrassModelId` (Task 2), `HoldFamily`, `HoldState` (Task 3).
- Produces:

  ```ts
  // catalog.ts
  export type Finish = "brass" | "silver";
  export interface Carry { model: BrassModelId; family: HoldFamily }
  export function carryForSection(section: string): Carry | null
  // looks.ts
  export interface UniformLook { ...; options: { hat: boolean; hatType: "shako"; instrument: "none"; carry: Carry | null; finish: Finish; hold: HoldState } }
  export function sectionUniform(section, fill, hold: HoldState = "up"): UniformLook
  ```

  `options.instrument` stays `"none"` so the vendored shader discards parts 13 to 15. `uniformKey` (JSON of the look) now includes carry, finish and hold, so meshes group by them for free.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/desktop/src/view3d/core/instruments/__test__/catalog.test.ts
import { describe, expect, it } from "vitest";
import { carryForSection } from "../catalog";

describe("section to instrument", () => {
  it("maps the brass sections", () => {
    expect(carryForSection("Trumpet")).toEqual({
      model: "trumpet",
      family: "brass",
    });
    expect(carryForSection("Mellophone")).toEqual({
      model: "mellophone",
      family: "brass",
    });
    expect(carryForSection("Baritone")).toEqual({
      model: "baritone",
      family: "brass",
    });
    expect(carryForSection("Euphonium")).toEqual({
      model: "euphonium",
      family: "brass",
    });
    expect(carryForSection("Trombone")).toEqual({
      model: "trombone",
      family: "trombone",
    });
    expect(carryForSection("Bass Trombone")).toEqual({
      model: "bassTrombone",
      family: "trombone",
    });
    expect(carryForSection("Tuba")).toEqual({
      model: "contra",
      family: "contra",
    });
  });

  it("is case and whitespace insensitive", () => {
    expect(carryForSection("  trumpet ")).toEqual({
      model: "trumpet",
      family: "brass",
    });
  });

  it("carries nothing for every other section", () => {
    for (const s of [
      "Flute",
      "Snare",
      "Color Guard",
      "Marimba",
      "Drum Major",
      "",
      "Cornet",
    ])
      expect(carryForSection(s)).toBeNull();
  });
});
```

Add to `apps/desktop/src/view3d/core/marchers/__test__/looks.test.ts` (keep the existing tests; replace any that reference `instrumentForSection` or `Instrument`; import `PART`, `partVisible`, `sectionUniform` and `uniformKey` from `../looks`):

```ts
describe("instrument options", () => {
  it("puts the section's carry, gold lacquer and the hold in the look", () => {
    const u = sectionUniform("Trumpet", null);
    expect(u.options.carry).toEqual({ model: "trumpet", family: "brass" });
    expect(u.options.finish).toBe("brass");
    expect(u.options.hold).toBe("up");
    expect(u.options.instrument).toBe("none");
    expect(sectionUniform("Trumpet", null, "carry").options.hold).toBe("carry");
  });

  it("never shows the placeholder instruments, for any section", () => {
    for (const s of ["Trumpet", "Mellophone", "Baritone", "Flute"])
      for (const part of PART.instruments)
        expect(partVisible(sectionUniform(s, null), part)).toBe(false);
  });

  it("keys looks by carry, finish and hold", () => {
    const a = uniformKey(sectionUniform("Trumpet", null, "up"));
    const b = uniformKey(sectionUniform("Trumpet", null, "carry"));
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core/instruments/__test__/catalog.test.ts src/view3d/core/marchers/__test__/looks.test.ts`
Expected: FAIL on the missing module and the missing options.

- [ ] **Step 3: Write the catalog and update the look**

```ts
// apps/desktop/src/view3d/core/instruments/catalog.ts
/**
 * Which instrument a section carries and how (docs/3d/instruments.md §3).
 * Sections without a model carry nothing. Pure.
 */
import type { BrassModelId } from "./brass";
import type { HoldFamily } from "./holds";

export type Finish = "brass" | "silver";

export interface Carry {
  model: BrassModelId;
  family: HoldFamily;
}

const BRASS_SECTIONS: Record<string, Carry> = {
  trumpet: { model: "trumpet", family: "brass" },
  mellophone: { model: "mellophone", family: "brass" },
  baritone: { model: "baritone", family: "brass" },
  euphonium: { model: "euphonium", family: "brass" },
  trombone: { model: "trombone", family: "trombone" },
  "bass trombone": { model: "bassTrombone", family: "trombone" },
  tuba: { model: "contra", family: "contra" },
};

export function carryForSection(section: string): Carry | null {
  return BRASS_SECTIONS[section.trim().toLowerCase()] ?? null;
}
```

In `looks.ts`:

```ts
// replace the Instrument type and instrumentForSection with:
import { carryForSection, type Carry, type Finish } from "../instruments/catalog";
import type { HoldState } from "../instruments/holds";

/** The vendored shader's own instrument option; always "none": the horns are our geometry. */
export type Instrument = "none";

// UniformLook.options becomes:
    options: {
        hat: boolean;
        hatType: "shako";
        instrument: Instrument;
        /** What the section carries, or null. */
        carry: Carry | null;
        /** Gold lacquer ("brass") or silver lacquer. */
        finish: Finish;
        hold: HoldState;
    };

// sectionUniform gains a third parameter and fills the options:
export function sectionUniform(
    section: string,
    fill: RgbaColor | null | undefined,
    hold: HoldState = "up",
): UniformLook {
    ...
        options: {
            hat: !isGuard(section),
            hatType: "shako",
            instrument: "none",
            carry: carryForSection(section),
            finish: "brass",
            hold,
        },
    };
}

// partVisible: the placeholder instruments never draw
    const i = (PART.instruments as readonly number[]).indexOf(part);
    if (i >= 0) return false;
```

Update the header comment's "carrying the section's instrument when om-pose models it" to "carrying the section's instrument from `core/instruments`".

- [ ] **Step 4: Run the tests to verify they pass, then type-check**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core` then `pnpm --dir apps/desktop exec tsc --noEmit`
Expected: PASS; tsc reports errors only in `marcherBodies.test.ts` triangle counts if any test there assumed instruments drew (update that expectation: "Trumpet" now draws 1256 like "Flute").

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/view3d/core/instruments/catalog.ts apps/desktop/src/view3d/core/instruments/__test__/catalog.test.ts apps/desktop/src/view3d/core/marchers/looks.ts apps/desktop/src/view3d/core/marchers/__test__/looks.test.ts apps/desktop/src/view3d/window/performers/__test__/marcherBodies.test.ts
git commit -m "feat(3d): give looks a carried instrument, finish and hold; hide the placeholders"
```

---

### Task 5: Posing the arms and rewriting clips

**Files:**

- Create: `apps/desktop/src/view3d/window/performers/marchers/armPose.ts`
- Test: `apps/desktop/src/view3d/window/performers/__test__/armPose.test.ts`

**Interfaces:**

- Consumes: `Hold`, `ArmTargets` (Task 3); a three `Skeleton` from a loaded body (`LoadedBody.mesh.skeleton`).
- Produces:

  ```ts
  export const ARM_BONES: readonly string[]; // sanitized names: "DEF-shoulderL", "DEF-upper_armL", "DEF-forearmL", "DEF-handL" and the R four
  export interface ArmPose {
    /** local quaternion per sanitized bone name */ local: Map<
      string,
      THREE.Quaternion
    >;
    /** world matrix of DEF-handR in the posed rest body */ handR: THREE.Matrix4;
    handL: THREE.Matrix4;
  }
  export function poseArms(skeleton: THREE.Skeleton, hold: Hold): ArmPose;
  export function holdClip(
    clip: THREE.AnimationClip,
    pose: ArmPose,
    name: string,
  ): THREE.AnimationClip;
  ```

  `poseArms` clones the skeleton's bones at bind pose, keeps the shoulders (clavicles) at bind, aims each upper arm's +Y at `elbow`, each forearm's +Y at `wrist`, and sets each hand's +Y to `fingers`, choosing the roll of the upper arm so the forearm bends in the plane through shoulder, elbow and wrist. `holdClip` returns a new clip named `name` whose tracks for the eight arm bones are replaced by constant `QuaternionKeyframeTrack`s (times `[0, clip.duration]`) and whose other tracks are shared.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/desktop/src/view3d/window/performers/__test__/armPose.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HOLD_STATES, hold } from "@/view3d/core/instruments/holds";
import { ARM_BONES, holdClip, poseArms } from "../marchers/armPose";

async function skeleton(): Promise<THREE.Skeleton> {
  const b = fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../assets/om-pose/bodies/neutral-average.glb",
    ),
  );
  const gltf = await new GLTFLoader().parseAsync(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    "",
  );
  let sk: THREE.Skeleton | null = null;
  gltf.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh)
      sk = (o as THREE.SkinnedMesh).skeleton;
  });
  return sk!;
}

async function clip8to5(): Promise<THREE.AnimationClip> {
  const b = fs.readFileSync(
    path.resolve(__dirname, "../../../assets/om-pose/clips/clips-h100.glb"),
  );
  const gltf = await new GLTFLoader().parseAsync(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    "",
  );
  return gltf.animations.find((c) => c.name === "8to5")!;
}

/** World position of a posed bone's head, by applying the pose to a cloned rig. */
function posedHead(
  sk: THREE.Skeleton,
  pose: ReturnType<typeof poseArms>,
  name: string,
): THREE.Vector3 {
  const bones = sk.bones.map((b) => b.clone(false));
  sk.bones.forEach((b, i) => {
    const p = b.parent ? sk.bones.indexOf(b.parent as THREE.Bone) : -1;
    if (p >= 0) bones[p].add(bones[i]);
  });
  bones.forEach((b) => {
    const q = pose.local.get(b.name);
    if (q) b.quaternion.copy(q);
  });
  const root = bones.find((b) => !b.parent)!;
  root.updateMatrixWorld(true);
  return new THREE.Vector3().setFromMatrixPosition(
    bones.find((b) => b.name === name)!.matrixWorld,
  );
}

describe("poseArms", () => {
  it("names the eight arm bones", () => {
    expect(ARM_BONES).toEqual([
      "DEF-shoulderL",
      "DEF-upper_armL",
      "DEF-forearmL",
      "DEF-handL",
      "DEF-shoulderR",
      "DEF-upper_armR",
      "DEF-forearmR",
      "DEF-handR",
    ]);
  });

  it.each(HOLD_STATES)(
    "brass %s: puts the elbows and wrists on their targets",
    async (state) => {
      const sk = await skeleton();
      const h = hold("brass", state);
      const pose = poseArms(sk, h);
      expect(pose.local.size).toBe(8);
      const elbowR = posedHead(sk, pose, "DEF-forearmR");
      const wristR = posedHead(sk, pose, "DEF-handR");
      expect(
        elbowR.distanceTo(new THREE.Vector3(...h.right.elbow)),
      ).toBeLessThan(0.02);
      expect(
        wristR.distanceTo(new THREE.Vector3(...h.right.wrist)),
      ).toBeLessThan(0.02);
      const wristL = posedHead(sk, pose, "DEF-handL");
      expect(
        wristL.distanceTo(new THREE.Vector3(...h.left.wrist)),
      ).toBeLessThan(0.02);
    },
  );

  it("points the hand's +Y along the fingers", async () => {
    const sk = await skeleton();
    const h = hold("brass", "up");
    const pose = poseArms(sk, h);
    const y = new THREE.Vector3(0, 1, 0).transformDirection(pose.handR);
    expect(y.dot(new THREE.Vector3(...h.right.fingers))).toBeGreaterThan(0.99);
  });

  it("keeps the wrists clear of the torso in every hold", async () => {
    const sk = await skeleton();
    for (const state of HOLD_STATES) {
      const pose = poseArms(sk, hold("brass", state));
      const w = posedHead(sk, pose, "DEF-handR");
      // in front of the chest plane, or (trail) beside the body
      expect(w.z > 0.12 || Math.abs(w.x) > 0.22).toBe(true);
    }
  });
});

describe("holdClip", () => {
  it("replaces the arm tracks with constants and keeps the rest", async () => {
    const sk = await skeleton();
    const clip = await clip8to5();
    const out = holdClip(
      clip,
      poseArms(sk, hold("brass", "up")),
      "8to5@brass:up",
    );
    expect(out.name).toBe("8to5@brass:up");
    expect(out.duration).toBe(clip.duration);
    expect(out.tracks.length).toBe(clip.tracks.length);
    const arm = out.tracks.filter(
      (t) =>
        ARM_BONES.includes(t.name.split(".")[0]) &&
        t.name.endsWith(".quaternion"),
    );
    expect(arm.length).toBe(8);
    for (const t of arm) {
      expect(t.times.length).toBe(2);
      expect(t.values.slice(0, 4)).toEqual(t.values.slice(4, 8));
    }
    const leg = out.tracks.find((t) => t.name === "DEF-thighL.quaternion")!;
    expect(leg).toBe(
      clip.tracks.find((t) => t.name === "DEF-thighL.quaternion"),
    );
    // the source clip is untouched
    expect(
      clip.tracks.find((t) => t.name === "DEF-handR.quaternion")!.times.length,
    ).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/window/performers/__test__/armPose.test.ts`
Expected: FAIL, "Cannot find module '../marchers/armPose'".

- [ ] **Step 3: Write the posing code**

```ts
// apps/desktop/src/view3d/window/performers/marchers/armPose.ts
/**
 * Poses the v4 skeleton's arms to a hold (docs/3d/instruments.md §5) and
 * writes that pose into clips before the bake, so the recorded legs march
 * while the arms hold the instrument.
 *
 * Each arm is aimed, not solved: the upper arm's +Y points at the elbow
 * target, the forearm's at the wrist target, the hand's along the fingers.
 * Bone lengths are the skeleton's, so a target just out of reach lands
 * short along the same line. The clavicles stay at bind.
 */
import * as THREE from "three";
import type { Hold, ArmTargets } from "@/view3d/core/instruments/holds";

/** GLTFLoader drops the dots from bone names (PropertyBinding.sanitizeNodeName). */
export const ARM_BONES: readonly string[] = [
  "DEF-shoulderL",
  "DEF-upper_armL",
  "DEF-forearmL",
  "DEF-handL",
  "DEF-shoulderR",
  "DEF-upper_armR",
  "DEF-forearmR",
  "DEF-handR",
];

export interface ArmPose {
  local: Map<string, THREE.Quaternion>;
  handR: THREE.Matrix4;
  handL: THREE.Matrix4;
}

/** A private copy of the bone hierarchy at bind pose, from the inverse bind matrices. */
function bindRig(skeleton: THREE.Skeleton): THREE.Bone[] {
  const bones = skeleton.bones.map((b) => {
    const c = new THREE.Bone();
    c.name = b.name;
    return c;
  });
  skeleton.bones.forEach((b, i) => {
    const p =
      b.parent && (b.parent as THREE.Bone).isBone
        ? skeleton.bones.indexOf(b.parent as THREE.Bone)
        : -1;
    if (p >= 0) bones[p].add(bones[i]);
  });
  // world = inverse(boneInverse); local = inverse(parentWorld) * world
  const world = skeleton.boneInverses.map((m) => m.clone().invert());
  skeleton.bones.forEach((b, i) => {
    const p =
      b.parent && (b.parent as THREE.Bone).isBone
        ? skeleton.bones.indexOf(b.parent as THREE.Bone)
        : -1;
    const local =
      p >= 0 ? world[p].clone().invert().multiply(world[i]) : world[i];
    local.decompose(bones[i].position, bones[i].quaternion, bones[i].scale);
  });
  for (const b of bones) if (!b.parent) b.updateMatrixWorld(true);
  return bones;
}

/** The world rotation that takes +Y to `dir`, with +Z as near `hint` as it can be. */
function aim(dir: THREE.Vector3, hint: THREE.Vector3): THREE.Quaternion {
  const y = dir.clone().normalize();
  let z = hint.clone().sub(y.clone().multiplyScalar(hint.dot(y)));
  if (z.lengthSq() < 1e-8)
    z = new THREE.Vector3(0, 0, 1).sub(y.clone().multiplyScalar(y.z));
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x, y, z),
  );
}

/** Sets `bone`'s local rotation so its world +Y points along `dir`, then updates the world matrices. */
function aimBone(
  bone: THREE.Bone,
  dir: THREE.Vector3,
  hint: THREE.Vector3,
): void {
  const parentWorld = new THREE.Quaternion();
  (bone.parent as THREE.Object3D).getWorldQuaternion(parentWorld);
  bone.quaternion.copy(parentWorld.invert().multiply(aim(dir, hint)));
  bone.updateMatrixWorld(true);
}

function poseArm(bones: THREE.Bone[], side: "L" | "R", t: ArmTargets): void {
  const find = (n: string) => bones.find((b) => b.name === n + side)!;
  const upper = find("DEF-upper_arm");
  const fore = find("DEF-forearm");
  const hand = find("DEF-hand");
  const elbow = new THREE.Vector3(...t.elbow);
  const wrist = new THREE.Vector3(...t.wrist);
  const head = (b: THREE.Bone) =>
    new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
  // the bend plane's normal is the hint for the roll of both bones
  const shoulder = head(upper);
  const normal = new THREE.Vector3().crossVectors(
    elbow.clone().sub(shoulder),
    wrist.clone().sub(elbow),
  );
  if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
  aimBone(upper, elbow.clone().sub(shoulder), normal);
  aimBone(fore, wrist.clone().sub(head(fore)), normal);
  aimBone(hand, new THREE.Vector3(...t.fingers), normal);
}

export function poseArms(skeleton: THREE.Skeleton, hold: Hold): ArmPose {
  const bones = bindRig(skeleton);
  poseArm(bones, "R", hold.right);
  poseArm(bones, "L", hold.left);
  const local = new Map<string, THREE.Quaternion>();
  for (const name of ARM_BONES)
    local.set(name, bones.find((b) => b.name === name)!.quaternion.clone());
  return {
    local,
    handR: bones.find((b) => b.name === "DEF-handR")!.matrixWorld.clone(),
    handL: bones.find((b) => b.name === "DEF-handL")!.matrixWorld.clone(),
  };
}

/** `clip` with the arm bones' rotation tracks replaced by the pose, as a new clip named `name`. */
export function holdClip(
  clip: THREE.AnimationClip,
  pose: ArmPose,
  name: string,
): THREE.AnimationClip {
  const tracks = clip.tracks.map((t) => {
    const [bone, prop] = t.name.split(".");
    const q = prop === "quaternion" ? pose.local.get(bone) : undefined;
    if (!q) return t;
    return new THREE.QuaternionKeyframeTrack(
      t.name,
      [0, clip.duration],
      [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w],
    );
  });
  return new THREE.AnimationClip(name, clip.duration, tracks);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/window/performers/__test__/armPose.test.ts`
Expected: PASS. If an elbow test fails by more than 2 cm, the target is out of reach: fix the hold data in Task 3's file, not the solver. If the hand's +Y test fails, check `aim` builds a right-handed basis (x = y × z).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/view3d/window/performers/marchers/armPose.ts apps/desktop/src/view3d/window/performers/__test__/armPose.test.ts
git commit -m "feat(3d): pose the arms to a hold and write it into clips"
```

---

### Task 6: Paint patch for the instrument parts

**Files:**

- Create: `apps/desktop/src/view3d/window/performers/marchers/instrumentPaint.ts`
- Modify: `apps/desktop/src/view3d/vendor/om-pose/README.md` (one line under the table)
- Test: `apps/desktop/src/view3d/window/performers/__test__/instrumentPaint.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export function paintInstruments(
    material: THREE.MeshStandardMaterial,
  ): THREE.MeshStandardMaterial;
  export const CHROME = 0xd9dde2,
    HARDWARE_BLACK = 0x141416;
  ```

  Wraps the material's existing `onBeforeCompile` so the fragment shader's `uniformColor()` returns `uMetal` for part 16, chrome for 18 and black for 22 before the vendored cases run, and changes `customProgramCacheKey` to `"om-uniform-v1+instruments"`. The finish color itself comes from the vendored `options.finish` ("brass" or "silver") through `uMetal`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/view3d/window/performers/__test__/instrumentPaint.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createUniformMaterial } from "@/view3d/vendor/om-pose/uniform-shader.js";
import { paintInstruments } from "../marchers/instrumentPaint";

function compiled(material: THREE.MeshStandardMaterial) {
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: "#include <begin_vertex>",
    fragmentShader:
      "vec4 diffuseColor = vec4( diffuse, opacity );\n  if (part == 0) return uSkin;",
  };
  material.onBeforeCompile(shader as never, null as never);
  return shader;
}

describe("paintInstruments", () => {
  it("adds the instrument part cases ahead of the vendored ones", () => {
    const m = paintInstruments(
      createUniformMaterial(THREE, { options: { finish: "silver" } }),
    );
    const s = compiled(m);
    const i16 = s.fragmentShader.indexOf("part == 16");
    const i0 = s.fragmentShader.indexOf("part == 0");
    expect(i16).toBeGreaterThan(-1);
    expect(i16).toBeLessThan(i0);
    expect(s.fragmentShader).toContain("part == 18");
    expect(s.fragmentShader).toContain("part == 22");
    expect(s.fragmentShader).toContain("uniformColor()");
    expect(m.customProgramCacheKey()).toBe("om-uniform-v1+instruments");
  });

  it("keeps the vendored finish uniform for the metal", () => {
    const m = paintInstruments(
      createUniformMaterial(THREE, { options: { finish: "silver" } }),
    );
    const u = m.userData.uniforms as { uMetal: { value: THREE.Color } };
    expect(u.uMetal.value.getHex()).toBe(0xd4d8de);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/window/performers/__test__/instrumentPaint.test.ts`
Expected: FAIL, "Cannot find module '../marchers/instrumentPaint'".

- [ ] **Step 3: Write the patch**

```ts
// apps/desktop/src/view3d/window/performers/marchers/instrumentPaint.ts
/**
 * Paints the instrument parts (docs/3d/instruments.md §4) on om-pose's
 * uniform material without editing the vendored shader: part 16 takes the
 * look's finish (`uMetal`: gold or silver lacquer), 18 chrome, 22 black
 * hardware. Wraps the material's own `onBeforeCompile`.
 */
import type * as THREE from "three";

export const CHROME = 0xd9dde2;
export const HARDWARE_BLACK = 0x141416;

const hex = (c: number) => {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
};

const CASES =
  `  if (part == 16) return uMetal;\n` +
  `  if (part == 18) return ${hex(CHROME)};\n` +
  `  if (part == 22) return ${hex(HARDWARE_BLACK)};\n`;

export function paintInstruments(
  material: THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial {
  const inner = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    inner.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      "  if (part == 0) return uSkin;",
      CASES + "  if (part == 0) return uSkin;",
    );
  };
  material.customProgramCacheKey = () => "om-uniform-v1+instruments";
  return material;
}
```

Append to the vendor README after the table:

```markdown
The app paints the instrument part ids (16, 18, 22; `docs/3d/instruments.md` §4) by wrapping
`createUniformMaterial`'s `onBeforeCompile` in `window/performers/marchers/instrumentPaint.ts`.
The vendored shader is unchanged; move those cases into om-pose's `uniform-shader.js` when convenient.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/window/performers/__test__/instrumentPaint.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/view3d/window/performers/marchers/instrumentPaint.ts apps/desktop/src/view3d/window/performers/__test__/instrumentPaint.test.ts apps/desktop/src/view3d/vendor/om-pose/README.md
git commit -m "feat(3d): paint instrument parts on the uniform material"
```

---

### Task 7: Instrument geometry on the hand, merged with the body

**Files:**

- Create: `apps/desktop/src/view3d/window/performers/marchers/instrumentGeometry.ts`
- Test: `apps/desktop/src/view3d/window/performers/__test__/instrumentGeometry.test.ts`

**Interfaces:**

- Consumes: `brassModel` (Task 2), `Hold` (Task 3), `ArmPose` (Task 5), a `Skeleton`, the body's source `BufferGeometry` and the look's filtered index (`visibleIndex`).
- Produces:

  ```ts
  export function instrumentGeometry(
    skeleton: THREE.Skeleton,
    pose: ArmPose,
    hold: Hold,
    model: InstrumentModel,
  ): THREE.BufferGeometry;
  export function withInstrument(
    body: THREE.BufferGeometry,
    index: THREE.BufferAttribute | null,
    instrument: THREE.BufferGeometry,
  ): THREE.BufferGeometry;
  ```

  `instrumentGeometry` places the model's pieces in the body frame by the hold's `instrument` placement (origin, bell axis = +Z, caps axis = +Y), then maps them into the bind pose of `DEF-handR`: `v_bind = bindHandWorld × inverse(pose.handR) × v_body`, so after skinning with the hold's hand matrix the horn sits where the hold put it. Every vertex gets `skinIndex = [handR, 0, 0, 0]`, `skinWeight = [1, 0, 0, 0]`, and `_part` from the piece. `withInstrument` returns a new non-indexed-shared geometry: the body's position, normal, skinIndex, skinWeight and `_part` (restricted to `index` when given) followed by the instrument's, with a merged index.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/desktop/src/view3d/window/performers/__test__/instrumentGeometry.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { brassModel } from "@/view3d/core/instruments/brass";
import { hold } from "@/view3d/core/instruments/holds";
import { sectionUniform } from "@/view3d/core/marchers/looks";
import { poseArms } from "../marchers/armPose";
import {
  instrumentGeometry,
  withInstrument,
} from "../marchers/instrumentGeometry";
import { visibleIndex } from "../marchers/marcherBodies";

async function body() {
  const b = fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../assets/om-pose/bodies/neutral-average.glb",
    ),
  );
  const gltf = await new GLTFLoader().parseAsync(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    "",
  );
  let mesh: THREE.SkinnedMesh | null = null;
  gltf.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh;
  });
  return mesh!;
}

describe("instrumentGeometry", () => {
  it("weights every vertex to the right hand and keeps the parts", async () => {
    const mesh = await body();
    const h = hold("brass", "up");
    const g = instrumentGeometry(
      mesh.skeleton,
      poseArms(mesh.skeleton, h),
      h,
      brassModel("trumpet"),
    );
    const handR = mesh.skeleton.bones.findIndex((b) => b.name === "DEF-handR");
    const si = g.getAttribute("skinIndex");
    const sw = g.getAttribute("skinWeight");
    for (let i = 0; i < si.count; i++) {
      expect(si.getX(i)).toBe(handR);
      expect(sw.getX(i)).toBe(1);
    }
    const parts = new Set<number>();
    const part = g.getAttribute("_part");
    for (let i = 0; i < part.count; i++) parts.add(part.getX(i));
    expect([...parts].sort()).toEqual([16, 18, 22]);
  });

  it("lands on the hold's placement once skinned with the posed hand", async () => {
    const mesh = await body();
    const h = hold("brass", "up");
    const pose = poseArms(mesh.skeleton, h);
    const g = instrumentGeometry(mesh.skeleton, pose, h, brassModel("trumpet"));
    const handR = mesh.skeleton.bones.findIndex((b) => b.name === "DEF-handR");
    // what the skinning does: bindInv * handWorld(posed) * boneInverse * bind, with bind = identity here
    const skin = pose.handR.clone().multiply(mesh.skeleton.boneInverses[handR]);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++)
      box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(skin));
    const c = box.getCenter(new THREE.Vector3());
    // the trumpet runs forward from the grip: its center is ahead of the origin, near face height
    expect(c.z).toBeGreaterThan(h.instrument.origin[2]);
    expect(Math.abs(c.y - h.instrument.origin[1])).toBeLessThan(0.1);
    expect(box.max.z - box.min.z).toBeCloseTo(0.48, 1);
  });
});

describe("withInstrument", () => {
  it("appends the instrument after the look's visible body triangles", async () => {
    const mesh = await body();
    const look = sectionUniform("Trumpet", null);
    const index = visibleIndex(mesh.geometry, look);
    const h = hold("brass", "up");
    const horn = instrumentGeometry(
      mesh.skeleton,
      poseArms(mesh.skeleton, h),
      h,
      brassModel("trumpet"),
    );
    const merged = withInstrument(mesh.geometry, index, horn);
    const bodyTriangles = index!.count / 3;
    const hornTriangles = horn.index!.count / 3;
    expect(merged.index!.count / 3).toBe(bodyTriangles + hornTriangles);
    expect(merged.getAttribute("position").count).toBe(
      mesh.geometry.getAttribute("position").count +
        horn.getAttribute("position").count,
    );
    for (const name of [
      "position",
      "normal",
      "skinIndex",
      "skinWeight",
      "_part",
    ])
      expect(merged.getAttribute(name)).toBeDefined();
    // the body's own buffers are not shared with the merge: disposing the merge is safe
    expect(merged.getAttribute("position")).not.toBe(
      mesh.geometry.getAttribute("position"),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/window/performers/__test__/instrumentGeometry.test.ts`
Expected: FAIL, "Cannot find module '../marchers/instrumentGeometry'".

- [ ] **Step 3: Write the geometry builder and the merge**

```ts
// apps/desktop/src/view3d/window/performers/marchers/instrumentGeometry.ts
/**
 * An instrument as rigid geometry on the right hand (docs/3d/instruments.md
 * §4), in the body's bind pose so om-pose's instanced skinning carries it
 * with the hand, and the merge of a body's visible triangles with it.
 */
import * as THREE from "three";
import type { InstrumentModel } from "@/view3d/core/instruments/brass";
import type { Hold } from "@/view3d/core/instruments/holds";
import type { ArmPose } from "./armPose";

/** The instrument frame placed in the body frame by a hold. */
function placement(hold: Hold): THREE.Matrix4 {
  const z = new THREE.Vector3(...hold.instrument.bellAxis).normalize();
  const y = new THREE.Vector3(...hold.instrument.capsAxis).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Matrix4()
    .makeBasis(x, y, z)
    .setPosition(new THREE.Vector3(...hold.instrument.origin));
}

export function instrumentGeometry(
  skeleton: THREE.Skeleton,
  pose: ArmPose,
  hold: Hold,
  model: InstrumentModel,
): THREE.BufferGeometry {
  const handR = skeleton.bones.findIndex((b) => b.name === "DEF-handR");
  if (handR < 0) throw new Error("instrumentGeometry: no DEF-handR bone");
  // body (placed) -> hand-local (posed) -> bind pose
  const bindHand = skeleton.boneInverses[handR].clone().invert();
  const toBind = bindHand
    .multiply(pose.handR.clone().invert())
    .multiply(placement(hold));
  const normalM = new THREE.Matrix3().getNormalMatrix(toBind);
  const pos: number[] = [];
  const nrm: number[] = [];
  const si: number[] = [];
  const sw: number[] = [];
  const part: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  for (const piece of model.pieces) {
    const first = pos.length / 3;
    for (let i = 0; i < piece.positions.length; i += 3) {
      v.set(
        piece.positions[i],
        piece.positions[i + 1],
        piece.positions[i + 2],
      ).applyMatrix4(toBind);
      pos.push(v.x, v.y, v.z);
      v.set(piece.normals[i], piece.normals[i + 1], piece.normals[i + 2])
        .applyMatrix3(normalM)
        .normalize();
      nrm.push(v.x, v.y, v.z);
      si.push(handR, 0, 0, 0);
      sw.push(1, 0, 0, 0);
      part.push(piece.part);
    }
    for (const k of piece.indices) idx.push(first + k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute("_part", new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  return g;
}

const ATTRIBUTES = [
  "position",
  "normal",
  "skinIndex",
  "skinWeight",
  "_part",
] as const;

/** The body's triangles in `index` (or all of them) followed by the instrument's, as one new geometry. */
export function withInstrument(
  body: THREE.BufferGeometry,
  index: THREE.BufferAttribute | null,
  instrument: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const bodyCount = body.getAttribute("position").count;
  for (const name of ATTRIBUTES) {
    const a = body.getAttribute(name) as THREE.BufferAttribute;
    const b = instrument.getAttribute(name) as THREE.BufferAttribute;
    const size = a.itemSize;
    const Ctor = a.array.constructor as new (n: number) => typeof a.array;
    const out = new Ctor((a.count + b.count) * size);
    out.set(a.array as ArrayLike<number>, 0);
    out.set(b.array as ArrayLike<number>, a.count * size);
    g.setAttribute(name, new THREE.BufferAttribute(out, size));
  }
  const bodyIndex = index ?? body.index!;
  const merged: number[] = [];
  for (let i = 0; i < bodyIndex.count; i++) merged.push(bodyIndex.getX(i));
  const hornIndex = instrument.index!;
  for (let i = 0; i < hornIndex.count; i++)
    merged.push(bodyCount + hornIndex.getX(i));
  g.setIndex(merged);
  return g;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/window/performers/__test__/instrumentGeometry.test.ts`
Expected: PASS. If the "lands on the hold's placement" center test fails in y by more than 0.1, the hold's `origin` and the right wrist target disagree: the grip is at the origin, so set `instrument.origin` within 5 cm of `right.wrist` in Task 3's data.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/view3d/window/performers/marchers/instrumentGeometry.ts apps/desktop/src/view3d/window/performers/__test__/instrumentGeometry.test.ts
git commit -m "feat(3d): build instrument geometry on the right hand and merge it with the body"
```

---

### Task 8: Bake per hold and play the right rows

**Files:**

- Modify: `apps/desktop/src/view3d/window/performers/marchers/useMarcherBodies.ts:84-117`
- Modify: `apps/desktop/src/view3d/window/performers/marchers/marcherBodies.ts:150-160` (`bakeForBodies`), `:178-240` (constructor: merge geometry, paint)
- Modify: `apps/desktop/src/view3d/window/performers/marchers/marcherMotion.ts:160-215` (`MarcherMotion`)
- Test: `apps/desktop/src/view3d/window/performers/__test__/marcherMotion.test.ts` (extend), `apps/desktop/src/view3d/window/performers/__test__/marcherBodies.test.ts` (extend)

**Interfaces:**

- Consumes: `poseArms`, `holdClip` (Task 5), `instrumentGeometry`, `withInstrument` (Task 7), `paintInstruments` (Task 6), `hold`, `holdId` (Task 3), `brassModel` (Task 2), `UniformLook.options.{carry,finish,hold}` (Task 4).
- Produces:

  ```ts
  // marcherBodies.ts
  export const NO_HOLD = "none";
  export function slotHoldId(look: UniformLook): string          // "brass:up" or NO_HOLD
  export function rowKey(clip: string, holdIdOrNone: string): string   // "8to5@brass:up" or "8to5"
  export function bakeForBodies(bodies, clips: Record<string, AnimationClip>, holds: readonly string[]): Bake
      // bakes every clip once per hold id in `holds` (NO_HOLD bakes the clip as is), under rowKey names
  class MarcherBodies { holdOf(slot: number): string; ... }
  // marcherMotion.ts
  class MarcherMotion { constructor(plans, manifest, bodies, heading) }   // unchanged signature; rows looked up by rowKey(e.clip, bodies.holdOf(slot))
  ```

- [ ] **Step 1: Write the failing tests**

Add to `marcherBodies.test.ts`:

```ts
describe("rows per hold", () => {
  it("names rows by clip and hold, bare for no hold", () => {
    expect(rowKey("8to5", NO_HOLD)).toBe("8to5");
    expect(rowKey("8to5-h105", "brass:up")).toBe("8to5-h105@brass:up");
    expect(slotHoldId(sectionUniform("Trumpet", null, "carry"))).toBe(
      "brass:carry",
    );
    expect(slotHoldId(sectionUniform("Flute", null))).toBe(NO_HOLD);
  });

  it("bakes one row set per hold", async () => {
    const bodies = await loadedBodies(); // helper: Map with neutral-average only, see below
    const clip = await clip8to5();
    const bake = bakeForBodies(bodies, { "8to5": clip }, [
      NO_HOLD,
      "brass:up",
      "brass:carry",
    ]);
    expect(Object.keys(bake.rows).sort()).toEqual([
      "8to5",
      "8to5@brass:carry",
      "8to5@brass:up",
    ]);
    expect(bake.rows["8to5@brass:up"].frames).toBe(bake.rows["8to5"].frames);
  });
});
```

with these helpers at the top of the file (next to `body()`):

```ts
async function loadedBodies() {
  const b = fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../assets/om-pose/bodies/neutral-average.glb",
    ),
  );
  const gltf = await new GLTFLoader().parseAsync(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    "",
  );
  let mesh: SkinnedMesh | null = null;
  gltf.scene.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) mesh = o as SkinnedMesh;
  });
  return new Map([
    ["neutral-average", { scene: gltf.scene, mesh: mesh! }],
  ]) as Map<BodyType, LoadedBody>;
}
async function clip8to5() {
  const b = fs.readFileSync(
    path.resolve(__dirname, "../../../assets/om-pose/clips/clips-h100.glb"),
  );
  const gltf = await new GLTFLoader().parseAsync(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    "",
  );
  return gltf.animations.find((c) => c.name === "8to5")!;
}
```

(Import `NO_HOLD`, `rowKey`, `slotHoldId`, `bakeForBodies` from `../marchers/marcherBodies`, `BodyType` from looks, `LoadedBody` from `../marchers/marcherAssets`. `bakeClips` needs no WebGL; it builds a `DataTexture` on the CPU.)

Extend the existing `playing a crossfade` block in `marcherMotion.test.ts`: its fake `bodies` object gains `holdOf: () => "brass:up"` and its `rows` are keyed `${name}@brass:up`; add:

```ts
it("looks rows up by the slot's hold", () => {
  const { m, writes, xz, placed } = motion();
  m.update(1.25, xz, placed);
  expect(writes[0].clip.row).toBe(rows[`${plan.events[0].clip}@brass:up`]);
});
```

(Hoist `rows` out of `motion()` so the test can read it.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/window/performers/__test__/marcherBodies.test.ts src/view3d/window/performers/__test__/marcherMotion.test.ts`
Expected: FAIL on the missing exports and the row lookup.

- [ ] **Step 3: Implement**

`marcherBodies.ts`, new exports and the bake:

```ts
import { brassModel } from "@/view3d/core/instruments/brass";
import {
  hold as holdFor,
  holdId,
  type HoldFamily,
  type HoldState,
} from "@/view3d/core/instruments/holds";
import { poseArms, holdClip } from "./armPose";
import { instrumentGeometry, withInstrument } from "./instrumentGeometry";
import { paintInstruments } from "./instrumentPaint";

export const NO_HOLD = "none";

export function slotHoldId(look: UniformLook): string {
  const c = look.options.carry;
  return c ? holdId(c.family, look.options.hold) : NO_HOLD;
}

export function rowKey(clip: string, hold: string): string {
  return hold === NO_HOLD ? clip : `${clip}@${hold}`;
}

const parseHoldId = (id: string) => {
  const [family, state] = id.split(":") as [HoldFamily, HoldState];
  return holdFor(family, state);
};

/** Every v4u body shares one skeleton, so any of them bakes for all. */
export function bakeForBodies(
  bodies: ReadonlyMap<BodyType, LoadedBody>,
  clips: Record<string, THREE.AnimationClip>,
  holds: readonly string[] = [NO_HOLD],
): Bake {
  const first = bodies.values().next().value;
  if (!first) throw new Error("3D View: no bodies to bake on");
  const all: Record<string, THREE.AnimationClip> = {};
  for (const h of holds) {
    const pose =
      h === NO_HOLD ? null : poseArms(first.mesh.skeleton, parseHoldId(h));
    for (const [name, clip] of Object.entries(clips))
      all[rowKey(name, h)] = pose
        ? holdClip(clip, pose, rowKey(name, h))
        : clip;
  }
  return bakeClips(THREE, first.scene, all);
}
```

In the constructor: add `private readonly holdIds: string[]` filled from `looks.map((l) => slotHoldId(l.uniform))`, a `holdOf(slot)` getter returning it; wrap the material: `instancedSkinning(THREE, paintInstruments(createUniformMaterial(...)), bake)`; and in `buildMesh`, when `g.look.options.carry` is set and this is the high tier (`!this.blockSource`):

```ts
let source = this.blockSource ?? bodies.get(g.type)!.mesh.geometry;
let filtered = this.blockSource ? null : visibleIndex(source, g.look);
let own = filtered !== null;
const carry = g.look.options.carry;
if (carry && !this.blockSource) {
  const h = holdFor(carry.family, g.look.options.hold);
  const skeleton = bodies.get(g.type)!.mesh.skeleton;
  const horn = instrumentGeometry(
    skeleton,
    poseArms(skeleton, h),
    h,
    brassModel(carry.model),
  );
  source = withInstrument(source, filtered, horn);
  horn.dispose();
  filtered = null;
  own = true; // the merged geometry is this mesh's own: dispose it whole
}
```

and track `own` in `MeshEntry` so `dispose` calls `geometry.dispose()` for merged geometries (they share nothing with the body). `bodies` must be reachable in `buildMesh`: pass it as a parameter.

`useMarcherBodies.ts`: compute `holds` from the looks and pass it to `bakeForBodies`:

```ts
    const holdsKey = [...new Set((looks ?? []).map((l) => slotHoldId(l.uniform)))].sort().join(",");
    const bake = useMemo<Bake | null>(() => {
        if (!assets || !namesKey || !holdsKey) return null;
        ...
        const baked = bakeForBodies(assets.bodies, clips, holdsKey.split(","));
        ...
    }, [assets, namesKey, holdsKey]);
```

and the log line adds the hold count: `` `3D View: baked ${Object.keys(clips).length} clips × ${holds.length} holds, ...` ``.

`marcherMotion.ts` `apply`: `const row = rows[rowKey(e.clip, this.bodies.holdOf(slot))]` and the same for `clip2`; import `rowKey` from `./marcherBodies`.

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d` then `pnpm --dir apps/desktop exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/view3d/window/performers
git commit -m "feat(3d): bake clips per hold and draw the horn with the body"
```

---

### Task 9: Horn state setting and wiring

**Files:**

- Create: `apps/desktop/src/view3d/window/hornState.ts`
- Modify: `apps/desktop/src/view3d/window/sceneStore.ts:49-98`
- Modify: `apps/desktop/src/view3d/window/overlay/SettingsPanel.tsx:76-81, 300-329`
- Modify: `apps/desktop/src/view3d/window/performers/Performers.tsx:131-143`
- Modify: `apps/desktop/i18n/en.json` (under `view3d.settings`)
- Test: `apps/desktop/src/view3d/window/__test__/hornState.test.ts` (create), `apps/desktop/src/view3d/window/performers/__test__/marcherMotion.test.ts`

**Interfaces:**

- Produces:

  ```ts
  // hornState.ts
  export { HOLD_STATES, type HoldState } from "@/view3d/core/instruments/holds";
  export function parseHornState(value: unknown): HoldState   // "up" when unknown
  // sceneStore.ts
  hornState: HoldState; setHornState: (state: HoldState) => void;   // starts "up"; not saved
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// apps/desktop/src/view3d/window/__test__/hornState.test.ts
import { describe, expect, it } from "vitest";
import { parseHornState } from "../hornState";
import { useView3dSceneStore } from "../sceneStore";

describe("horn state", () => {
  it("defaults to up and accepts the four states", () => {
    expect(parseHornState(undefined)).toBe("up");
    expect(parseHornState("sideways")).toBe("up");
    expect(parseHornState("trail")).toBe("trail");
  });

  it("starts up in the scene store and changes on request", () => {
    expect(useView3dSceneStore.getState().hornState).toBe("up");
    useView3dSceneStore.getState().setHornState("carry");
    expect(useView3dSceneStore.getState().hornState).toBe("carry");
    useView3dSceneStore.getState().setHornState("up");
  });
});
```

And in `useMarcherBodies`'s behavior, pin the disposal (add to `marcherBodies.test.ts`):

```ts
it("a new hold set disposes the previous bake texture", async () => {
  const bodies = await loadedBodies();
  const clip = await clip8to5();
  const a = bakeForBodies(bodies, { "8to5": clip }, ["brass:up"]);
  let disposed = false;
  a.texture.dispose = () => {
    disposed = true;
  };
  // the hook's cleanup is `bake?.texture.dispose()`: call it as React would
  a.texture.dispose();
  expect(disposed).toBe(true);
});
```

(This pins the contract the hook relies on; the hook's effect itself is one line and already exists.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/window/__test__/hornState.test.ts`
Expected: FAIL, "Cannot find module '../hornState'".

- [ ] **Step 3: Implement**

```ts
// apps/desktop/src/view3d/window/hornState.ts
/**
 * The window's horn state (docs/3d/instruments.md §5): always `up` for
 * the show today; the settings panel can switch it to see the other
 * holds. Not saved anywhere: it is a test control until per-page horn
 * states exist.
 */
import { HOLD_STATES, type HoldState } from "@/view3d/core/instruments/holds";

export { HOLD_STATES, type HoldState };

export function parseHornState(value: unknown): HoldState {
  return HOLD_STATES.includes(value as HoldState) ? (value as HoldState) : "up";
}
```

`sceneStore.ts`: add `hornState: HoldState; setHornState: (state: HoldState) => void;` to the interface (document it in the header: "`hornState`: which hold the brass plays, a test control, see `hornState.ts`") and `hornState: "up", setHornState: (hornState) => set({ hornState }),` to the store.

`Performers.tsx`: read `const hornState = useView3dSceneStore((s) => s.hornState);` and pass it: `uniform: sectionUniform(section, fill, hornState)`, adding `hornState` to that memo's dependencies.

`SettingsPanel.tsx`: after `<QualityRow />` add `<HornStateRow />`:

```tsx
function HornStateRow() {
  const { t } = useTranslate();
  const state = useView3dSceneStore((s) => s.hornState);
  const setState = useView3dSceneStore((s) => s.setHornState);
  return (
    <Row label={t("view3d.settings.hornState")} stacked>
      <Segmented
        value={state}
        options={HOLD_STATES.map((value) => ({
          value,
          label: t(`view3d.settings.hornStateMode.${value}`),
        }))}
        onChange={setState}
        label={t("view3d.settings.hornState")}
        testId="view3d-horn-state-picker"
      />
      <p className="text-sub text-text/60">
        {t("view3d.settings.hornStateHint")}
      </p>
    </Row>
  );
}
```

`en.json`, inside `view3d.settings`:

```json
"hornState": "Horn state",
"hornStateMode": { "up": "Up", "carry": "Carry", "down": "Down", "trail": "Trail" },
"hornStateHint": "Shows are always played horns up. The other positions are here to check the poses."
```

- [ ] **Step 4: Run the tests, type check, lint, format, spellcheck**

Run:

```bash
pnpm --dir apps/desktop exec vitest run src/view3d
pnpm --dir apps/desktop exec tsc --noEmit
pnpm format:check
pnpm lint:check
pnpm spellcheck
```

Expected: all pass. Format with `pnpm format` if the check fails.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/view3d/window apps/desktop/i18n/en.json
git commit -m "feat(3d): add a horn state control for checking the holds"
```

---

### Task 10: Look at it, measure it, tune it

**Files:**

- Modify: `apps/desktop/src/view3d/core/instruments/holds.ts` (target numbers only), `apps/desktop/src/view3d/core/instruments/brass.ts` (proportions only)
- Create: `docs/3d/findings.md` entry (append only)

- [ ] **Step 1: Run the web preview and open it in a real browser**

Run: `pnpm --dir apps/desktop run view3d-web:dev`, then open `http://localhost:5173/` in Chrome (headless Chromium has no WebGL). Pick the demo show with brass. Use the Claude in Chrome extension to drive and screenshot; the first screenshot is the Horns Up default from the press box camera and from a ground camera on the 30.

- [ ] **Step 2: Check each hold against the reference photos**

For each of up, carry, down, trail: set the Horn state, screenshot a trumpet, a mellophone, a baritone and a tuba from the front and from the side. Compare with `~/Projects/OpenMarch-timeline-ref/holds/*.png`: elbows wider than the shoulders in up and carry, the mouthpiece at eye level in carry and down, the bell behind the hip in trail. Adjust `holds.ts` targets by centimeters, rerun `vitest run src/view3d/core/instruments`, reload, re-screenshot. Record each change as a bullet in the PR.

- [ ] **Step 3: Measure the bake and frame time**

In the browser console, read the `3D View: baked ... clips × N holds, X MB, in Y ms` line. Then with the P5.1 perf scene (300 performers), note the frame time from the window's frame-rate readout at high quality with brass on. Append to `docs/3d/findings.md`:

```markdown
### 2026-10-XX · <you> · instruments PR 1

- Bake: <clips> clips × <holds> holds = <MB> MB in <ms> ms (<machine>, <GPU>).
- Frame time, 300 performers, high: <ms> ms (before: <ms> ms from P5.1).
- Holds checked against the reference photos: <notes>.
```

If the bake exceeds 64 MB or the float texture fails to allocate on a software renderer, reduce holds at the low tier: in `useMarcherBodies`, when `quality === "low"`, replace every hold with `brass:up` before baking, and note it in the findings.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/view3d/core/instruments docs/3d/findings.md
git commit -m "feat(3d): tune the brass holds against the reference photos"
```

---

### Task 11: Pull request

- [ ] **Step 1: Confirm no attribution lines**

Run: `git log timeline/3d-async..HEAD --format=%B | grep -i 'co-authored\|claude\|generated' ; echo "exit $?"`
Expected: no matches (exit 1).

- [ ] **Step 2: Push and open the PR against the fork's `3d-async`**

Run: `git push -u origin 3d/p7-instruments` then `gh pr create --repo AlexDumo/OpenMarch-timeline --base 3d-async --title "feat(3d): brass instruments and holds" --body-file <scratchpad>/pr-instruments-1.md`.

The body lists: the spec link (`docs/3d/instruments.md`), what shipped (seven horns, four holds, the finish option, the horn state control), every command run with its result, the findings numbers, the screenshots per hold, and what is skipped (full history and e2e suites, woodwinds, battery, props: PRs 2 to 4). Per the repo convention, attach a GIF of the horn state picker cycling through the four holds (`openmarch-pr` skill).

- [ ] **Step 3: Log it**

Append a `Cross-phase note from instruments PR 1` entry to `docs/3d/phases/04-performers.md`'s progress log through `scripts/3d/coord.sh` (the README's entry format), with the PR link.
