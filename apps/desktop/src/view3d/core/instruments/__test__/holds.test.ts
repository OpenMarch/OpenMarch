// @vitest-environment node
import { describe, expect, it } from "vitest";
import { brassHorn } from "../brass";
import {
    HOLD_STATES,
    HORN_PITCH_DEG,
    headQuaternion,
    hold,
    holdId,
    playingLips,
    type Hold,
    type HoldFamily,
} from "../holds";
import type { Vec3 } from "../mesh";
import type { BrassModelId } from "../model";

const SHOULDER_R = [-0.185, 1.397, -0.005] as const;
const UPPER = 0.205;
const FOREARM = 0.264;
const dist = (a: readonly number[], b: readonly number[]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const LIPS: Vec3 = playingLips();
const VALVED: [HoldFamily, BrassModelId][] = [
    ["trumpet", "trumpet"],
    ["mellophone", "mellophone"],
    ["baritone", "baritone"],
    ["euphonium", "euphonium"],
    ["contra", "contra"],
];
const HORNS: [HoldFamily, BrassModelId][] = [
    ...VALVED,
    ["trombone", "trombone"],
    ["bassTrombone", "bassTrombone"],
];
/** A point in a hold's instrument frame, in the body's. */
function inBody(h: Hold, p: Vec3): Vec3 {
    const n = (v: readonly number[]) => {
        const l = Math.hypot(...v);
        return v.map((x) => x / l);
    };
    const z = n(h.instrument.bellAxis);
    const c = h.instrument.capsAxis;
    const cz = c[0] * z[0] + c[1] * z[1] + c[2] * z[2];
    const y = n(c.map((v, i) => v - z[i] * cz));
    const x = [
        y[1] * z[2] - y[2] * z[1],
        y[2] * z[0] - y[0] * z[2],
        y[0] * z[1] - y[1] * z[0],
    ];
    return [0, 1, 2].map(
        (i) => h.instrument.origin[i] + x[i] * p[0] + y[i] * p[1] + z[i] * p[2],
    ) as Vec3;
}
const FAMILIES: HoldFamily[] = [
    "trumpet",
    "mellophone",
    "baritone",
    "euphonium",
    "trombone",
    "bassTrombone",
    "contra",
    "sousaphone",
    "flute",
    "piccolo",
    "clarinet",
    "bassClarinet",
    "sax",
    "snare",
    "tenors",
    "bass",
    "cymbals",
];
/** The guard carries at the side with an arm down, so only the reach test covers it. */
const GUARD: HoldFamily[] = [
    "flag",
    "swingFlag",
    "doubleSwingFlag",
    "rifle",
    "sabre",
];

describe("holds", () => {
    it("lists the four states with up first", () => {
        expect(HOLD_STATES).toEqual(["up", "carry", "trail"]);
        expect(holdId("trumpet", "up")).toBe("trumpet:up");
    });

    it.each([...FAMILIES, ...GUARD])(
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
                    expect(dist(shoulder, arm.elbow)).toBeLessThanOrEqual(
                        UPPER + 0.02,
                    );
                    expect(dist(arm.elbow, arm.wrist)).toBeLessThanOrEqual(
                        FOREARM + 0.02,
                    );
                    expect(dist(shoulder, arm.wrist)).toBeGreaterThan(0.12);
                    expect(Math.hypot(...arm.fingers)).toBeCloseTo(1, 6);
                }
            }
        },
    );

    it.each(HORNS)(
        "%s up: 15 degrees above level, the rim at the lips",
        (family, id) => {
            const h = hold(family, "up");
            const bell = h.instrument.bellAxis;
            // 15 degrees above level, whatever its turn (the trombones turn 5)
            expect(
                (Math.asin(bell[1] / Math.hypot(...bell)) * 180) / Math.PI,
            ).toBeCloseTo(HORN_PITCH_DEG, 6);
            const horn = brassHorn(id, "low");
            // trombonists set the mouthpiece a little left of center
            const off =
                family === "trombone" || family === "bassTrombone" ? 0.012 : 0;
            expect(dist(inBody(h, horn.rim), playingLips(h.head))).toBeLessThan(
                off + 0.002,
            );
        },
    );

    it.each(VALVED.filter(([f]) => f !== "contra"))(
        "%s up: right hand over the valves, left hand on the casings' left side",
        (family, id) => {
            const h = hold(family, "up");
            const horn = brassHorn(id, "low");
            const buttons = horn.valves.map((v) => inBody(h, v.button));
            const middle = buttons[1];
            // the right knuckles (0.1 m down the fingers) sit beside the buttons
            const knuckles = h.right.wrist.map(
                (w, i) => w + h.right.fingers[i] * 0.1,
            );
            expect(dist(knuckles, middle)).toBeLessThan(0.04);
            // the left palm (0.075 m down the fingers) is left of the casings, near them
            const palm = h.left.wrist.map(
                (w, i) => w + h.left.fingers[i] * 0.075,
            );
            const c = horn.valves[1];
            const casing = inBody(h, [
                (c.top[0] + c.bottom[0]) / 2,
                (c.top[1] + c.bottom[1]) / 2,
                (c.top[2] + c.bottom[2]) / 2,
            ]);
            expect(palm[0]).toBeGreaterThan(casing[0]);
            expect(dist(palm, casing)).toBeLessThan(0.06);
            // elbows out: wider than the shoulders
            expect(h.right.elbow[0]).toBeLessThan(SHOULDER_R[0]);
        },
    );

    it("brass carry: mouthpiece at eye level, bell to the ground", () => {
        const h = hold("trumpet", "carry");
        expect(h.instrument.bellAxis).toEqual([0, -1, 0]);
        // the mouthpiece sits about 0.17 above the grip: eye level
        expect(h.instrument.origin[1]).toBeGreaterThan(1.45);
    });

    it("brass trail: right arm down the side, bell backward, left arm straight", () => {
        const h = hold("trumpet", "trail");
        expect(h.instrument.bellAxis).toEqual([0, 0, -1]);
        expect(h.right.wrist[1]).toBeLessThan(1.0);
        expect(h.left.wrist[1]).toBeLessThan(1.0);
        expect(Math.abs(h.left.wrist[0] - 0.2)).toBeLessThan(0.08);
    });

    it.each([
        "trumpet",
        "mellophone",
        "baritone",
        "euphonium",
        "trombone",
        "bassTrombone",
        "contra",
        "sousaphone",
    ] as const)(
        "%s up: each hand carries straight on from the forearm, no break at the wrist",
        (family) => {
            // owner, 2026-11-10: a straight line from the top of the hand to the elbow
            const h = hold(family, "up");
            for (const arm of [h.left, h.right]) {
                const fore = arm.wrist.map((w, i) => w - arm.elbow[i]);
                const cos =
                    fore.reduce((s, v, i) => s + v * arm.fingers[i], 0) /
                    Math.hypot(...fore);
                expect(
                    (Math.acos(Math.min(1, cos)) * 180) / Math.PI,
                ).toBeLessThan(8);
            }
        },
    );

    it.each(["trombone", "bassTrombone"] as const)(
        "%s up: the horn passes beside the head, not through it",
        (family) => {
            // the head as an ellipsoid at bind (half-widths 0.094, 0.13,
            // 0.09 about (0, 1.67, 0.005)), turned with the hold's head; the
            // mouthpiece at the lips is allowed in
            const h = hold(family, "up");
            const [x, y, z, w] = headQuaternion(h.head);
            const toHeadAtBind = (v: Vec3): Vec3 => {
                // rotate by the inverse quaternion (-x, -y, -z, w)
                const q = [-x, -y, -z];
                const c1: Vec3 = [
                    q[1] * v[2] - q[2] * v[1],
                    q[2] * v[0] - q[0] * v[2],
                    q[0] * v[1] - q[1] * v[0],
                ];
                const c2: Vec3 = [
                    q[1] * c1[2] - q[2] * c1[1],
                    q[2] * c1[0] - q[0] * c1[2],
                    q[0] * c1[1] - q[1] * c1[0],
                ];
                return [0, 1, 2].map(
                    (i) => v[i] + 2 * (w * c1[i] + c2[i]),
                ) as Vec3;
            };
            const pivot: Vec3 = [0, 1.565, -0.005];
            const lips = playingLips(h.head);
            let inside = 0;
            for (const piece of brassHorn(family, "low").pieces)
                for (let i = 0; i < piece.positions.length; i += 3) {
                    const p = inBody(h, [
                        piece.positions[i],
                        piece.positions[i + 1],
                        piece.positions[i + 2],
                    ]);
                    if (dist(p, lips) < 0.04) continue;
                    const r = toHeadAtBind([
                        p[0] - pivot[0],
                        p[1] - pivot[1],
                        p[2] - pivot[2],
                    ]);
                    const e =
                        (r[0] / 0.094) ** 2 +
                        ((r[1] + pivot[1] - 1.67) / 0.13) ** 2 +
                        ((r[2] + pivot[2] - 0.005) / 0.09) ** 2;
                    if (e < 1) inside++;
                }
            expect(inside).toBe(0);
        },
    );

    it("contra up: the two elbows level with each other", () => {
        const h = hold("contra", "up");
        expect(Math.abs(h.right.elbow[1] - h.left.elbow[1])).toBeLessThan(0.02);
    });

    it("sousaphone up: the left arm reaches the mouthpiece clear of the tubing", () => {
        // the arm as capsules: upper arm 0.05 m thick, forearm 0.042, the
        // forearm's last 15% left out where the hand holds the leadpipe
        const h = hold("sousaphone", "up");
        const shoulder: Vec3 = [-SHOULDER_R[0], SHOULDER_R[1], SHOULDER_R[2]];
        const { elbow, wrist } = h.left;
        const near = elbow.map((e, i) => e + (wrist[i] - e) * 0.85) as Vec3;
        const segDist = (p: Vec3, a: Vec3, b: Vec3) => {
            const ab = b.map((v, i) => v - a[i]);
            const t = Math.max(
                0,
                Math.min(
                    1,
                    ab.reduce((s, v, i) => s + v * (p[i] - a[i]), 0) /
                        ab.reduce((s, v) => s + v * v, 0),
                ),
            );
            return dist(
                p,
                a.map((v, i) => v + ab[i] * t),
            );
        };
        let upper = Infinity;
        let fore = Infinity;
        for (const piece of brassHorn("sousaphone", "low").pieces)
            for (let i = 0; i < piece.positions.length; i += 3) {
                const p = inBody(h, [
                    piece.positions[i],
                    piece.positions[i + 1],
                    piece.positions[i + 2],
                ]);
                upper = Math.min(upper, segDist(p, shoulder, elbow) - 0.05);
                fore = Math.min(fore, segDist(p, elbow, near) - 0.042);
            }
        expect(upper).toBeGreaterThan(0);
        expect(fore).toBeGreaterThan(0);
        // and the elbow stays in front of the chest (front at z 0.12)
        expect(elbow[2]).toBeGreaterThan(0.16);
    });

    it("contra up: valves high in front of the face, the left hand on the front bow", () => {
        const h = hold("contra", "up");
        expect(h.instrument.origin[1]).toBeGreaterThan(1.5);
        expect(h.instrument.origin[1]).toBeLessThan(1.7);
        // the loop plane (0.05 left of the valves) lies over the left shoulder, clear of the head
        expect(h.instrument.origin[0] + 0.05).toBeGreaterThanOrEqual(0.14);
        // the left hand on the horn's left side, the right reaching across to the valves
        expect(h.left.wrist[0]).toBeGreaterThan(h.instrument.origin[0]);
        expect(h.right.wrist[0]).toBeLessThan(h.instrument.origin[0]);
    });

    it("keeps the wrists in front of the chest in every hold", () => {
        for (const family of FAMILIES)
            for (const state of HOLD_STATES) {
                const h = hold(family, state);
                if (state === "trail") continue;
                // in front of the body; the trombones' left hand sits by the
                // mouthpiece at the chin. The level flutes' hands sit just
                // behind a tube that runs out past the right of the head, so
                // they are only checked to be clear of the head's width.
                if (
                    state === "up" &&
                    (family === "flute" || family === "piccolo")
                ) {
                    expect(h.right.wrist[0]).toBeLessThan(-0.15);
                    expect(h.left.wrist[2]).toBeGreaterThan(0.08);
                    continue;
                }
                expect(h.right.wrist[2]).toBeGreaterThan(0.09);
                expect(h.left.wrist[2]).toBeGreaterThan(0.09);
            }
    });
});

