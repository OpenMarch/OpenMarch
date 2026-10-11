import { describe, expect, it } from "vitest";
import { HOLD_STATES, hold, holdId, type HoldFamily } from "../holds";

const SHOULDER_R = [-0.185, 1.397, -0.005] as const;
const UPPER = 0.205;
const FOREARM = 0.264;
const dist = (a: readonly number[], b: readonly number[]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const FAMILIES: HoldFamily[] = [
    "brass",
    "trombone",
    "contra",
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
        expect(holdId("brass", "up")).toBe("brass:up");
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

    it("brass up: bell forward at face height, mouthpiece at the mouth", () => {
        const h = hold("brass", "up");
        expect(h.instrument.bellAxis).toEqual([0, 0, 1]);
        // the mouthpiece (behind the grip, level with it) reaches the lips
        expect(h.instrument.origin[1]).toBeGreaterThan(1.5);
        expect(h.instrument.origin[1]).toBeLessThan(1.62);
        // elbows out: wider than the shoulders
        expect(h.right.elbow[0]).toBeLessThan(SHOULDER_R[0] - 0.08);
    });

    it("brass carry: mouthpiece at eye level, bell to the ground", () => {
        const h = hold("brass", "carry");
        expect(h.instrument.bellAxis).toEqual([0, -1, 0]);
        // the mouthpiece sits about 0.17 above the grip: eye level
        expect(h.instrument.origin[1]).toBeGreaterThan(1.45);
    });

    it("brass trail: right arm down the side, bell backward, left arm straight", () => {
        const h = hold("brass", "trail");
        expect(h.instrument.bellAxis).toEqual([0, 0, -1]);
        expect(h.right.wrist[1]).toBeLessThan(1.0);
        expect(h.left.wrist[1]).toBeLessThan(1.0);
        expect(Math.abs(h.left.wrist[0] - 0.2)).toBeLessThan(0.08);
    });

    it("contra up: bell forward, valves high in front of the face", () => {
        const h = hold("contra", "up");
        expect(h.instrument.bellAxis).toEqual([0, 0, 1]);
        expect(h.instrument.origin[1]).toBeGreaterThan(1.5);
        expect(h.instrument.origin[1]).toBeLessThan(1.7);
        expect(h.instrument.origin[2]).toBeGreaterThan(0.1);
        expect(h.instrument.origin[2]).toBeLessThan(0.3);
        // the loop plane lies over the left shoulder, clear of the head (half-width 0.1 plus the tube)
        expect(h.instrument.origin[0]).toBeGreaterThanOrEqual(0.14);
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

describe("woodwind and battery holds", () => {
    it("flute: to the player's right at the lips, keys forward", () => {
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
        "flute %s: both hands under the tube, fingers wrapping up and over it",
        (state) => {
            const h = hold("flute", state);
            const left = along("flute", state, 0.2);
            const right = along("flute", state, 0.42);
            // the hands can't curl, so the wrists sit a hand's length below
            // and the fingertips just reach over the top of the tube
            expect(dist(h.left.wrist, left)).toBeLessThan(0.14);
            expect(dist(h.right.wrist, right)).toBeLessThan(0.14);
            expect(h.left.wrist[1]).toBeLessThan(left[1] - 0.09);
            expect(h.right.wrist[1]).toBeLessThan(right[1] - 0.09);
            for (const arm of [h.left, h.right])
                expect(arm.fingers[1]).toBeGreaterThan(0.6);
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

    it.each(["up"] as const)(
        "clarinet %s: hands wrap the joints from the sides, fingers across the front",
        (state) => {
            const h = hold("clarinet", state);
            expect(
                dist(h.left.wrist, along("clarinet", state, 0.2)),
            ).toBeLessThan(0.1);
            expect(
                dist(h.right.wrist, along("clarinet", state, 0.4)),
            ).toBeLessThan(0.1);
            expect(h.left.wrist[0]).toBeGreaterThan(0.04);
            expect(h.right.wrist[0]).toBeLessThan(-0.04);
            expect(h.left.fingers[0]).toBeLessThan(-0.5);
            expect(h.right.fingers[0]).toBeGreaterThan(0.5);
        },
    );

    it("flute: the lip plate (−Y) faces back at the lips, level", () => {
        const c = hold("flute", "up").instrument.capsAxis;
        expect(c[2]).toBeGreaterThan(0.95);
        expect(Math.abs(c[1])).toBeLessThan(0.1);
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

    it("bass drummers hold the mallets at the hips beside the heads, forearms forward", () => {
        const h = hold("bass", "up");
        for (const arm of [h.right, h.left]) {
            expect(arm.wrist[1]).toBeLessThan(1.15);
            expect(Math.abs(arm.wrist[0])).toBeGreaterThan(0.2);
            expect(arm.wrist[2]).toBeGreaterThan(0.18);
            expect(arm.fingers[2]).toBeGreaterThan(0.8);
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
            expect(h.right.fingers[0]).toBeGreaterThan(0.4);
            expect(h.left.fingers[0]).toBeLessThan(-0.4);
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

    it.each(BENT)(
        "%s carry: vertical, turned 90 degrees so the bell offset (+X) points forward",
        (family) => {
            const { origin, bellAxis, capsAxis } = hold(
                family,
                "carry",
            ).instrument;
            expect(bellAxis[1]).toBeLessThan(-0.99);
            // the keys face the performer's right, a quarter turn from the playing hold's front
            expect(capsAxis[0]).toBeLessThan(-0.99);
            // X = Y × Z: the instrument's +X, where the sax keeps its bell, is the body's front
            expect(cross(capsAxis, bellAxis)[2]).toBeGreaterThan(0.99);
            // the mouthpiece about eye level
            expect(Math.abs(origin[1] - EYE)).toBeLessThan(0.03);
            expect(origin[2]).toBeGreaterThan(0.17);
        },
    );

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
            const brass = hold("brass", "trail");
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
