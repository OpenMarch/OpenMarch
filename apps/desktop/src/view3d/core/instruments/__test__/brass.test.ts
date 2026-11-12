// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bounds, triangleCount } from "../mesh";
import {
    BRASS_DIMENSIONS,
    BRASS_OPEN_LENGTH,
    brassHorn,
    brassModel,
    type BrassModelId,
} from "../brass";
import { bellFlare, bentPath, VALVE_SLIDE_RATIO } from "../hornKit";

const IDS: BrassModelId[] = [
    "trumpet",
    "mellophone",
    "baritone",
    "euphonium",
    "trombone",
    "bassTrombone",
    "contra",
    "sousaphone",
];
/** The horns with three piston valves. */
const VALVED = IDS.filter((id) => id !== "trombone" && id !== "bassTrombone");

describe("brass models", () => {
    it.each(IDS)("%s stays within the high and low triangle budgets", (id) => {
        const high = triangleCount(brassModel(id, "high").pieces);
        expect(high).toBeGreaterThanOrEqual(8000);
        expect(high).toBeLessThanOrEqual(18000);
        const low = triangleCount(brassModel(id, "low").pieces);
        expect(low).toBeGreaterThanOrEqual(1500);
        expect(low).toBeLessThanOrEqual(4000);
    });

    it.each(IDS.filter((id) => id !== "sousaphone"))(
        "%s has its length along +Z",
        (id) => {
            const { min, max } = bounds(brassModel(id).pieces);
            expect(
                Math.abs(max[2] - min[2] - BRASS_DIMENSIONS[id].length),
            ).toBeLessThan(0.03);
        },
    );

    it.each(IDS)(
        "%s has a round bell of its diameter, opening forward",
        (id) => {
            const want = BRASS_DIMENSIONS[id].bell;
            // the bell is the one piece as wide as it is tall at that size
            const bells = brassModel(id).pieces.filter((p) => {
                const { min, max } = bounds([p]);
                return (
                    Math.abs(max[0] - min[0] - want) < 0.03 &&
                    Math.abs(max[1] - min[1] - want) < 0.03
                );
            });
            expect(bells.length).toBe(1);
        },
    );

    it.each(IDS)(
        "%s is finite, with unit normals, colored, and uses instrument parts only",
        (id) => {
            for (const detail of ["high", "low"] as const)
                for (const p of brassModel(id, detail).pieces) {
                    expect([16, 18, 22, 23]).toContain(p.part);
                    expect(p.colors?.length).toBe(p.positions.length);
                    expect(p.positions.every(Number.isFinite)).toBe(true);
                    for (let i = 0; i < p.normals.length; i += 3)
                        expect(
                            Math.hypot(
                                p.normals[i],
                                p.normals[i + 1],
                                p.normals[i + 2],
                            ),
                        ).toBeCloseTo(1, 4);
                }
        },
    );

    it.each(VALVED)(
        "%s has pearl buttons above the right hand's grip",
        (id) => {
            const pearls = brassModel(id).pieces.filter((p) => p.part === 23);
            expect(pearls.length).toBeGreaterThanOrEqual(3);
            // the grip is the origin: the buttons stand within a hand of it
            const { min, max } = bounds(pearls);
            expect(Math.hypot(min[0], min[2])).toBeLessThan(0.12);
            expect(Math.hypot(max[0], max[2])).toBeLessThan(0.12);
        },
    );

    it("keeps the mouthpiece rims where the brass holds bring them to the lips", () => {
        // behind the grip, level with the leadpipe
        const rims: Partial<Record<BrassModelId, number>> = {
            trumpet: -0.197,
            mellophone: -0.1925,
            baritone: -0.2232,
            euphonium: -0.2376,
        };
        for (const [id, z] of Object.entries(rims)) {
            const m = brassModel(id as BrassModelId);
            expect(m.mouthpiece[0]).toBeCloseTo(0, 6);
            expect(m.mouthpiece[1]).toBeCloseTo(0.018, 6);
            expect(m.mouthpiece[2]).toBeCloseTo(z, 6);
            // the rim is the rearmost point
            expect(bounds(m.pieces).min[2]).toBeCloseTo(z, 2);
        }
        // the trombone's rim is on the slide's right-hand tube, behind the brace
        const trombone = brassModel("trombone");
        expect(trombone.mouthpiece[0]).toBeLessThan(0);
        expect(trombone.mouthpiece[2]).toBeCloseTo(-0.135, 2);
    });

    it("lays the contra's loop behind the grip with the bell forward", () => {
        const { min, max } = bounds(brassModel("contra").pieces);
        expect(min[2]).toBeLessThan(-0.5);
        expect(max[2]).toBeGreaterThan(0.2);
        // the bell sits above the loop's centerline, not overhead
        expect(max[1]).toBeLessThan(0.45);
    });

    it("stands the sousaphone's bell over the head, its hoop round the body", () => {
        const { min, max } = bounds(brassModel("sousaphone").pieces);
        // from the valves at the chest: the bell's top well overhead, the
        // hoop down past the hip, and wide enough to pass round a torso
        expect(max[1]).toBeGreaterThan(0.9);
        expect(min[1]).toBeLessThan(-0.3);
        expect(max[0] - min[0]).toBeGreaterThan(0.7);
    });
});

