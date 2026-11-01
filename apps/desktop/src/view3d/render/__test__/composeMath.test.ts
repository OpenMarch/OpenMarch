// @vitest-environment node
import { describe, expect, it } from "vitest";
import { composeSlot, type ComposeSetup } from "../composeMath";
import { emptyState, writeChannelState, writeFeetState } from "../channelState";

// A five-bone rig, every matrix worked by hand. Bones: 0 legs (Feet),
// 1 waist (Feet, the Body anchor), 2 chest (Body, the Horn anchor),
// 3 arm (Horn), 4 the prop bone (Horn).
const BONES = 5;
const setup = (turn: ComposeSetup["turn"] = null): ComposeSetup => ({
    bones: BONES,
    channel: [0, 0, 1, 2, 2],
    turnClass: [1, 2, 0, 0, 0],
    anchorBody: 1,
    anchorHorn: 2,
    propBone: 4,
    turn,
});

type M = number[]; // 16, column-major
const I: M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const T = (x: number, y: number, z: number): M => [
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
    x,
    y,
    z,
    1,
];
// +90 degrees about Z: x to y, y to -x
const RZ90: M = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
// +90 degrees about Y (three's convention): x to -z, z to x
const RY90: M = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];
/** a times b, column-major, for building fixtures (not expectations). */
const mul = (a: M, b: M): M => {
    const o = new Array<number>(16).fill(0);
    for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
            for (let k = 0; k < 4; k++)
                o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return o;
};

/** A bake of `rows`, each a list of BONES matrices, in one column. */
function anim(rows: M[][]) {
    const width = BONES * 4;
    const data = new Float32Array(width * rows.length * 4);
    rows.forEach((bones, y) =>
        bones.forEach((m, b) => data.set(m, (y * width + b * 4) * 4)),
    );
    return { data, width, rowsPerColumn: rows.length };
}

function compose(
    a: ReturnType<typeof anim>,
    state: Float32Array,
    count: number,
    s = setup(),
) {
    const out = new Float32Array(BONES * 16);
    composeSlot(a, s, state, 0, count, out, 0);
    return (bone: number) =>
        Array.from(out.subarray(bone * 16, bone * 16 + 16));
}

const close = (got: number[], want: M) =>
    got.forEach((g, k) => expect(g).toBeCloseTo(want[k], 5));

const feet = (state: Float32Array, row: number, frames: number) =>
    writeFeetState(state, 0, {
        row: { row, frames, counts: frames },
        phase: 0,
        rate: 1,
    });

