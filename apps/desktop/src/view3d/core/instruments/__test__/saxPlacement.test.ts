// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hold, playingLips, type HoldFamily, type HoldState } from "../holds";
import { bounds, PART_METAL, type Vec3 } from "../mesh";
import type { WoodwindModelId } from "../model";
import { saxAxis, saxStack, saxTurned } from "../saxophones";
import {
    SAX_BELL_TILT,
    SAX_SHAPES,
    WOODWIND_DIMENSIONS,
    woodwindModel,
} from "../woodwinds";

type SaxId = "altoSax" | "tenorSax" | "bariSax";
const SAXES: SaxId[] = ["altoSax", "tenorSax", "bariSax"];
const STATES: HoldState[] = ["up", "carry", "trail"];
/** The bari has its own hold; the alto and tenor share the sax hold. */
const familyOf = (id: SaxId): HoldFamily =>
    id === "bariSax" ? "bariSax" : "sax";

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
// the mouthpiece's tip a centimeter inside the lips, the head up (`withMouth` in holds.ts)
const MOUTH: Vec3 = playingLips();
const LIPS: Vec3 = [MOUTH[0], MOUTH[1], MOUTH[2] - 0.01];

describe("sax placement under its hold", () => {
    for (const id of SAXES)
        for (const state of STATES)
            describe(`${id} ${state}`, () => {
                const { point } = placement(state, familyOf(id));

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
                    "keeps the neck and crook clear of the face, the neck and the shoulders",
                    () => {
                        const hits: Vec3[] = [];
                        for (const p of woodwindModel(id, "high").pieces)
                            for (let i = 0; i < p.positions.length; i += 3) {
                                const w = point([
                                    p.positions[i],
                                    p.positions[i + 1],
                                    p.positions[i + 2],
                                ]);
                                // the mouthpiece itself is in the lips
                                if (dist(w, MOUTH) < 0.045) continue;
                                const head =
                                    (w[0] / 0.085) ** 2 +
                                        ((w[1] - 1.62) / 0.12) ** 2 +
                                        (w[2] / 0.095) ** 2 <
                                    1;
                                const neck =
                                    w[1] > 1.42 &&
                                    w[1] < 1.56 &&
                                    Math.hypot(w[0], w[2] + 0.005) < 0.065;
                                const shoulders =
                                    Math.abs(w[0]) < 0.21 &&
                                    w[1] > 1.3 &&
                                    w[1] < 1.45 &&
                                    w[2] < 0.11;
                                if (head || neck || shoulders) hits.push(w);
                            }
                        expect(hits.length).toBe(0);
                    },
                );

                it.runIf(state === "up")(
                    "puts the bell in front of the body tube, opening forward and up",
                    () => {
                        const [, yb] = woodwindModel(id).leftGrip;
                        const rimLocal = bellRim(id);
                        const rim = point(rimLocal);
                        const body = point([0, yb, rimLocal[2]]);
                        expect(rim[2]).toBeGreaterThan(body[2] + 0.06);
                        if (id === "bariSax") {
                            // turned toward the left with the whole horn
                            expect(rim[0]).toBeGreaterThan(body[0]);
                        } else {
                            // straight in front (owner, 2026-11-14)
                            expect(Math.abs(rim[0] - body[0])).toBeLessThan(
                                0.01,
                            );
                        }
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

describe("the sax held in front", () => {
    for (const id of SAXES) {
        it(`${id}: the bell turns up straight in front of the body (+Y), the keys turned toward −X`, () => {
            const rim = bellRim(id);
            const [, yb] = woodwindModel(id).leftGrip;
            expect(rim[1]).toBeGreaterThan(yb + 0.08);
            // the bari's body is swivelled under its neck (below)
            if (id !== "bariSax") expect(Math.abs(rim[0])).toBeLessThan(0.01);
            const keys = saxTurned([0, yb + 1, 0], yb);
            expect(keys[0]).toBeLessThan(-0.99);
        });

        it.runIf(id !== "bariSax")(
            `${id}: the mouthpiece, body and bell in one plane, front to back`,
            () => {
                // nothing further either side of the plane x = 0 than the bell's
                // rim (the bari's crook reaches a little past it on +X)
                const m = woodwindModel(id, "low");
                const b = bounds(m.pieces);
                const rim = WOODWIND_DIMENSIONS[id].bell / 2 + 0.005;
                expect(b.max[0]).toBeLessThan(rim);
                expect(b.min[0]).toBeGreaterThan(-rim);
            },
        );

        it(`${id}: the hands on the stacks, left hand upper, right hand lower`, () => {
            const family = familyOf(id);
            const { point } = placement("up", family);
            const h = hold(family, "up");
            const upper = point(saxStack(id, 0.3));
            const lower = point(saxStack(id, 0.66));
            const knuckles = (a: typeof h.left) =>
                [0, 1, 2].map((k) => a.wrist[k] + a.fingers[k] * 0.1) as Vec3;
            // the curled fingers wrap round in front of the pearls; the alto
            // and tenor share a hold, so their hands sit between their stacks
            const reach = id === "bariSax" ? 0.06 : 0.15;
            expect(dist(knuckles(h.left), upper)).toBeLessThan(reach);
            expect(dist(knuckles(h.right), lower)).toBeLessThan(reach);
            expect(h.left.wrist[1]).toBeGreaterThan(h.right.wrist[1]);
            // the left hand from the left, the right from the right
            expect(h.left.wrist[0]).toBeGreaterThan(h.right.wrist[0]);
            expect(h.left.fingers[0]).toBeLessThan(0);
            if (id === "bariSax") {
                // the right elbow tucked in at the side and drawn back, the hand
                // coming onto the stack from the right hip, leveling out and
                // wrapping inward (owner and review, 2026-11-14)
                expect(h.right.elbow[0]).toBeGreaterThan(-0.26);
                expect(h.right.elbow[2]).toBeLessThan(0);
                expect(h.right.fingers[0]).toBeGreaterThan(0.2);
                expect(h.right.fingers[2]).toBeGreaterThan(0.5);
            } else {
                expect(h.right.fingers[0]).toBeGreaterThan(0);
            }
        });
    }

    it("bariSax: the neck swivelled in its receiver, the body and bell turned toward −X", () => {
        // players turn the bari's neck so it comes in to the mouth from by
        // the left collarbone while the bell still faces forward (owner and
        // review, 2026-11-14)
        const top = saxAxis("bariSax", 0);
        const bow = saxAxis("bariSax", 1);
        expect(Math.abs(bow[0] - top[0])).toBeLessThan(0.001);
        // the bell turned off the neck's plane toward −X
        const rim = bellRim("bariSax");
        expect(rim[0]).toBeLessThan(top[0] - 0.05);
    });

    it("altoSax and tenorSax hang straight down, centered, the neck straight back", () => {
        const { point, y } = placement("up");
        expect(y[2]).toBeGreaterThan(0.99);
        for (const id of ["altoSax", "tenorSax"] as const) {
            const sh = SAX_SHAPES[id];
            const [, yb] = woodwindModel(id).leftGrip;
            const bowZ =
                WOODWIND_DIMENSIONS[id].length - sh.bowWidth / 2 - sh.rBow;
            const bow = point([0, yb, bowZ]);
            const top = point([0, yb, 0]);
            expect(Math.abs(bow[0])).toBeLessThan(0.01);
            expect(Math.abs(bow[2] - top[2])).toBeLessThan(0.01);
            expect(bow[2]).toBeLessThan(0.4);
        }
    });

    it("bariSax runs from by the left shoulder down across to the right hip", () => {
        const { point } = placement("up", "bariSax");
        // the body's axis at its top (by the top loop) and at the bow
        const top = point(saxAxis("bariSax", 0));
        const bow = point(saxAxis("bariSax", 1));
        // leaning across the body: the top well to the left of the bow
        expect(top[0] - bow[0]).toBeGreaterThan(0.18);
        // the bow rests just in front of the right thigh (owner, 2026-11-14:
        // nearly touching the leg), its axis about a bow's radius off it
        expect(bow[0]).toBeLessThan(-0.15);
        expect(bow[0]).toBeGreaterThan(-0.25);
        expect(bow[1]).toBeLessThan(0.85);
        expect(bow[2]).toBeGreaterThan(0.12);
        expect(bow[2]).toBeLessThan(0.3);
    });
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
            const { point } = placement("carry", familyOf(id));
            const [, yb] = woodwindModel(id).leftGrip;
            const rimLocal = bellRim(id);
            const rim = point(rimLocal);
            const body = point([0, yb, rimLocal[2]]);
            expect(rim[2]).toBeGreaterThan(body[2] + 0.08);
            // the flare leans toward the keys, the performer's right; the
            // bari's body is swivelled 40 degrees under its neck, which
            // carries its bell further to that side
            expect(Math.abs(rim[0] - body[0])).toBeLessThan(
                id === "bariSax" ? 0.15 : 0.1,
            );
            // the body tube centered in front of the performer
            expect(Math.abs(body[0])).toBeLessThan(0.08);
        });
});

describe("the saxes and bass clarinet at trail", () => {
    const BENT: [HoldFamily, WoodwindModelId][] = [
        ["sax", "altoSax"],
        ["sax", "tenorSax"],
        ["bariSax", "bariSax"],
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
                // the body's axis (the bari's swivelled about its receiver)
                const [ax, ay] =
                    id === "bassClarinet" ? [0, yb] : saxAxis(id as SaxId, 0);
                const top = point([ax, ay, 0]);
                const k = [0, 1, 2].reduce(
                    (s, i) => s + (f[i] - top[i]) * z[i],
                    0,
                );
                const near = point([ax, ay, k]);
                // the alto and tenor share a hold, its tube between theirs
                expect(dist(near, f)).toBeLessThan(0.05);
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