describe("brass tubing is held to its pitch", () => {
    it.each(IDS)("%s is one air path about as long as its key needs", (id) => {
        const { main } = brassHorn(id).tubing;
        const open = BRASS_OPEN_LENGTH[id];
        // a centerline runs a little under the sounding length
        expect(main).toBeGreaterThan(open * 0.92);
        expect(main).toBeLessThan(open * 1.03);
        // and both detail levels trace the same horn
        expect(brassHorn(id, "low").tubing.main).toBeCloseTo(main, 1);
    });

    it.each(VALVED)(
        "%s: the second valve adds a half step, the first a whole step, the third a step and a half",
        (id) => {
            const { valves } = brassHorn(id).tubing;
            const open = BRASS_OPEN_LENGTH[id];
            for (const n of [1, 2, 3] as const) {
                const want = open * VALVE_SLIDE_RATIO[n];
                expect(Math.abs(valves[n - 1] - want) / want).toBeLessThan(
                    0.025,
                );
            }
            // so the loops stand to each other as the intervals do
            expect(valves[1]).toBeLessThan(valves[0]);
            expect(valves[0]).toBeLessThan(valves[2]);
        },
    );

    it("gives the tenor trombone no valves and the bass an F attachment a fourth long", () => {
        expect(brassHorn("trombone").tubing.valves).toEqual([0, 0, 0]);
        const [attachment, second, third] =
            brassHorn("bassTrombone").tubing.valves;
        const want = BRASS_OPEN_LENGTH.bassTrombone * (2 ** (5 / 12) - 1);
        expect(Math.abs(attachment - want) / want).toBeLessThan(0.025);
        expect([second, third]).toEqual([0, 0]);
    });
});

describe("horn kit", () => {
    it("flares a bell late: slim through the throat, the rim turned out", () => {
        const flare = bellFlare([0, 0.02], [0.4, 0.13]);
        expect(flare[0]).toEqual([0, 0.02]);
        const [zRim, rRim] = flare[flare.length - 1];
        expect(zRim).toBeCloseTo(0.4, 9);
        expect(rRim).toBeCloseTo(0.13, 9);
        // halfway along it has opened far less than a cone would have
        const at = (z: number) => {
            const i = flare.findIndex((f) => f[0] >= z);
            const [z0, r0] = flare[i - 1];
            const [z1, r1] = flare[i];
            return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
        };
        expect(at(0.2)).toBeLessThan(0.02 + (0.13 - 0.02) * 0.2);
        // and it is still opening faster at the rim than anywhere before
        const slope = (i: number) =>
            (flare[i][1] - flare[i - 1][1]) / (flare[i][0] - flare[i - 1][0]);
        expect(slope(flare.length - 1)).toBeGreaterThan(2);
        for (let i = 2; i < flare.length; i++)
            expect(slope(i)).toBeGreaterThan(slope(i - 1));
    });

    it("bends tubing through true arcs without doubled points", () => {
        // a U: its two quarter turns meet in the middle of the far run
        const path = bentPath(
            [
                [[0, 0, 0]],
                [[0, 0, 0.1], 0.02],
                [[0.04, 0, 0.1], 0.02],
                [[0.04, 0, 0]],
            ],
            7,
        );
        for (let i = 1; i < path.length; i++)
            expect(
                Math.hypot(
                    path[i][0] - path[i - 1][0],
                    path[i][1] - path[i - 1][1],
                    path[i][2] - path[i - 1][2],
                ),
            ).toBeGreaterThan(4e-4);
        // the bow is a half circle of radius 0.02 about (0.02, 0, 0.08)
        for (const p of path.filter((q) => q[2] > 0.0801))
            expect(Math.hypot(p[0] - 0.02, p[2] - 0.08)).toBeCloseTo(0.02, 4);
    });
});