describe("composing a performer's bones (CPU reference)", () => {
    it("plays the Feet rows alone when no other channel has a row, lerped in time", () => {
        // rows 0..2: every bone at x = 0, 2, 4
        const a = anim(
            [0, 1, 2].map((r) => new Array(BONES).fill(T(2 * r, 0, 0))),
        );
        const st = emptyState(1);
        feet(st, 0, 2);
        const bone = compose(a, st, 0.5);
        // a quarter of the way through two samples: halfway from x 0 to 2
        for (let b = 0; b < BONES; b++) close(bone(b), T(1, 0, 0));
    });

    it("re-anchors the Horn chain to the chest the Feet move", () => {
        // Feet row 0: chest turned 90 degrees about Y at the origin.
        // Horn row 2: chest at y 2, arm at (1, 2, 0) turned 90 about Z.
        const feetRow = [I, I, RY90, T(5, 5, 5), T(5, 5, 5)];
        const hornRow = [I, I, T(0, 2, 0), mul(T(1, 2, 0), RZ90), I];
        const a = anim([feetRow, feetRow, hornRow, hornRow]);
        const st = emptyState(1);
        feet(st, 0, 1);
        writeChannelState(st, 0, "horn", {
            row: 2,
            frames: 1,
            counts: 1 / 30,
            phase: 0,
            rate: 1,
            once: false,
        });
        // chestFeet chestHorn^-1 arm = RY90 T(0,-2,0) T(1,2,0) RZ90
        //   = RY90 T(1,0,0) RZ90: x to y to y, y to -x to z, z to x,
        //     the offset (1,0,0) turned to (0,0,-1)
        close(
            compose(a, st, 0)(3),
            [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, -1, 1],
        );
    });

    it("carries a held prop as the composed hand times its grip, or its own path in body space", () => {
        const feetRow = [I, I, T(0, 1, 0), I, I];
        const arm = mul(T(1, 2, 0), RZ90);
        const hornRow = [I, I, T(0, 2, 0), arm, mul(arm, T(0, 0, 0.5))];
        const a = anim([feetRow, feetRow, hornRow, hornRow]);
        const st = emptyState(1);
        feet(st, 0, 1);
        const horn = {
            row: 2,
            frames: 1,
            counts: 1 / 30,
            phase: 0,
            rate: 1,
            once: false,
        };
        writeChannelState(st, 0, "horn", horn);
        // T(0,1,0) T(0,-2,0) T(1,2,0) RZ90 T(0,0,0.5): the arm at (1,1,0)
        // turned 90 about Z, the prop half a meter along its z
        close(
            compose(a, st, 0)(4),
            [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0.5, 1],
        );
        writeChannelState(st, 0, "horn", { ...horn, propInBody: true });
        // the row's own prop matrix, not moved with the chest: (1,2,0.5)
        close(
            compose(a, st, 0)(4),
            [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 1, 2, 0.5, 1],
        );
    });

    it("re-anchors Body to the Feet waist, and Horn to the Body chest", () => {
        const feetRow = [I, T(0, 1, 0), T(9, 9, 9), I, I];
        const bodyRow = [I, T(0, 3, 0), T(0, 4, 1), I, I];
        const hornRow = [I, I, T(0, 2, 0), T(1, 2, 0), I];
        const a = anim([feetRow, feetRow, bodyRow, bodyRow, hornRow, hornRow]);
        const st = emptyState(1);
        feet(st, 0, 1);
        const still = {
            frames: 1,
            counts: 1 / 30,
            phase: 0,
            rate: 1,
            once: false,
        };
        writeChannelState(st, 0, "body", { row: 2, ...still });
        writeChannelState(st, 0, "horn", { row: 4, ...still });
        const bone = compose(a, st, 0);
        // chest: T(0,1,0) T(0,-3,0) T(0,4,1) = T(0,2,1)
        close(bone(2), T(0, 2, 1));
        // arm: chest T(0,-2,0) T(1,2,0) = T(1,2,1)
        close(bone(3), T(1, 2, 1));
        // the Feet bones stay on the Feet row
        close(bone(1), T(0, 1, 0));
    });

    it("plays a transition once, holding its last sample instead of wrapping", () => {
        const feetRow = [I, I, I, I, I];
        const tr = (z: number) => [I, I, I, T(0, 0, z), I];
        const a = anim([feetRow, feetRow, tr(0), tr(1), tr(2)]);
        const st = emptyState(1);
        feet(st, 0, 1);
        // a one-count row of two samples over counts 2 to 4: rate 1/2
        const play = { row: 2, frames: 2, counts: 1, phase: -1, rate: 0.5 };
        writeChannelState(st, 0, "horn", { ...play, once: true });
        close(compose(a, st, 3)(3), T(0, 0, 1));
        close(compose(a, st, 10)(3), T(0, 0, 2));
        close(compose(a, st, 1)(3), T(0, 0, 0));
        // looped instead, count 10 wraps to the start
        writeChannelState(st, 0, "horn", { ...play, once: false });
        close(compose(a, st, 10)(3), T(0, 0, 0));
    });

    it("blends a second Feet clip in at its weight", () => {
        const a = anim([
            new Array(BONES).fill(T(0, 0, 0)),
            new Array(BONES).fill(T(0, 0, 0)),
            new Array(BONES).fill(T(4, 0, 0)),
            new Array(BONES).fill(T(4, 0, 0)),
        ]);
        const st = emptyState(1);
        writeFeetState(st, 0, {
            row: { row: 0, frames: 1, counts: 1 },
            row2: { row: 2, frames: 1, counts: 1 },
            weight: 0.25,
        });
        close(compose(a, st, 0)(3), T(1, 0, 0));
    });

    it("turns the legs, the waist and the carried bones as the leg turn says", () => {
        // bone 0's bottom row (texels 0..2, .w) holds the leg turn's data:
        // the upper body's column at (1, 0, 0), the hip line's yaw 0
        const root = [...I];
        root[3] = 1; // column x
        root[7] = 0; // column z
        root[11] = 0; // hip line yaw
        const row = [root, I, I, T(0, 1, 0), I];
        const a = anim([row, row]);
        const st = emptyState(1);
        writeFeetState(st, 0, {
            row: { row: 0, frames: 1, counts: 1 },
            legYaw: Math.PI / 2,
        });
        const s = setup({ root: 0, waist: 1 });
        s.turnClass = [0, 1, 2, 0, 0];
        const bone = compose(a, st, 0, s);
        // class 1 (legs): turned 90 degrees about Y
        close(bone(1), RY90);
        // class 2 (waist): by atan2(sin 90, 1 + cos 90) - atan2(0, 2) = 45
        // degrees, then moved by R(90)h - R(45)h = (0,0,-1) - (c,0,-c)
        const c = Math.SQRT1_2;
        close(bone(2), [c, 0, -c, 0, 0, 1, 0, 0, c, 0, c, 0, -c, 0, c - 1, 1]);
        // class 0 (carried): moved by R(90)h - h = (0,0,-1) - (1,0,0)
        close(bone(3), T(-1, 1, -1));
    });
});