describe("woodwind and battery holds", () => {
    it.each(["flute", "piccolo"] as const)(
        "%s up: level and parallel to the shoulders",
        (family) => {
            expect(hold(family, "up").instrument.bellAxis).toEqual([-1, 0, 0]);
        },
    );

    it("flute: to the player's right at the lips, keys up", () => {
        const h = hold("flute", "up");
        expect(h.instrument.bellAxis[0]).toBeLessThan(-0.8); // the tube runs to the right
        expect(h.instrument.origin[1]).toBeGreaterThan(1.5);
        expect(h.right.wrist[0]).toBeLessThan(h.left.wrist[0] - 0.15);
    });

    it("piccolo: the flute's hold with the hands close together on the short body", () => {
        for (const state of ["up"] as const) {
            const p = hold("piccolo", state);
            const f = hold("flute", state);
            expect(p.instrument).toEqual(f.instrument);
            // the right wrist sits along the tube no further than the piccolo's 0.29 m reach
            const o = p.instrument.origin;
            const along = p.instrument.bellAxis.reduce(
                (s, v, i) => s + v * (p.right.wrist[i] - o[i]),
                0,
            );
            expect(along).toBeGreaterThan(0.15);
            expect(along).toBeLessThan(0.29);
        }
    });

    /** A point `s` meters along the instrument from its origin. */
    const along = (family: HoldFamily, state: "up" | "carry", s: number) => {
        const { origin, bellAxis } = hold(family, state).instrument;
        const l = Math.hypot(...bellAxis);
        return origin.map((o, i) => o + (bellAxis[i] / l) * s);
    };

    it.each(["up"] as const)(
        "flute %s: both wrists under the tube, the tube across the knuckles",
        (state) => {
            const h = hold("flute", state);
            const left = along("flute", state, 0.2);
            const right = along("flute", state, 0.42);
            // the hands can't curl: each wrist sits under the tube and the
            // tube lies across the knuckles, 0.1 m up the fingers
            expect(dist(h.left.wrist, left)).toBeLessThan(0.14);
            expect(dist(h.right.wrist, right)).toBeLessThan(0.14);
            expect(h.left.wrist[1]).toBeLessThan(left[1] - 0.03);
            expect(h.right.wrist[1]).toBeLessThan(right[1] - 0.03);
            for (const arm of [h.left, h.right])
                expect(arm.fingers[1]).toBeGreaterThan(0.6);
            // the left elbow below the hand, the forearm rising to it
            expect(h.left.elbow[1]).toBeLessThan(h.left.wrist[1]);
        },
    );

    it.each(["up"] as const)(
        "piccolo %s: both hands under the short tube, fingers up and over",
        (state) => {
            const h = hold("piccolo", state);
            expect(
                dist(h.left.wrist, along("piccolo", state, 0.12)),
            ).toBeLessThan(0.14);
            expect(
                dist(h.right.wrist, along("piccolo", state, 0.24)),
            ).toBeLessThan(0.14);
            for (const arm of [h.left, h.right])
                expect(arm.fingers[1]).toBeGreaterThan(0.6);
        },
    );

    it.each(["flute", "piccolo", "clarinet", "bassClarinet", "sax"] as const)(
        "%s up: each hand carries straight on from the forearm, bent 30 degrees at most",
        (family) => {
            // a stiff mitt reads as a hand only with a nearly straight wrist
            // (woodwind wrist study, 2026-11-10)
            const h = hold(family, "up");
            for (const arm of [h.left, h.right]) {
                const fore = arm.wrist.map((w, i) => w - arm.elbow[i]);
                const l = Math.hypot(...fore);
                const cos =
                    fore.reduce((s, v, i) => s + v * arm.fingers[i], 0) / l;
                expect((Math.acos(cos) * 180) / Math.PI).toBeLessThan(30);
            }
        },
    );

    it.each(["up"] as const)(
        "clarinet %s: hands wrap the joints from the sides, fingers across the front",
        (state) => {
            const h = hold("clarinet", state);
            expect(
                dist(h.left.wrist, along("clarinet", state, 0.22)),
            ).toBeLessThan(0.1);
            expect(
                dist(h.right.wrist, along("clarinet", state, 0.4)),
            ).toBeLessThan(0.1);
            expect(h.left.wrist[0]).toBeGreaterThan(0.04);
            expect(h.right.wrist[0]).toBeLessThan(-0.04);
            // the hands come in from the sides toward the tube
            expect(h.left.fingers[0]).toBeLessThan(-0.3);
            expect(h.right.fingers[0]).toBeGreaterThan(0.3);
        },
    );

    it("flute: the lip plate and the keys (+Y, in line) face up, tipped a little back to the lips", () => {
        for (const family of ["flute", "piccolo"] as const) {
            const { capsAxis: c, origin } = hold(family, "up").instrument;
            const l = Math.hypot(...c);
            expect(c[1] / l).toBeGreaterThan(0.9);
            expect(c[2] / l).toBeLessThan(0);
            // the tube sits just under the lower lip, not at the nose
            expect(origin[1]).toBeLessThan(LIPS[1]);
            expect(origin[1]).toBeGreaterThan(LIPS[1] - 0.03);
        }
    });

    it("clarinet: down the center line, angled out", () => {
        const h = hold("clarinet", "up");
        expect(h.instrument.bellAxis[1]).toBeLessThan(-0.7);
        expect(h.instrument.bellAxis[2]).toBeGreaterThan(0.2);
        expect(h.right.wrist[1]).toBeLessThan(h.left.wrist[1]);
    });

    it("sax: body straight down in front, neck at the lips", () => {
        const h = hold("sax", "up");
        expect(h.instrument.origin[1]).toBeGreaterThan(1.45);
        expect(h.instrument.bellAxis[1]).toBeLessThan(-0.95);
        expect(Math.abs(h.instrument.bellAxis[0])).toBeLessThan(0.1);
    });

    it("drums ride the chest with the hands over the heads", () => {
        for (const family of ["snare", "tenors", "bass"] as const) {
            const h = hold(family, "up");
            expect(h.instrument.origin[1]).toBeLessThan(1.2);
            expect(h.instrument.origin[2]).toBeGreaterThan(0.2);
            expect(h.right.wrist[1]).toBeGreaterThan(h.instrument.origin[1]);
        }
        expect(hold("tenors", "up").right.wrist[0]).toBeLessThan(
            hold("snare", "up").right.wrist[0],
        );
        expect(hold("bass", "up").instrument.bellAxis[0]).not.toBe(0); // the heads face sideways
    });

    it("bass drummers hold the mallets at the lower ribs beside the heads, mallets steep", () => {
        const h = hold("bass", "up");
        for (const arm of [h.right, h.left]) {
            expect(arm.wrist[1]).toBeLessThan(1.15);
            expect(Math.abs(arm.wrist[0])).toBeGreaterThan(0.2);
            expect(arm.wrist[2]).toBeGreaterThan(0.18);
            expect(arm.fingers[2]).toBeGreaterThan(0.7);
            expect(arm.fingers[1]).toBeGreaterThan(0.4);
        }
    });

    it("snare and tenor hands keep a matched grip: palms down, forearms forward", () => {
        for (const family of ["snare", "tenors"] as const) {
            const h = hold(family, "up");
            for (const arm of [h.right, h.left]) {
                expect(Math.abs(arm.fingers[1])).toBeLessThan(0.2); // level, not pointing down
                expect(arm.fingers[2]).toBeGreaterThan(0.75); // forward
                expect(arm.wrist[1]).toBeGreaterThan(1.04);
                expect(arm.wrist[1]).toBeLessThan(1.12);
            }
            // the sticks angle in from each side
            expect(h.right.fingers[0]).toBeGreaterThan(0.1);
            expect(h.left.fingers[0]).toBeLessThan(-0.1);
            // the upper arms hang close to the ribs, not winged (drum corps photos)
            for (const [arm, sx] of [
                [h.right, -0.185],
                [h.left, 0.185],
            ] as const)
                expect(Math.abs(arm.elbow[0] - sx)).toBeLessThan(0.06);
        }
    });

    it("drums have one hold", () => {
        for (const family of ["snare", "tenors", "bass", "cymbals"] as const)
            expect(hold(family, "carry")).toEqual({
                ...hold(family, "up"),
                state: "carry",
            });
    });
});

