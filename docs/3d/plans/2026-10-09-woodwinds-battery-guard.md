# Woodwinds, Battery and Guard Equipment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

<!-- cspell:words sabre sabres spocks piccolos ligature lathed uPath tris -->

**Goal:** Every woodwind, battery and guard section in the 3D View carries its real equipment: traced procedural models in the right materials, held the way the section holds them, with bass drums in their five sizes and guard flags in the section's color.

**Architecture:** Same pipeline as brass (`docs/3d/instruments.md` §4): pure models in `core/instruments/` built from `mesh.ts` primitives, each piece riding a bone of the v4 skeleton, colored per vertex; holds as arm targets in `holds.ts` (already present for every family); the window attaches the model to the posed hand or the chest and draws it as a metallic, vertex-colored instanced mesh. The three model files exist as stubs returning empty models, the dispatcher in `core/instruments/index.ts` already routes ids to them, the catalog already maps every section, and the geometry builder already colors `PART_SHELL` and `PART_SILK` with the section color. The tasks fill the stubs, assign bass drum sizes, and verify in the real renderer.

**Tech Stack:** TypeScript, Vitest (node environment for three), three r186 for the window side only, Playwright + Electron for renders.

**Spec:** `docs/3d/instruments.md` §3 (section tables), §4 (material), §5 (holds). Reference photos are outside the repo in `~/Projects/OpenMarch-timeline-ref/yamaha/` (Yamaha product shots: flute, piccolo, clarinet, bass clarinet, alto/tenor/bari sax, marching snare, tenors) and `~/Projects/OpenMarch-timeline-ref/holds/`. Read the brass model in `core/instruments/brass.ts` first: its `tools()` builders (smooth tubes with conical bores, bells, valves, slides, braces, mouthpiece) and its tests are the pattern to copy.

## Global Constraints

- Root `AGENTS.md`: no AI attribution in commits or files; commits describe the change.
- `docs/3d/WORKER.md` policy: focused tests only (`pnpm --dir apps/desktop exec vitest run src/view3d`), plus `pnpm --dir apps/desktop exec tsc --noEmit`; never the history or e2e suites. Commits run lint-staged (prettier, cspell): add words to `cspell.config.yaml` or an inline `cspell:words` comment when the hook rejects one.
- ADR 0002 D-1: nothing under `src/view3d/core/` imports three, React, drei, Electron or the database. Models are pure functions of numbers.
- Spec §2: nothing from Yamaha ships. No logos, model numbers or brand names in code, strings or assets. Proportions only.
- Triangle budgets per model: high 4,000 to 12,000; low 1,000 to 3,500 (`triangleCount` from `mesh.ts`). Budgets are pinned by each file's tests.
- Instrument frame convention (see `brass.ts` header and `holds.ts`): origin at the right hand's grip, +Z along the instrument's main axis toward its far end (the "bell"), +Y the "caps" direction the hold names, +X the performer's left. The hold tables in `holds.ts` already define each family's `instrument.origin`, `bellAxis` and `capsAxis`; models must agree with them (see each task).
- Part ids (`mesh.ts`): 16 metal in the section's finish (gold or silver lacquer), 18 chrome, 19 drum shell (section color), 20 drum head, 22 black hardware, 23 wood, 24 flag silk (section color). `colorPieces(pieces, part => hex)` writes per-vertex colors; the window recolors 16, 19 and 24 at build time, so give them any placeholder color.
- Per-piece bones: `Piece.bone` may be `"handR"`, `"handL"` or `"spine002"`; the model's `bone` is the default (right hand). Drums ride the chest (`spine002`); sticks, mallets and cymbals ride each hand.
- Every new or changed public function gets a test that was watched failing first (superpowers:test-driven-development).

## Review Focus

