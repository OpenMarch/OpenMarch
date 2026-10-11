import { describe, expect, it } from "vitest";
import { hold, type HoldFamily, type HoldState } from "../holds";
import { bounds, PART_METAL, type Vec3 } from "../mesh";
import type { WoodwindModelId } from "../model";
import {
    SAX_BELL_TILT,
    SAX_SHAPES,
    WOODWIND_DIMENSIONS,
    woodwindModel,
} from "../woodwinds";

type SaxId = "altoSax" | "tenorSax" | "bariSax";
const SAXES: SaxId[] = ["altoSax", "tenorSax", "bariSax"];
const STATES: HoldState[] = ["up", "carry", "trail"];

const unit = (v: Vec3): Vec3 => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];

/** The instrument frame placed in the body frame, as `instrumentGeometry.ts` builds it. */
function placement(state: HoldState, family: HoldFamily = "sax") {
    const { origin, bellAxis, capsAxis } = hold(family, state).instrument;
    const z = unit(bellAxis);
    const d = dot(capsAxis, z);
    const y = unit([
        capsAxis[0] - z[0] * d,
        capsAxis[1] - z[1] * d,
        capsAxis[2] - z[2] * d,
    ]);
    const x = unit(cross(y, z));
    const point = (p: Vec3): Vec3 =>
        [0, 1, 2].map(
            (k) => origin[k] + x[k] * p[0] + y[k] * p[1] + z[k] * p[2],
        ) as Vec3;
    return { point, z, y, x };
}

/**
 * The bell rim's center in the instrument frame: the widest piece's ring
 * furthest along the flare's axis (−Z leaning toward +Y).
 */
function bellRim(id: SaxId): Vec3 {
    const pieces = woodwindModel(id, "high").pieces;
    const width = (p: (typeof pieces)[number]) => {
        const b = bounds([p]);
        return b.max[0] - b.min[0];
    };
    const bell = pieces.reduce((a, b) => (width(b) > width(a) ? b : a));
    const n: Vec3 = [0, Math.sin(SAX_BELL_TILT), -Math.cos(SAX_BELL_TILT)];
    let far = -Infinity;
    for (let i = 0; i < bell.positions.length; i += 3)
        far = Math.max(
            far,
            dot(n, [
                bell.positions[i],
                bell.positions[i + 1],
                bell.positions[i + 2],
            ]),
        );
    const sum: Vec3 = [0, 0, 0];
    let count = 0;
    for (let i = 0; i < bell.positions.length; i += 3) {
        const v: Vec3 = [
            bell.positions[i],
            bell.positions[i + 1],
            bell.positions[i + 2],
        ];
        if (dot(n, v) > far - 0.003) {
            for (let k = 0; k < 3; k++) sum[k] += v[k];
            count++;
        }
    }
    return [sum[0] / count, sum[1] / count, sum[2] / count];
}

// the torso, front at z 0.12 (holds.ts landmarks), between hips and shoulders
const inTorso = (w: Vec3) =>
    Math.abs(w[0]) < 0.17 && w[1] > 0.85 && w[1] < 1.35 && w[2] < 0.12;
const LIPS: Vec3 = [0, 1.52, 0.13];