/**
 * The woodwinds at carry and trail, in the owner's words (2026-10-09,
 * docs/3d/technique.md "Woodwind holds").
 */
describe("woodwind carry and trail", () => {
    const EYE = 1.62;
    const SHOULDER_L = [-SHOULDER_R[0], SHOULDER_R[1], SHOULDER_R[2]] as const;
    /**
     * The first key's distance along the instrument from its origin
     * (woodwinds.ts): the flute's C# 0.035 below its 0.21 head joint, the
     * piccolo's at 0.6 scale below its 0.11 head joint, the clarinet's throat
     * Ab and the soprano sax's C, the top of the left hand's stack.
     */
    const FIRST_KEY = {
        flute: [["flute", 0.2]],
        piccolo: [["piccolo", 0.101]],
        clarinet: [
            ["clarinet", 0.168],
            ["sopranoSax", 0.145],
        ],
    } as const;
    const STRAIGHT = ["flute", "piccolo", "clarinet"] as const;
    const BENT = ["sax", "bassClarinet"] as const;
    const dot = (a: readonly number[], b: readonly number[]) =>
        a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a: readonly number[], b: readonly number[]) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
    /** The point `s` along the instrument's +Z from its origin. */
    const on = (family: HoldFamily, state: "carry" | "trail", s: number) => {
        const { origin, bellAxis } = hold(family, state).instrument;
        return origin.map((o, i) => o + bellAxis[i] * s);
    };
    /** The distance from `p` to the instrument's +Z line through `from`. */
    const offLine = (
        p: readonly number[],
        from: readonly number[],
        axis: readonly number[],
    ) => {
        const d = p.map((v, i) => v - from[i]);
        const k = dot(d, axis);
        return Math.hypot(...d.map((v, i) => v - axis[i] * k));
    };

    it.each([...STRAIGHT, ...BENT])(
        "%s: every carry and trail elbow is exactly reachable",
        (family) => {
            for (const state of ["carry", "trail"] as const) {
                const h = hold(family, state);
                for (const [shoulder, arm] of [
                    [SHOULDER_R, h.right],
                    [SHOULDER_L, h.left],
                ] as const) {
                    expect(dist(shoulder, arm.elbow)).toBeCloseTo(UPPER, 2);
                    expect(dist(arm.elbow, arm.wrist)).toBeCloseTo(FOREARM, 2);
                }
            }
        },
    );

    it.each(STRAIGHT)(
        "%s carry: vertical in front of the body, head joint up, keys forward",
        (family) => {
            const { origin, bellAxis, capsAxis } = hold(
                family,
                "carry",
            ).instrument;
            expect(bellAxis[1]).toBeLessThan(-0.99);
            expect(capsAxis[2]).toBeGreaterThan(0.99);
            expect(Math.abs(origin[0])).toBeLessThan(0.03);
            expect(origin[2]).toBeGreaterThan(0.17);
        },
    );

    it.each(STRAIGHT)("%s carry: the first key at eye level", (family) => {
        for (const [, s] of FIRST_KEY[family])
            expect(Math.abs(on(family, "carry", s)[1] - EYE)).toBeLessThan(
                0.03,
            );
    });

    it.each(STRAIGHT)(
        "%s carry: the hands make a triangle, left hand above the right",
        (family) => {
            const h = hold(family, "carry");
            const { origin, bellAxis } = h.instrument;
            for (const [arm, side] of [
                [h.left, 1],
                [h.right, -1],
            ] as const) {
                // on the tube: the wrist a hand's length off it, the fingers reaching it
                const off = offLine(arm.wrist, origin, bellAxis);
                expect(off).toBeGreaterThan(0.07);
                expect(off).toBeLessThan(0.14);
                const tip = arm.wrist.map((w, i) => w + arm.fingers[i] * 0.12);
                expect(offLine(tip, origin, bellAxis)).toBeLessThan(0.03);
                // elbows out, forearms angled in and up to the tube
                expect(arm.elbow[0] * side).toBeGreaterThan(0.26);
                expect(arm.wrist[0] * side).toBeGreaterThan(0.03);
                expect(Math.abs(arm.wrist[0])).toBeLessThan(
                    Math.abs(arm.elbow[0]) - 0.1,
                );
                expect(arm.wrist[1]).toBeGreaterThan(arm.elbow[1]);
                expect(arm.fingers[0] * side).toBeLessThan(-0.5);
            }
            expect(h.left.wrist[1]).toBeGreaterThan(h.right.wrist[1] + 0.08);
        },
    );

    it("bassClarinet carry: vertical, turned 90 degrees so the crook and bell sit at the right side", () => {
        const { origin, bellAxis, capsAxis } = hold(
            "bassClarinet",
            "carry",
        ).instrument;
        expect(bellAxis[1]).toBeLessThan(-0.99);
        // the keys face the performer's right, a quarter turn from the playing hold's front
        expect(capsAxis[0]).toBeLessThan(-0.99);
        expect(cross(capsAxis, bellAxis)[2]).toBeGreaterThan(0.99);
        // the mouthpiece about eye level
        expect(Math.abs(origin[1] - EYE)).toBeLessThan(0.03);
        expect(origin[2]).toBeGreaterThan(0.17);
    });

    it("sax carry: vertical as it is played, the model's own body turn putting the bell in front", () => {
        const { origin, bellAxis, capsAxis } = hold("sax", "carry").instrument;
        expect(bellAxis[1]).toBeLessThan(-0.99);
        // the neck runs straight back toward the face, as in the playing hold
        expect(capsAxis[2]).toBeGreaterThan(0.99);
        expect(Math.abs(origin[0])).toBeLessThan(0.01);
        // the mouthpiece about eye level, clear of the face
        expect(Math.abs(origin[1] - EYE)).toBeLessThan(0.03);
        expect(origin[2]).toBeGreaterThan(0.12);
    });

    it.each(BENT)(
        "%s carry: the hands stay where they play, left hand high, right hand low",
        (family) => {
            const h = hold(family, "carry");
            expect(h.left.wrist[0]).toBeGreaterThan(0.05);
            expect(h.right.wrist[0]).toBeLessThan(-0.05);
            expect(h.left.wrist[1]).toBeGreaterThan(h.right.wrist[1] + 0.1);
            expect(h.left.fingers[0]).toBeLessThan(-0.5);
            expect(h.right.fingers[0]).toBeGreaterThan(0.5);
            for (const arm of [h.left, h.right])
                expect(arm.wrist[2]).toBeGreaterThan(0.17);
        },
    );

    it.each([...STRAIGHT, ...BENT])(
        "%s trail: the arms of the brass trail, the instrument in the right hand",
        (family) => {
            const h = hold(family, "trail");
            const brass = hold("trumpet", "trail");
            expect(h.left).toEqual(brass.left);
            expect(h.right).toEqual(brass.right);
            expect(h.left.fingers).toEqual([0, -1, 0]);
            expect(h.right.wrist[0]).toBeLessThan(-0.2);
            expect(h.right.wrist[1]).toBeLessThan(1.0);
        },
    );

    it.each(STRAIGHT)(
        "%s trail: vertical through the right fist, head joint toward the ground",
        (family) => {
            const h = hold(family, "trail");
            const { origin, bellAxis } = h.instrument;
            // +Z runs from the head joint up: the head joint is the low end
            expect(bellAxis[1]).toBeGreaterThan(0.99);
            expect(origin[1]).toBeLessThan(h.right.wrist[1] - 0.15);
            // the fist wraps the tube: its axis within a fist's half-width
            const fist = h.right.wrist.map(
                (w, i) => w + h.right.fingers[i] * 0.07,
            );
            expect(offLine(fist, origin, bellAxis)).toBeLessThan(0.07);
        },
    );

    it.each(BENT)(
        "%s trail: the long body level along front to back at the right side",
        (family) => {
            const { origin, bellAxis } = hold(family, "trail").instrument;
            expect(Math.abs(bellAxis[1])).toBeLessThan(0.01);
            expect(Math.abs(bellAxis[2])).toBeGreaterThan(0.99);
            expect(origin[0]).toBeLessThan(-0.1);
            expect(origin[1]).toBeLessThan(1.05);
        },
    );

    it("rifle: level across the waist in every state, top up", () => {
        for (const state of HOLD_STATES) {
            const h = hold("rifle", state);
            expect(h.instrument.bellAxis).toEqual([1, 0, 0]);
            expect(h.instrument.capsAxis).toEqual([0, 1, 0]);
            // both hands on it at the same height, below the chest
            expect(h.left.wrist[1]).toBeCloseTo(h.right.wrist[1], 6);
            expect(h.right.wrist[1]).toBeLessThan(1.15);
            expect(h.left.wrist[0]).toBeGreaterThan(h.right.wrist[0]);
        }
    });

    it("swing flags wait at down 45: one in the right hand, a pair mirrored", () => {
        const shoulderR = [-0.185, 1.397];
        for (const state of HOLD_STATES) {
            const one = hold("swingFlag", state);
            const pair = hold("doubleSwingFlag", state);
            // the right arm out and down at 45 degrees
            const [x, y] = one.right.wrist;
            const out = shoulderR[0] - x;
            const down = shoulderR[1] - y;
            expect(Math.atan2(down, out)).toBeCloseTo(Math.PI / 4, 1);
            // the left arm hangs at the side with one flag
            expect(one.left.fingers[1]).toBeLessThan(-0.9);
            // a pair: the left arm the right one's mirror image
            for (const k of ["elbow", "wrist", "fingers"] as const) {
                const r = pair.right[k];
                const l = pair.left[k];
                expect(l[0]).toBeCloseTo(-r[0], 6);
                expect(l[1]).toBeCloseTo(r[1], 6);
                expect(l[2]).toBeCloseTo(r[2], 6);
            }
            // the pole runs on along the arm
            expect(one.instrument.bellAxis).toEqual(one.right.fingers);
        }
    });
});