1. A Bass Drum section of one marcher must get a middle size, not crash on a division by zero: Task 4's spread test pins n = 1.
2. A model asked for at low detail must stay under 3,500 triangles even for the tenors (six drums) and the double swing flag (two silks): Tasks 2 and 3 pin low budgets per id.
3. The flag silk must be visible from both sides: the window material is already double-sided; Task 3's test checks the silk piece has outward normals on one face only and more than two triangles, so it isn't a zero-area line.
4. A piece whose bone is the left hand must land on the left hand after posing: Task 2's cymbals test checks the left disc's vertices are weighted to `DEF-handL` through `instrumentGeometry`.
5. Section color must not leak into chrome or heads: Task 2's test checks head and hoop vertices keep their own colors when the geometry is built with a red section color.

---

## File map

Create: none (stubs exist). Modify:

- `apps/desktop/src/view3d/core/instruments/woodwinds.ts` (Task 1) and `__test__/woodwinds.test.ts`
- `apps/desktop/src/view3d/core/instruments/battery.ts` (Task 2) and `__test__/battery.test.ts`
- `apps/desktop/src/view3d/core/instruments/guard.ts` (Task 3) and `__test__/guard.test.ts`
- `apps/desktop/src/view3d/core/marchers/looks.ts`, `apps/desktop/src/view3d/window/performers/Performers.tsx` (Task 4: bass sizes)
- `docs/3d/instruments.md`, `docs/3d/findings.md` (Task 5)

---

### Task 1: Woodwind models

**Files:**

- Modify: `apps/desktop/src/view3d/core/instruments/woodwinds.ts` (replace the stub body; keep the signature)
- Create: `apps/desktop/src/view3d/core/instruments/__test__/woodwinds.test.ts`

**Interfaces:**

- Consumes: `smoothTube`, `smoothLathe`, `arc`, `uPath`, `cylinder`, `transformPiece`, `colorPieces`, `bounds`, `triangleCount`, `PART_*` from `./mesh`; `Detail`, `InstrumentModel`, `ModelOptions`, `WoodwindModelId` from `./model`.
- Produces: `woodwindModel(id, detail, options): InstrumentModel` for `piccolo`, `flute`, `clarinet`, `bassClarinet`, `sopranoSax`, `altoSax`, `tenorSax`, `bariSax`, and `export const WOODWIND_DIMENSIONS: Record<WoodwindModelId, { length: number; bore: number; bell: number }>`.

**Frames** (must match `holds.ts`): flute and piccolo: origin at the embouchure (the lips), +Z along the tube toward the foot joint, +Y toward the keys. Clarinet, bass clarinet, soprano sax: origin at the mouthpiece tip, +Z down the body toward the bell, +Y toward the keys (the front). Alto, tenor, bari sax: origin at the mouthpiece tip, +Z down the neck and body toward the bow; the bell then turns back up along −Z, offset toward +X; +Y toward the keys. The right hand is at the origin for every woodwind (the hold places it); `leftGrip` is the left hand's point on the body, `mouthpiece` is `[0, 0, 0]`.

**Dimensions (meters):** piccolo length 0.32 bore 0.0075; flute 0.67, tube radius 0.0095, 16 key cups of radius 0.008 along the top; clarinet 0.66, body radius 0.017 widening to a bell of 0.035 rim over the last 0.08, black body (PART_BLACK) with chrome keys, rings and a chrome bell ring; bass clarinet 1.0 with a curved chrome neck at the top (an `arc` of radius 0.05) and a chrome upturned bell (`arc` of radius 0.06 then a flare to 0.09 rim); soprano sax 0.65 straight conical brass (radius 0.012 to 0.03, rim 0.045) with chrome keys and a black mouthpiece; alto sax: neck 0.2 (arc radius 0.08, chrome? no: lacquer), body 0.45 conical radius 0.02 to 0.045, bow (`uPath`-like turn of width 0.11 at the bottom), bell up 0.3 flaring to 0.12 rim; tenor: body 0.55, bell 0.14, neck longer with an S; bari: body 0.6, bell 0.19, with the upper loop (an `arc` of radius 0.07 above the body) before the neck. Key work: cups as short `cylinder`s of radius 0.011 to 0.016 and 0.004 height along the body's +Y side, 12 to 20 per instrument; a few rods as thin tubes. Pads under cups: a black disc (PART_BLACK) is optional at high detail.

