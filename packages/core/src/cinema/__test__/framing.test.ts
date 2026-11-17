import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    DEFAULT_LEAD_MS,
    MIN_SUBJECT_RADIUS,
    SMOOTH_SAMPLES,
    SMOOTH_WINDOW_MS,
    TIGHTNESS_SCALE,
    boundsOf,
    smoothedBounds,
    type CinemaContext,
    type CinemaSubject,
    type WorldPoint,
} from "../../index";

const footprint = { minX: -54.86, maxX: 54.86, minZ: -48.77, maxZ: 0 };

/** A context whose subjects are whatever `points` returns at a time. */
const contextOf = (
    points: (ms: number, subject: CinemaSubject) => readonly WorldPoint[],
): CinemaContext => ({
    footprint,
    stepMeters: 0.5715,
    aspect: 16 / 9,
    subjectPoints: (subject, ms) => points(ms, subject),
});

const band: CinemaSubject = { kind: "band" };

/** Two marchers 6 m by 8 m apart, moving 2 m/s toward side 2 and 1 m/s upfield. */
const moving = contextOf((ms) => {
    const dx = (ms / 1000) * 2;
    const dz = (ms / 1000) * -1;
    return [
        { x: dx, z: dz },
        { x: 6 + dx, z: -8 + dz },
    ];
});

describe("boundsOf", () => {
    it("falls back to the whole field when there are no points", () => {
        const bounds = boundsOf([], footprint);
        expect(bounds.cx).toBeCloseTo(0, 6);
        expect(bounds.cz).toBeCloseTo(-24.385, 6);
        expect(bounds.radius).toBeCloseTo(Math.hypot(54.86, 24.385), 6);
    });

    it("gives a single point the minimum radius", () => {
        expect(MIN_SUBJECT_RADIUS).toBe(1.5);
        expect(boundsOf([{ x: 3, z: -4 }], footprint)).toEqual({
            cx: 3,
            cz: -4,
            radius: 1.5,
        });
    });

    it("gives marchers on one dot the minimum radius", () => {
        const dot = { x: 3, z: -4 };
        expect(boundsOf([dot, dot, dot], footprint).radius).toBe(1.5);
    });

    it("is the circle around the points' bounding box", () => {
        expect(
            boundsOf(
                [
                    { x: 0, z: 0 },
                    { x: 6, z: -8 },
                    { x: 2, z: -1 },
                ],
                footprint,
            ),
        ).toEqual({ cx: 3, cz: -4, radius: 5 });
    });

    it("ignores points that are not finite", () => {
        const bounds = boundsOf(
            [
                { x: Number.NaN, z: 0 },
                { x: 3, z: -4 },
            ],
            footprint,
        );
        expect(bounds).toEqual({ cx: 3, cz: -4, radius: 1.5 });
        expect(
            boundsOf([{ x: Number.NaN, z: Number.NaN }], footprint).cz,
        ).toBeCloseTo(-24.385, 6);
    });
});