describe("sax placement under the sax hold", () => {
    for (const id of SAXES)
        for (const state of STATES)
            describe(`${id} ${state}`, () => {
                const { point } = placement(state);

                it("keeps every lacquered vertex in front of the chest", () => {
                    const inside: Vec3[] = [];
                    for (const p of woodwindModel(id, "high").pieces) {
                        if (p.part !== PART_METAL) continue;
                        for (let i = 0; i < p.positions.length; i += 3) {
                            const w = point([
                                p.positions[i],
                                p.positions[i + 1],
                                p.positions[i + 2],
                            ]);
                            if (inTorso(w)) inside.push(w);
                        }
                    }
                    expect(inside.length).toBe(0);
                });

                it.runIf(state === "up")(
                    "puts the bell on the performer's left of the body, opening forward and up",
                    () => {
                        const [, yb] = woodwindModel(id).leftGrip;
                        const rimLocal = bellRim(id);
                        const rim = point(rimLocal);
                        const body = point([0, yb, rimLocal[2]]);
                        expect(rim[0]).toBeGreaterThan(body[0] + 0.05);
                        // the opening's normal: the flare's axis, leaning toward the keys
                        const open = point([
                            0,
                            Math.sin(SAX_BELL_TILT),
                            -Math.cos(SAX_BELL_TILT),
                        ]);
                        const o = point([0, 0, 0]);
                        const n = [0, 1, 2].map((k) => open[k] - o[k]);
                        expect(n[1]).toBeGreaterThan(0.6); // up
                        expect(n[2]).toBeGreaterThan(0.2); // forward
                    },
                );

                it.runIf(state === "up")(
                    "keeps the mouthpiece at the lips",
                    () => {
                        const o = point([0, 0, 0]);
                        const lips = LIPS;
                        expect(
                            Math.hypot(
                                o[0] - lips[0],
                                o[1] - lips[1],
                                o[2] - lips[2],
                            ),
                        ).toBeLessThan(0.04);
                    },
                );
            });
});

/**
 * A pearl touch at fraction `k` from the body's top to the bow, in the
 * instrument frame: on the keys' side (+Y) of the body, just off center.
 */
function pearl(id: SaxId, k: number): Vec3 {
    const sh = SAX_SHAPES[id];
    const [, yb, grip] = woodwindModel(id).leftGrip;
    const top = grip - 0.12;
    const bowZ = WOODWIND_DIMENSIONS[id].length - sh.bowWidth / 2 - sh.rBow;
    const z = top + (bowZ - top) * k;
    const r = sh.rTop + ((sh.rBow - sh.rTop) * (z - top)) / (bowZ - top);
    return [0, yb + r, z];
}

describe("the sax held in front", () => {
    for (const id of SAXES) {
        it(`${id}: the bell turns up on the instrument's +X, its flare leaning toward the keys`, () => {
            const rim = bellRim(id);
            expect(rim[0]).toBeGreaterThan(0.05);
            const [, yb] = woodwindModel(id).leftGrip;
            expect(rim[1]).toBeGreaterThan(yb + 0.01);
        });

        it(`${id}: hangs centered in front of the body with the keys facing forward`, () => {
            const { point, y } = placement("up");
            expect(y[2]).toBeGreaterThan(0.95);
            const sh = SAX_SHAPES[id];
            const [, yb] = woodwindModel(id).leftGrip;
            const bowZ =
                WOODWIND_DIMENSIONS[id].length - sh.bowWidth / 2 - sh.rBow;
            const bow = point([0, yb, bowZ]);
            expect(Math.abs(bow[0])).toBeLessThan(0.05);
            // in front of the stomach, not out at arm's length
            expect(bow[2]).toBeLessThan(0.35);
        });

        it(`${id}: the hands wrap the stacks from the sides, left hand upper, right hand lower`, () => {
            const { point } = placement("up");
            const h = hold("sax", "up");
            const dist = (a: Vec3, b: Vec3) =>
                Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
            const upper = point(pearl(id, 0.28));
            const lower = point(pearl(id, 0.63));
            // the hold suits the alto; the longer tenor and bari reach further
            const reach = { altoSax: 0.12, tenorSax: 0.17, bariSax: 0.2 }[id];
            expect(dist(h.left.wrist, upper)).toBeLessThan(reach);
            expect(dist(h.right.wrist, lower)).toBeLessThan(reach);
            expect(h.left.wrist[0]).toBeGreaterThan(upper[0]);
            expect(h.right.wrist[0]).toBeLessThan(lower[0]);
            // fingers across the front, toward the other side
            expect(h.left.fingers[0]).toBeLessThan(-0.5);
            expect(h.right.fingers[0]).toBeGreaterThan(0.5);
        });
    }
});

