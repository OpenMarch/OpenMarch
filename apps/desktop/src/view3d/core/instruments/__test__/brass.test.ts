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
    it.each(IDS)("%s stays within the high and low triangle budgets", (id) => {
        const high = triangleCount(brassModel(id, "high").pieces);
        expect(high).toBeGreaterThanOrEqual(8000);
        expect(high).toBeLessThanOrEqual(12000);
        const low = triangleCount(brassModel(id, "low").pieces);
        expect(low).toBeGreaterThanOrEqual(1500);
        expect(low).toBeLessThanOrEqual(3500);
    });

    it.each(IDS)(
        "%s has the spec's length along +Z and bell diameter",
        (id) => {
            const { min, max } = bounds(brassModel(id).pieces);
            const d = BRASS_DIMENSIONS[id];
            expect(Math.abs(max[2] - min[2] - d.length)).toBeLessThan(0.05);
            // the bell is the widest part: its diameter sets the x extent
            expect(Math.abs(max[0] - min[0] - d.bell)).toBeLessThan(0.05);
        },
    );

    it("puts the trumpet's right-hand grip at the origin and the mouthpiece behind it", () => {
        const m = brassModel("trumpet");
        expect(m.mouthpiece[2]).toBeLessThan(0);
        expect(Math.abs(m.leftGrip[2])).toBeLessThan(0.12);
        // the valve buttons rise above the grip
        const { max } = bounds(m.pieces.filter((p) => p.part === 18));
        expect(max[1]).toBeGreaterThan(0.03);
    });

    it("bakes the modeled trumpet with its mouthpiece rim where the holds expect it", () => {
        for (const detail of ["high", "low"] as const) {
            const m = brassModel("trumpet", detail);
            const { min } = bounds(m.pieces);
            // the rim is the rearmost point, level with the leadpipe
            expect(min[2]).toBeCloseTo(-0.168, 2);
            expect(m.pieces.some((p) => p.part === 23)).toBe(true);
            for (const p of m.pieces)
                for (let i = 0; i < p.normals.length; i += 3)
                    expect(
                        Math.hypot(
                            p.normals[i],
                            p.normals[i + 1],
                            p.normals[i + 2],
                        ),
                    ).toBeCloseTo(1, 5);
        }
    });

    it.each([
        ["mellophone", 0.35],
        ["baritone", 0.36],
        ["euphonium", 0.36],
    ] as const)(
        "%s keeps the procedural horn's mouthpiece rim, behind the wrap",
        (id, grip) => {
            const L = BRASS_DIMENSIONS[id].length;
            for (const detail of ["high", "low"] as const) {
                const m = brassModel(id, detail);
                // the rim is the rearmost point
                expect(bounds(m.pieces).min[2]).toBeCloseTo(-grip * L, 2);
                expect(m.mouthpiece[2]).toBeCloseTo(-grip * L + 0.075, 3);
                // the trumpet's valve block: its pearl buttons
                expect(m.pieces.some((p) => p.part === 23)).toBe(true);
            }
        },
    );

    it("lays the contra's loop behind the grip with the bell forward", () => {
        const m = brassModel("contra");
        const { min, max } = bounds(m.pieces);
        expect(min[2]).toBeLessThan(-0.5);
        expect(max[2]).toBeGreaterThan(0.25);
        // the widest ring at the front is the bell rim, not the loop
        const front = m.pieces.filter(
            (p) => bounds([p]).max[2] > max[2] - 0.01,
        );
        expect(front.length).toBeGreaterThan(0);
        for (const p of front)
            expect(bounds([p]).max[0] - bounds([p]).min[0]).toBeGreaterThan(
                0.45,
            );
        // the bell sits above the loop's centerline, not overhead
        expect(max[1]).toBeLessThan(0.45);
    });

    it("uses only instrument part ids and colors every vertex at high detail", () => {
        for (const id of IDS)
            for (const p of brassModel(id, "high").pieces) {
                expect([16, 18, 22, 23]).toContain(p.part);
                expect(p.colors?.length).toBe(p.positions.length);
            }
    });
});