describe("smoothedBounds", () => {
    it("samples a one second window nine times", () => {
        expect(SMOOTH_WINDOW_MS).toBe(1000);
        expect(SMOOTH_SAMPLES).toBe(9);
        expect(DEFAULT_LEAD_MS).toBe(250);
        const times: number[] = [];
        const ctx = contextOf((ms) => {
            times.push(ms);
            return [{ x: 0, z: 0 }];
        });
        smoothedBounds(band, 2000, ctx, 0);
        expect(times).toEqual([
            1500, 1625, 1750, 1875, 2000, 2125, 2250, 2375, 2500,
        ]);
    });

    it("returns the exact center of a subject at constant velocity with no lead", () => {
        const bounds = smoothedBounds(band, 3000, moving, 0);
        expect(bounds.cx).toBeCloseTo(3 + 6, 9);
        expect(bounds.cz).toBeCloseTo(-4 - 3, 9);
        expect(bounds.radius).toBeCloseTo(5, 9);
    });

    it("leads a moving subject by a quarter second by default", () => {
        const led = smoothedBounds(band, 3000, moving);
        expect(led.cx).toBeCloseTo(3 + 6.5, 9);
        expect(led.cz).toBeCloseTo(-4 - 3.25, 9);
        const explicit = smoothedBounds(band, 3000, moving, 250);
        expect(explicit).toEqual(led);
    });

    it("gives the same result whatever order the times are asked in", () => {
        fc.assert(
            fc.property(
                fc.array(fc.integer({ min: -2000, max: 600_000 }), {
                    minLength: 1,
                    maxLength: 30,
                }),
                fc.integer(),
                (times, seed) => {
                    const sorted = [...times].sort((a, b) => a - b);
                    const inOrder = new Map(
                        sorted.map((ms) => [
                            ms,
                            smoothedBounds(band, ms, moving),
                        ]),
                    );
                    // A deterministic shuffle from the seed.
                    const shuffled = times
                        .map((ms, i) => ({
                            ms,
                            key: Math.sin(seed + i * 12.9898) * 43758.5453,
                        }))
                        .sort((a, b) => a.key - b.key);
                    for (const { ms } of shuffled)
                        expect(smoothedBounds(band, ms, moving)).toEqual(
                            inOrder.get(ms),
                        );
                },
            ),
        );
    });

    it("moves continuously across a subject that jumps", () => {
        const step = 40;
        const jumping = contextOf((ms) => [{ x: ms < 0 ? 0 : step, z: -10 }]);
        const at = (ms: number) => smoothedBounds(band, ms, jumping, 0).cx;
        expect(at(-600)).toBe(0);
        expect(at(600)).toBeCloseTo(step, 9);
        let previous = at(-500);
        for (let ms = -450; ms <= 500; ms += 50) {
            const next = at(ms);
            expect(next).toBeGreaterThanOrEqual(previous);
            expect(next - previous).toBeLessThanOrEqual(0.3 * step);
            previous = next;
        }
    });

    it("frames the whole field when nobody matches", () => {
        const empty = contextOf(() => []);
        const bounds = smoothedBounds(
            { kind: "section", section: "Tuba" },
            1000,
            empty,
        );
        expect(bounds.cx).toBeCloseTo(0, 6);
        expect(bounds.cz).toBeCloseTo(-24.385, 6);
        expect(Number.isFinite(bounds.radius)).toBe(true);
        expect(bounds.radius).toBeGreaterThan(40);
    });

    it("asks for the subject it was given", () => {
        const asked: CinemaSubject[] = [];
        const ctx = contextOf((_ms, subject) => {
            asked.push(subject);
            return [];
        });
        const marcher: CinemaSubject = { kind: "marcher", marcherId: 7 };
        smoothedBounds(marcher, 0, ctx);
        expect(new Set(asked)).toEqual(new Set([marcher]));
    });

    it("uses every marcher for the band and its center", () => {
        const asked: CinemaSubject[] = [];
        const ctx = contextOf((_ms, subject) => {
            asked.push(subject);
            return [
                { x: 0, z: 0 },
                { x: 0, z: -2 },
                { x: 6, z: -8 },
            ];
        });
        const whole = smoothedBounds(band, 0, ctx);
        const center = smoothedBounds({ kind: "center" }, 0, ctx);
        expect(asked.every((subject) => subject.kind === "band")).toBe(true);
        expect(whole.cx).toBeCloseTo(3, 9);
        expect(whole.cz).toBeCloseTo(-4, 9);
        // The center sits on the centroid, where the marchers are.
        expect(center.cx).toBeCloseTo(2, 9);
        expect(center.cz).toBeCloseTo(-10 / 3, 9);
        expect(center.radius).toBeCloseTo(whole.radius, 9);
    });

    it("resolves regions and spots without asking for points", () => {
        const ctx = contextOf(() => {
            throw new Error("regions and spots have no marchers");
        });
        expect(
            smoothedBounds(
                { kind: "region", minX: -10, maxX: 2, minZ: -20, maxZ: -4 },
                500,
                ctx,
            ),
        ).toEqual({ cx: -4, cz: -12, radius: 10 });
        expect(smoothedBounds({ kind: "spot", x: 5, z: -6 }, 500, ctx)).toEqual(
            {
                cx: 5,
                cz: -6,
                radius: 1.5,
            },
        );
    });
});

describe("TIGHTNESS_SCALE", () => {
    it("gets tighter from wide to close-up", () => {
        expect(TIGHTNESS_SCALE).toEqual({
            wide: 1.6,
            medium: 1,
            tight: 0.75,
            closeUp: 0.45,
        });
    });
});