/** The right fist round whatever it carries: 0.07 down the fingers from the wrist. */
function fist(family: HoldFamily, state: HoldState): Vec3 {
    const { wrist, fingers } = hold(family, state).right;
    return [0, 1, 2].map((k) => wrist[k] + fingers[k] * 0.07) as Vec3;
}
// the right thigh and shin, hip to ankle, front to back
const inRightLeg = (w: Vec3) =>
    w[0] < -0.005 && w[0] > -0.175 && w[1] < 0.9 && w[2] > -0.12 && w[2] < 0.12;
const dist = (a: Vec3, b: Vec3) =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("the saxes at carry", () => {
    for (const id of SAXES)
        it(`${id}: vertical in front, the bell out in front of the body tube`, () => {
            const { point } = placement("carry");
            const [, yb] = woodwindModel(id).leftGrip;
            const rimLocal = bellRim(id);
            const rim = point(rimLocal);
            const body = point([0, yb, rimLocal[2]]);
            expect(rim[2]).toBeGreaterThan(body[2] + 0.08);
            // the flare leans toward the keys, the performer's right
            expect(Math.abs(rim[0] - body[0])).toBeLessThan(0.1);
            // the body tube centered in front of the performer
            expect(Math.abs(body[0])).toBeLessThan(0.08);
        });
});

describe("the saxes and bass clarinet at trail", () => {
    const BENT: [HoldFamily, WoodwindModelId][] = [
        ["sax", "altoSax"],
        ["sax", "tenorSax"],
        ["sax", "bariSax"],
        ["bassClarinet", "bassClarinet"],
    ];
    for (const [family, id] of BENT)
        describe(id, () => {
            const { point, z } = placement("trail", family);
            const [, yb] = woodwindModel(id).leftGrip;

            it("runs the body tube level through the right fist", () => {
                expect(Math.abs(z[1])).toBeLessThan(0.01);
                // the nearest point of the body tube to the fist
                const f = fist(family, "trail");
                const top = point([0, yb, 0]);
                const k = [0, 1, 2].reduce(
                    (s, i) => s + (f[i] - top[i]) * z[i],
                    0,
                );
                const near = point([0, yb, k]);
                // one hold suits the alto and bari; the tenor's longer neck sets its body further out
                expect(dist(near, f)).toBeLessThan(
                    id === "tenorSax" ? 0.08 : 0.05,
                );
            });

            it("keeps every part clear of the right leg and the torso", () => {
                const leg: Vec3[] = [];
                const torso: Vec3[] = [];
                for (const p of woodwindModel(id, "high").pieces)
                    for (let i = 0; i < p.positions.length; i += 3) {
                        const w = point([
                            p.positions[i],
                            p.positions[i + 1],
                            p.positions[i + 2],
                        ]);
                        if (inRightLeg(w)) leg.push(w);
                        if (inTorso(w)) torso.push(w);
                    }
                expect(leg.length).toBe(0);
                expect(torso.length).toBe(0);
            });
        });
});

describe("the straight woodwinds at carry and trail", () => {
    const STRAIGHT: [HoldFamily, WoodwindModelId][] = [
        ["flute", "flute"],
        ["piccolo", "piccolo"],
        ["clarinet", "clarinet"],
        ["clarinet", "sopranoSax"],
    ];
    for (const [family, id] of STRAIGHT)
        for (const state of ["carry", "trail"] as const)
            it(`${id} ${state}: no metal in the torso, nothing in the right leg`, () => {
                const { point } = placement(state, family);
                const hits: Vec3[] = [];
                for (const p of woodwindModel(id, "high").pieces)
                    for (let i = 0; i < p.positions.length; i += 3) {
                        const w = point([
                            p.positions[i],
                            p.positions[i + 1],
                            p.positions[i + 2],
                        ]);
                        if (inRightLeg(w) || inTorso(w)) hits.push(w);
                    }
                expect(hits.length).toBe(0);
            });
});
