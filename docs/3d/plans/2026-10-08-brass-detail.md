# Brass Detail and Material Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

<!-- cspell:words metalness PMREM lathed -->

**Goal:** Brass horns read as real lacquered brass: smooth metallic shading with reflections, wraps traced from reference photos at 8k to 12k triangles, and a contra that matches the marching tuba.

**Architecture:** `core/instruments/mesh.ts` gains smooth primitives (shared ring vertices, per-vertex normals, per-vertex color). `brass.ts` is rewritten with a `detail` level. Instruments leave the uniform shader: `MarcherBodies` draws each carrying group's horn as a second `InstancedMesh` with a metallic vertex-colored `MeshStandardMaterial` under the same `instancedSkinning` bake. The scene gets a PMREM environment map from the sky gradient (`core/environment/envMap.ts`, applied in `Scene.tsx`). `instrumentPaint.ts` and the body-merge path are removed.

**Tech Stack:** three r186 (PMREMGenerator, InstancedMesh, vertex colors), om-pose vendored renderer, Vitest.

**Spec:** `docs/3d/instruments.md` §3 (Tuba row), §4 (Material, Triangle budget), §5 (contra hold).

## Global Constraints

- Same as `2026-10-08-brass-and-holds.md`: no AI attribution; focused tests only; `core/` never imports React, R3F, drei, Electron or the database (three is allowed under `core/environment`, as `sky.ts` already does); vendored om-pose files read-only; nothing from Yamaha ships; Prettier, lint, cspell clean.
- Budget: 8,000 to 12,000 triangles per horn at `high`, 1,500 to 3,500 at `low`.
- Horn state is `up`, `carry`, `trail`.

## Review Focus

1. A brass group at low quality still draws its horn (now as the second mesh over the block body): Task 3's test builds a low set and expects two meshes for the group.
2. Switching looks or holds disposes both meshes of a group and the horn geometry: Task 3's test spies `dispose` on both.
3. The environment map follows the lighting preset and is disposed on change: Task 4's test checks the scene builder's colors per preset; the Scene effect is reviewed by eye.
4. Non-brass groups get no second mesh and no draw-call increase: Task 3's test counts `drawCalls` for a Flute-only set.
5. The contra's bell is forward, not overhead, in every hold: Task 2's bounds test pins the bell at +Z and the body behind it.

---

### Task 1: Smooth primitives with vertex colors

**Files:** modify `core/instruments/mesh.ts`; test `core/instruments/__test__/mesh.test.ts`.

**Produces:**

```ts
export interface Piece {
  part: number;
  positions: number[];
  normals: number[];
  indices: number[];
  /** optional per-vertex sRGB hex, one per vertex */ colors?: number[];
}
export function smoothTube(
  path: Vec3[],
  radii: number | number[],
  segments: number,
  part: number,
  opts?: { capStart?: boolean; capEnd?: boolean },
): Piece; // shared ring vertices, radial normals, radius per path point (conical bore)
export function smoothLathe(
  profile: [r: number, y: number][],
  segments: number,
  part: number,
): Piece; // normals from the profile slope
export function arc(
  center: Vec3,
  radius: number,
  fromDeg: number,
  toDeg: number,
  steps: number,
  axis: "x" | "y" | "z",
): Vec3[]; // points on a circle in the plane normal to `axis`
export function bellProfile(
  throat: number,
  rim: number,
  length: number,
  steps?: number,
): [number, number][]; // Bessel-like flare, rim bead included
export function colorPieces(
  pieces: Piece[],
  colorOfPart: (part: number) => number,
): Piece[]; // fills `colors`
```

Tests: `smoothTube` on a 3-point path with 16 segments has 3 × 16 (+2 cap centers) vertices and 2 × 16 × 2 (+ caps) triangles; every normal is unit and, on a straight tube, perpendicular to the axis; radii array makes the far ring larger. `smoothLathe` of a cylinder profile has outward normals. `arc` from 0 to 90 degrees about "x" starts at +Y and ends at +Z (or the documented convention). `bellProfile` is monotonic and ends at `rim`. `colorPieces` writes 3 numbers per vertex.

Steps: write tests → fail → implement → pass → commit `feat(3d): smooth tube and lathe primitives with vertex colors`.

### Task 2: Brass models traced from the references

**Files:** rewrite `core/instruments/brass.ts`; test `core/instruments/__test__/brass.test.ts`.

**Produces:**

```ts
export type Detail = "high" | "low";
export function brassModel(id: BrassModelId, detail?: Detail): InstrumentModel; // default "high"
export const BRASS_DIMENSIONS; // unchanged keys; contra becomes { length: 0.95, bell: 0.5, bore: 0.0185, height: 0.4 }
```