**Colors:** `colorPieces` with metal 0xd9ad4f, chrome 0xd9dde2, black 0x141416, wood 0x5b3a1a.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/desktop/src/view3d/core/instruments/__test__/woodwinds.test.ts
import { describe, expect, it } from "vitest";
import { bounds, triangleCount } from "../mesh";
import { WOODWIND_DIMENSIONS, woodwindModel } from "../woodwinds";
import type { WoodwindModelId } from "../model";

const IDS: WoodwindModelId[] = [
  "piccolo",
  "flute",
  "clarinet",
  "bassClarinet",
  "sopranoSax",
  "altoSax",
  "tenorSax",
  "bariSax",
];

describe("woodwind models", () => {
  it.each(IDS)("%s stays within the triangle budgets", (id) => {
    const high = triangleCount(woodwindModel(id, "high").pieces);
    const low = triangleCount(woodwindModel(id, "low").pieces);
    expect(high).toBeGreaterThanOrEqual(4000);
    expect(high).toBeLessThanOrEqual(12000);
    expect(low).toBeGreaterThanOrEqual(1000);
    expect(low).toBeLessThanOrEqual(3500);
  });

  it.each(IDS)("%s runs along +Z from the mouthpiece at the origin", (id) => {
    const m = woodwindModel(id);
    expect(m.mouthpiece).toEqual([0, 0, 0]);
    const b = bounds(m.pieces);
    expect(b.min[2]).toBeGreaterThan(-0.08); // nothing behind the lips but the mouthpiece
    expect(Math.abs(b.max[2] - WOODWIND_DIMENSIONS[id].length)).toBeLessThan(
      0.08,
    );
  });

  it("gives the flute and piccolo chrome bodies and the saxes lacquered ones", () => {
    const parts = (id: WoodwindModelId) =>
      new Set(woodwindModel(id).pieces.map((p) => p.part));
    expect(parts("flute").has(16)).toBe(false);
    expect(parts("flute").has(18)).toBe(true);
    expect(parts("altoSax").has(16)).toBe(true);
    expect(parts("clarinet").has(22)).toBe(true); // the black body
  });

  it("turns the sax bells back up past the bow", () => {
    for (const id of ["altoSax", "tenorSax", "bariSax"] as const) {
      const m = woodwindModel(id);
      // the widest ring is the bell rim and it sits well above the bow (smaller z than the max)
      const widest = m.pieces.reduce(
        (best, p) => {
          const b = bounds([p]);
          return b.max[0] - b.min[0] > best.w
            ? { w: b.max[0] - b.min[0], z: (b.max[2] + b.min[2]) / 2 }
            : best;
        },
        { w: 0, z: 0 },
      );
      expect(widest.w).toBeCloseTo(WOODWIND_DIMENSIONS[id].bell, 1);
      expect(widest.z).toBeLessThan(bounds(m.pieces).max[2] - 0.15);
    }
  });

  it("colors every vertex and uses only instrument part ids", () => {
    for (const id of IDS)
      for (const p of woodwindModel(id, "high").pieces) {
        expect([16, 18, 22, 23]).toContain(p.part);
        expect(p.colors?.length).toBe(p.positions.length);
      }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core/instruments/__test__/woodwinds.test.ts`
Expected: FAIL (the stub returns no pieces, so budgets and bounds fail).

- [ ] **Step 3: Implement the models** in `woodwinds.ts`, following `brass.ts`: a `tools(segments)` closure with the builders you need, one function per instrument family (`flute(id)`, `clarinet(id)`, `sax(id)`), `WOODWIND_DIMENSIONS`, and `woodwindModel` dispatching on id. Segment counts: high tube 24 / keys 12, low tube 8 / keys 5. Keep each function under 80 lines where practical (the repo lints `max-lines-per-function` as a warning).

- [ ] **Step 4: Run the tests and tune until they pass**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core/instruments`
Expected: PASS. Adjust segment counts for budgets and the length constants for bounds; never the tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/view3d/core/instruments/woodwinds.ts apps/desktop/src/view3d/core/instruments/__test__/woodwinds.test.ts
git commit -m "feat(3d): model the woodwinds"
```

---

### Task 2: Battery models

**Files:**

- Modify: `apps/desktop/src/view3d/core/instruments/battery.ts` (replace the stub body; keep the signature)
- Create: `apps/desktop/src/view3d/core/instruments/__test__/battery.test.ts`

**Interfaces:**

- Produces: `batteryModel(id, detail, options): InstrumentModel` for `snare`, `tenors`, `bass`, `cymbals`; `export const BASS_SIZES_IN = [18, 20, 22, 24, 26, 28, 30, 32] as const`; `export function bassSizesFor(count: number): number[]` (Task 4 uses it: `count` drums get sizes spread evenly over `BASS_SIZES_IN`, smallest first; count 1 gives [26]; count 5 gives [18, 22, 26, 28, 32]).

**Frames** (must match `holds.ts`): snare and tenors: `bone: "spine002"`, origin at the drum's top center, +Z = the head's normal (up), +Y = forward (toward the audience); the shell hangs along −Z. Tenors: the four drums 10, 12, 13, 14 inches (0.254, 0.305, 0.330, 0.356 m) in an arc from the player's right to left, 0.2 m deep, plus two 6 and 8 inch spocks (0.152, 0.203) in front, on a carrier frame of chrome tubes. Bass: `bone: "spine002"`, origin at the drum's center, +Z = the heads' axis pointing to the performer's left (+X in the hold), diameter `options.bassInches ?? 26` × 0.0254, depth 14 in (0.356); the shell is a `smoothLathe` cylinder of PART_SHELL with chrome hoops (rings of PART_CHROME built with `smoothTube` on an `arc` of 360 degrees), 10 lugs, two heads (PART_HEAD discs: `smoothLathe` with a profile from radius 0 to the rim). Cymbals: two 18 inch (0.457) plates, pieces with `bone: "handL"` and `bone: "handR"`, each a `smoothLathe` disc with a bell dome of radius 0.06 and height 0.03 at the center, PART_METAL, plates vertical facing each other: the right plate centered at `[0, 0, 0]` in the frame with its normal along +X, the left plate at `[0.4, 0, 0]` facing −X (the hold puts the hands 0.4 m apart). Sticks: snare and tenors get a stick in each hand: `bone: "handR"` / `"handL"`, a `smoothTube` of radius 0.008 and length 0.41 along the hand's fingers (the instrument frame's hand point is the grip; make the stick run from `[0, 0, 0]` toward +Z for the right hand and the mirror for the left), PART_WOOD. Bass gets two mallets: radius 0.012 shaft, 0.38 long, with a head sphere (a `smoothLathe` profile) of radius 0.045, PART_WOOD shaft and PART_BLACK head.

**Dimensions:** snare 14 in × 12 in (0.356 dia, 0.305 deep), 10 lugs, two chrome hoops 0.012 tall, a carrier plate (PART_BLACK box: a `cylinder` of radius 0.12 and height 0.02 under the shell where it meets the chest) and two chrome carrier bars down to it. Heads: PART_HEAD color 0xe9e6dc. Shell placeholder color 0xffffff (the window recolors it).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/desktop/src/view3d/core/instruments/__test__/battery.test.ts
import { describe, expect, it } from "vitest";
import {
  bounds,
  triangleCount,
  PART_HEAD,
  PART_SHELL,
  PART_WOOD,
  PART_METAL,
} from "../mesh";
import { BASS_SIZES_IN, bassSizesFor, batteryModel } from "../battery";
import type { BatteryModelId } from "../model";

const IDS: BatteryModelId[] = ["snare", "tenors", "bass", "cymbals"];

describe("battery models", () => {
  it.each(IDS)("%s stays within the triangle budgets", (id) => {
    const high = triangleCount(batteryModel(id, "high").pieces);
    const low = triangleCount(batteryModel(id, "low").pieces);
    expect(high).toBeGreaterThanOrEqual(4000);
    expect(high).toBeLessThanOrEqual(12000);
    expect(low).toBeGreaterThanOrEqual(1000);
    expect(low).toBeLessThanOrEqual(3500);
  });

  it("builds the snare 14 by 12 on the chest with a stick in each hand", () => {
    const m = batteryModel("snare");
    expect(m.bone).toBe("spine002");
    const shell = m.pieces.filter((p) => p.part === PART_SHELL && !p.bone);
    const b = bounds(shell);
    expect(b.max[0] - b.min[0]).toBeCloseTo(0.356, 1);
    expect(b.max[2] - b.min[2]).toBeCloseTo(0.305, 1);
    expect(
      m.pieces.some((p) => p.part === PART_WOOD && p.bone === "handR"),
    ).toBe(true);
    expect(
      m.pieces.some((p) => p.part === PART_WOOD && p.bone === "handL"),
    ).toBe(true);
    expect(m.pieces.some((p) => p.part === PART_HEAD)).toBe(true);
  });

  it("sizes the bass drum from its options", () => {
    for (const inches of [18, 26, 32]) {
      const m = batteryModel("bass", "high", { bassInches: inches });
      const shell = m.pieces.filter((p) => p.part === PART_SHELL);
      const b = bounds(shell);
      // the heads' axis is +Z: the diameter spans x and y
      expect(b.max[0] - b.min[0]).toBeCloseTo(inches * 0.0254, 1);
      expect(b.max[2] - b.min[2]).toBeCloseTo(0.356, 1);
      expect(m.options?.bassInches).toBe(inches);
    }
  });

  it("spreads bass sizes evenly, smallest first", () => {
    expect(BASS_SIZES_IN).toEqual([18, 20, 22, 24, 26, 28, 30, 32]);
    expect(bassSizesFor(1)).toEqual([26]);
    expect(bassSizesFor(2)).toEqual([18, 32]);
    expect(bassSizesFor(5)).toEqual([18, 22, 26, 28, 32]);
    expect(bassSizesFor(8)).toEqual([18, 20, 22, 24, 26, 28, 30, 32]);
    expect(bassSizesFor(0)).toEqual([]);
  });

  it("puts the tenors in an arc, biggest to the player's left", () => {
    const m = batteryModel("tenors");
    const shells = m.pieces.filter((p) => p.part === PART_SHELL);
    expect(shells.length).toBe(6);
    const centers = shells.map((p) => {
      const b = bounds([p]);
      return { x: (b.max[0] + b.min[0]) / 2, w: b.max[0] - b.min[0] };
    });
    const big = centers.filter((c) => c.w > 0.22).sort((a, b) => a.x - b.x);
    expect(big.length).toBe(4);
    expect(big[0].w).toBeLessThan(big[3].w); // smallest at −X (the performer's right), biggest at +X
  });

  it("hangs a cymbal from each hand, facing each other", () => {
    const m = batteryModel("cymbals");
    const left = m.pieces.filter((p) => p.bone === "handL");
    const right = m.pieces.filter((p) => p.bone === "handR");
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    for (const p of [...left, ...right]) expect(p.part).toBe(PART_METAL);
    const bl = bounds(left);
    const br = bounds(right);
    expect(bl.max[1] - bl.min[1]).toBeCloseTo(0.457, 1);
    expect(bl.min[0]).toBeGreaterThan(br.max[0] - 0.05);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core/instruments/__test__/battery.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `battery.ts`: builders for a `drum(diameter, depth, lugs)` (shell, two hoops, lugs, two heads), the carrier pieces, sticks and mallets, the cymbal disc, then the four models; `BASS_SIZES_IN` and `bassSizesFor` (even spread: for `n` ≥ 1 pick indices `round(i * (8 - 1) / (n - 1))` for i in 0..n−1, or the middle for n = 1; cap at 8 with duplicates allowed beyond).

- [ ] **Step 4: Run the tests and tune until they pass**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core/instruments`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/view3d/core/instruments/battery.ts apps/desktop/src/view3d/core/instruments/__test__/battery.test.ts
git commit -m "feat(3d): model the battery"
```

---

### Task 3: Guard equipment

**Files:**

- Modify: `apps/desktop/src/view3d/core/instruments/guard.ts` (replace the stub body; keep the signature)
- Create: `apps/desktop/src/view3d/core/instruments/__test__/guard.test.ts`

**Interfaces:**

- Produces: `guardModel(id, detail, options): InstrumentModel` for `flag6`, `swingFlag`, `doubleSwingFlag`, `rifle`, `sabre`.

**Frames** (must match `holds.ts` `flag`, `rifle`, `sabre`): flag6: origin at the right hand's grip on the pole, +Z along the pole toward the tip, +Y the silk's face normal; the pole runs from −0.6 (the butt, below the hand) to +1.23 (a 6 ft pole, 1.83 m total), radius 0.012, chrome; the silk is a flat rectangle of PART_SILK 0.9 m along the pole by 1.37 m out (36 × 54 in), hanging from the top 0.9 m of the pole toward −X... no: toward +X (the performer's left, so a flag at the right side hangs across the body front when presented); build it as a grid of 4 × 6 quads with a gentle sine ripple of amplitude 0.03 in +Y so it reads as cloth; both windings are not needed (the material is double-sided) but the normals should point +Y. swingFlag: a 0.9 m pole (−0.3 to +0.6) with a 1.2 × 0.9 m silk. doubleSwingFlag: two swing flags, the second with `bone: "handL"` mirrored in x. rifle: a wooden rifle 0.91 m along +Z from the grip (stock behind the hand from −0.3, barrel ahead to +0.61), a box-like stock built from `smoothLathe` ovals and a chrome bolt, PART_WOOD body (color 0xf2f2f2 white, as drill rifles are) with a black strap (PART_BLACK thin tube along the length). sabre: a chrome blade 0.8 m along +Z (a flattened `smoothLathe`: profile radius 0.015 to 0.004), a brass hilt (PART_METAL) and a black grip of 0.12 m behind the origin.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/desktop/src/view3d/core/instruments/__test__/guard.test.ts
import { describe, expect, it } from "vitest";
import { bounds, triangleCount, PART_SILK, PART_CHROME } from "../mesh";
import { guardModel } from "../guard";
import type { GuardModelId } from "../model";

const IDS: GuardModelId[] = [
  "flag6",
  "swingFlag",
  "doubleSwingFlag",
  "rifle",
  "sabre",
];

describe("guard equipment", () => {
  it.each(IDS)("%s stays within the triangle budgets", (id) => {
    expect(triangleCount(guardModel(id, "high").pieces)).toBeLessThanOrEqual(
      12000,
    );
    expect(triangleCount(guardModel(id, "high").pieces)).toBeGreaterThanOrEqual(
      1000,
    );
    expect(triangleCount(guardModel(id, "low").pieces)).toBeLessThanOrEqual(
      3500,
    );
  });

  it("makes a 6 ft flag: pole along +Z with a silk at the top", () => {
    const m = guardModel("flag6");
    const pole = m.pieces.filter((p) => p.part === PART_CHROME);
    const b = bounds(pole);
    expect(b.max[2] - b.min[2]).toBeCloseTo(1.83, 1);
    const silk = m.pieces.filter((p) => p.part === PART_SILK);
    expect(silk.length).toBeGreaterThan(0);
    const s = bounds(silk);
    expect(s.max[2]).toBeGreaterThan(1.1);
    expect(s.max[0] - s.min[0]).toBeCloseTo(1.37, 1);
    // a real surface, not a line: many triangles with normals mostly along +Y
    const tris = triangleCount(silk);
    expect(tris).toBeGreaterThan(20);
    let up = 0;
    for (const p of silk)
      for (let i = 1; i < p.normals.length; i += 3)
        if (p.normals[i] > 0.5) up++;
    expect(up).toBeGreaterThan(0);
  });

  it("gives the double swing flag a second flag in the left hand", () => {
    const m = guardModel("doubleSwingFlag");
    const left = m.pieces.filter((p) => p.bone === "handL");
    expect(left.some((p) => p.part === PART_SILK)).toBe(true);
    expect(
      m.pieces.filter((p) => p.part === PART_SILK && !p.bone).length,
    ).toBeGreaterThan(0);
  });

  it("makes the rifle and sabre run along +Z from the grip", () => {
    const r = bounds(guardModel("rifle").pieces);
    expect(r.max[2] - r.min[2]).toBeCloseTo(0.91, 1);
    expect(r.min[2]).toBeLessThan(0);
    const s = bounds(guardModel("sabre").pieces);
    expect(s.max[2]).toBeGreaterThan(0.7);
    expect(s.min[2]).toBeLessThan(0);
  });

  it("colors every vertex", () => {
    for (const id of IDS)
      for (const p of guardModel(id).pieces)
        expect(p.colors?.length).toBe(p.positions.length);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core/instruments/__test__/guard.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `guard.ts`: a `silk(width, height, ripple, segments)` grid builder (positions in a plane, indices as two triangles per cell, normals +Y with the ripple's slope), a `pole(from, to, radius)`, the five models.

- [ ] **Step 4: Run the tests and tune until they pass**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core/instruments`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/view3d/core/instruments/guard.ts apps/desktop/src/view3d/core/instruments/__test__/guard.test.ts
git commit -m "feat(3d): model the guard's flags, rifle and sabre"
```

---

### Task 4: Bass drum sizes per marcher

**Files:**

- Modify: `apps/desktop/src/view3d/window/performers/Performers.tsx` (the `marcherLooks` memo, around the `sectionUniform(section, fill, hornState)` call)
- Modify: `apps/desktop/src/view3d/core/marchers/looks.ts` (add `bassOptions`)
- Test: `apps/desktop/src/view3d/core/marchers/__test__/looks.test.ts`

**Interfaces:**

- Consumes: `bassSizesFor` (Task 2), `sectionUniform(section, fill, hold, options)` (exists), `Carry.options.bassInches` (exists).
- Produces: `export function bassOptions(ids: readonly number[], sections: readonly string[]): (ModelOptions | undefined)[]` in `looks.ts`: for the marchers whose section carries the `bass` model, in id order, the k-th gets `{ bassInches: bassSizesFor(n)[k] }`; everyone else `undefined`.

- [ ] **Step 1: Write the failing test**

```ts
// append to looks.test.ts
describe("bass drum sizes", () => {
  it("spreads the Bass Drum section over the sizes in marcher order", () => {
    const ids = [5, 9, 2, 7, 11];
    const sections = [
      "Bass Drum",
      "Trumpet",
      "Bass Drum",
      "Flub Drum",
      "Bass Drum",
    ];
    const o = bassOptions(ids, sections);
    expect(o[1]).toBeUndefined();
    // four bass players: 18, 22, 28, 32 in id order 2, 5, 7, 11
    expect(o[2]?.bassInches).toBe(18);
    expect(o[0]?.bassInches).toBe(22);
    expect(o[3]?.bassInches).toBe(28);
    expect(o[4]?.bassInches).toBe(32);
  });

  it("gives a lone bass drum the middle size", () => {
    expect(bassOptions([1], ["Bass Drum"])[0]?.bassInches).toBe(26);
  });

  it("carries the size into the look so sizes get their own meshes", () => {
    const a = sectionUniform("Bass Drum", null, "up", { bassInches: 18 });
    const b = sectionUniform("Bass Drum", null, "up", { bassInches: 32 });
    expect(a.options.carry?.options?.bassInches).toBe(18);
    expect(uniformKey(a)).not.toBe(uniformKey(b));
  });
});
```

(Import `bassOptions` from `../looks`; `bassSizesFor(4)` is `[18, 22, 28, 32]` by the even-spread rule.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d/core/marchers/__test__/looks.test.ts`
Expected: FAIL, `bassOptions` is not exported.

- [ ] **Step 3: Implement** `bassOptions` in `looks.ts` (pure: uses `carryForSection(section)?.model === "bass"` and `bassSizesFor` from `../instruments/battery`), and in `Performers.tsx` compute `const options = bassOptions(rows.map(r => r[0]), rows.map(r => r[1]))` inside the `marcherLooks` memo and pass `options[i]` as the fourth argument of `sectionUniform`.

- [ ] **Step 4: Run the tests and the type check**

Run: `pnpm --dir apps/desktop exec vitest run src/view3d` and `pnpm --dir apps/desktop exec tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/view3d/core/marchers/looks.ts apps/desktop/src/view3d/core/marchers/__test__/looks.test.ts apps/desktop/src/view3d/window/performers/Performers.tsx
git commit -m "feat(3d): give each bass drum its own size"
```

---

### Task 5: Render check, spec and findings

**Files:**

- Modify: `docs/3d/instruments.md` (§3: add the guard table and note the swing flags and sabre as later per-section choices; §5: the guard holds), `docs/3d/findings.md` (append counts)
- Temporary: `apps/desktop/e2e/tests/zz-shots.spec.mts` copied from `~/Projects/OpenMarch-timeline-ref/zz-shots.spec.mts`, deleted afterward

- [ ] **Step 1: Build and capture.** From `apps/desktop`: `pnpm run build:electron` (several minutes), copy the spec in, then `SHOTS_OUT=<scratch dir> SHOTS_SHOW="<scratch dir>/Fall Show 2026.dots" SHOTS_STATES=up SHOTS_CAMS=frontRow,podium pnpm run e2e zz-shots` with a copy of `apps/desktop/view3d-web/public/demos/lhb-daft-punk-pt2.dots` as the show (it has piccolos, alto and tenor saxes, snares, tenors, cymbals, tubas, color guard and rifles). Delete the spec file after; `git status` must be clean.
- [ ] **Step 2: Inspect.** Crop the full-resolution frames (ffmpeg `crop`) around the front rank and read them. Check each section's equipment is in the hands or on the chest, not through the body, faces the right way, and is the right size against the marcher. Fix obvious placement errors by adjusting the model frame or the hold targets in `holds.ts` (numbers only), rerun the focused tests, and capture again if needed.
- [ ] **Step 3: Document.** Append a findings entry with triangle counts per model at both details (a small vitest script, as the brass pass did) and what the frames showed. Update the spec sections.
- [ ] **Step 4: Checks.** `pnpm format:check`, `pnpm spellcheck`, `pnpm --dir apps/desktop exec eslint src/view3d`, `pnpm --dir apps/desktop exec tsc --noEmit`, `pnpm --dir apps/desktop exec vitest run src/view3d`. All clean.
- [ ] **Step 5: Commit** `docs(3d): log the woodwind, battery and guard models` and push the branch: `git push origin 3d/p7-instruments`.
