import { describe, expect, it } from "vitest";
import { isLineParams, type LineParams } from "../lineGeometry";
import { lineFillSpots } from "../lineFill";

const base = {
    points: [
        { x: 0, y: 0, tension: 0 },
        { x: 40, y: 0, tension: 0 },
    ],
};

describe("a stored line's nested fields (ADR 0006, decision 5)", () => {
    it("refuses fields a newer build might add to its spacing or groups", () => {
        expect(isLineParams({ ...base, spacing: { mode: "fit" } })).toBe(true);
        expect(
            isLineParams({ ...base, spacing: { mode: "fit", align: "x" } }),
        ).toBe(false);
        expect(
            isLineParams({
                ...base,
                spacing: {
                    mode: "keep",
                    groups: [{ interval: 2 }],
                    anchor: "start",
                },
            }),
        ).toBe(false);
        expect(
            isLineParams({
                ...base,
                spacing: {
                    mode: "keep",
                    groups: [{ interval: 2, measured: "x" }],
                },
            }),
        ).toBe(false);
        expect(
            isLineParams({
                ...base,
                spacing: {
                    mode: "path",
                    groups: [{ interval: 2, count: 3 }],
                    anchor: "center",
                },
            }),
        ).toBe(true);
    });
});

describe("one marcher on a closed line", () => {
    const closed = (spacing: LineParams["spacing"]): LineParams => ({
        points: [
            { x: 0, y: 0, tension: 0 },
            { x: 40, y: 0, tension: 0 },
            { x: 40, y: 40, tension: 0 },
        ],
        closed: true,
        spacing,
    });

    it("stands on its first point, whatever the spacing", () => {
        for (const spacing of [
            { mode: "fit" },
            { mode: "keep", groups: [{ interval: 10 }] },
        ] as const)
            expect(lineFillSpots(closed(spacing), 1)).toEqual([
                { x: 0, y: 0, s: 0 },
            ]);
    });
});