Each model is a list of tubing runs (path + bore radii), valve casings (casing, cap, stem, button), slides with crooks, braces (thin tubes between runs), water keys (small lever + cup), finger hook, bell (`bellProfile` lathe along +Z with rim bead), mouthpiece (cup + shank). Segment counts come from `detail`: high uses 24 for tubing and 48 for bells; low uses 8 and 16. Wraps follow the photos in `~/Projects/OpenMarch-timeline-ref/yamaha/`: trumpet and mellophone as the YMP-204M layout (leadpipe to valves, three slides, bell forward), baritone and euphonium as the YBH-301M / YEP-202M layout (two stacked bows behind the valves, bell forward and up), trombone unchanged in layout, contra as the YBB-202M layout: a horizontal loop 0.95 long and 0.40 tall lying along −Z behind the bell, valves at the rear bottom, mouthpiece at the rear.

Tests: triangle budget per detail; length and bell per model within 0.05; the contra's bounds extend behind the grip (min z < −0.5) and its bell is the max-z part at +Z; parts are only 16, 18, 22; every piece of the high model has `colors`.

Steps: tests → fail → implement → pass → commit `feat(3d): trace the brass horns from the reference photos`.

### Task 3: The horn as its own metallic instanced mesh

**Files:** modify `window/performers/marchers/marcherBodies.ts`, `instrumentGeometry.ts`; delete `instrumentPaint.ts` and its test; drop the README note; modify `__test__/marcherBodies.test.ts`, `__test__/instrumentGeometry.test.ts`.

**Produces:**

```ts
// instrumentGeometry.ts
export function instrumentGeometry(skeleton, pose, hold, model): THREE.BufferGeometry   // now also a `color` attribute (Float32, linear) from piece colors
export function instrumentMaterial(bake: Bake): THREE.MeshStandardMaterial   // metalness 1, roughness 0.25, vertexColors, flatShading false, wrapped by instancedSkinning
// marcherBodies.ts
interface MeshEntry { mesh; horn: THREE.InstancedMesh | null; slots; own }
class MarcherBodies { get drawCalls(): number  // counts horns too
                      setClip(slot, clip)      // writes both meshes
                      writeFrame(...)          // places both }
```

`withInstrument` and the merge path are removed; the body mesh is built as before the first pass (part-filtered index at high, block at low). For a carrying group the horn geometry (built at the look's finish: gold 0xd9ad4f, silver 0xd4d8de, chrome 0xd9dde2, black 0x141416 by part) becomes `instancedGeometry(THREE, horn, n)` on an `InstancedMesh` with the shared instrument material, added to the group and listed in the entry.

Tests: a Trumpet + Flute set at high has 3 meshes named `view3d-marchers-*` plus `view3d-horn-*` entries: `drawCalls` is 3 for Trumpet+Flute and 1 for Flute alone; the horn mesh geometry has a `color` attribute; `setClip` on the trumpet slot writes identical `aClip` into body and horn; at low the group still has a horn; `dispose` disposes the horn geometry's own buffers (spy on `geometry.dispose`) and the material once.

Steps: tests → fail → implement → pass → run the whole `src/view3d` suite → commit `feat(3d): draw horns as metallic instanced meshes`.

### Task 4: Environment map from the sky

**Files:** create `core/environment/envMap.ts`; modify `window/Scene.tsx`; test `core/environment/__test__/envMap.test.ts`.

**Produces:**

```ts
export function environmentScene(preset: LightingPreset): THREE.Scene; // a sky sphere with the preset's gradient and a ground disc in a turf green, both unlit (MeshBasicMaterial / the sky shader)
export function createEnvironmentMap(
  renderer: THREE.WebGLRenderer,
  preset: LightingPreset,
): THREE.Texture; // PMREMGenerator.fromScene(environmentScene(preset)).texture; caller disposes
```

`Scene.tsx`: in the environment effect (or its own effect keyed on `gl`, `lighting`), set `scene.environment = createEnvironmentMap(gl, lighting ?? "day")` with `scene.environmentIntensity = 0.6`, and dispose the previous texture and clear `scene.environment` on cleanup. Skip when `gl` has no WebGL2 (`gl.capabilities.isWebGL2 === false`).

Tests (node, no renderer): `environmentScene("day")` contains a sky mesh with the day preset's top and bottom colors in its uniforms and a ground mesh below y 0; "night" uses the night colors.

Steps: tests → fail → implement → pass → commit `feat(3d): give the scene an environment map from the sky`.

### Task 5: Contra hold and spec

**Files:** modify `core/instruments/holds.ts` (CONTRA_UP: right hand at the valves by the right chest, left hand under the bottom bow in front of the chest; instrument origin at the right hand, bell axis +Z, caps +Y), `__test__/holds.test.ts`.

Tests: contra up: `instrument.bellAxis` is `[0, 0, 1]`, origin z within 0.1 to 0.3, origin y 1.2 to 1.45; the reach test still passes.

Commit `feat(3d): hold the contra on the shoulder with the bell forward`.

### Task 6: Measure and log

Append to `docs/3d/findings.md`: triangle counts per model at both details, bake unchanged, and the number of draw calls for a brass-only group; leave frame time for the owner. Run `pnpm format:check`, `pnpm spellcheck`, `eslint` on `src/view3d`, `tsc --noEmit`, `vitest run src/view3d`. Commit `docs(3d): log the detailed brass counts`. Push.
