import { describe, it, expect } from "vitest";
import { normalizeSheets } from "../normalize";
import type { ParsedSheet } from "../types";

function makeOutdoorField() {
    const xCheckpoints = [];
    for (let yards = 0; yards <= 100; yards += 5) {
        const curYardLine = yards < 50 ? yards : 100 - yards;
        const stepsFromCenterFront = ((yards - 50) / 5) * 8;
        xCheckpoints.push({
            name: `${curYardLine} yard line`,
            stepsFromCenterFront,
            useAsReference: true,
        });
    }
    return {
        xCheckpoints,
        yCheckpoints: [
            {
                name: "front sideline",
                stepsFromCenterFront: 0,
                useAsReference: true,
            },
            {
                name: "HS front hash",
                stepsFromCenterFront: -28,
                useAsReference: true,
            },
            {
                name: "HS back hash",
                stepsFromCenterFront: -56,
                useAsReference: true,
            },
            {
                name: "back sideline",
                stepsFromCenterFront: -84,
                useAsReference: true,
            },
        ],
    };
}

function makeIndoorField() {
    return {
        xCheckpoints: [
            {
                name: "Left Edge",
                stepsFromCenterFront: -20,
                useAsReference: true,
            },
            { name: "1 line", stepsFromCenterFront: -10, useAsReference: true },
            { name: "2 line", stepsFromCenterFront: 0, useAsReference: true },
            { name: "3 line", stepsFromCenterFront: 10, useAsReference: true },
            {
                name: "Right Edge",
                stepsFromCenterFront: 20,
                useAsReference: true,
            },
        ],
        yCheckpoints: [
            {
                name: "Front Edge",
                stepsFromCenterFront: 10,
                useAsReference: true,
            },
            { name: "A line", stepsFromCenterFront: 5, useAsReference: true },
            { name: "B line", stepsFromCenterFront: 0, useAsReference: true },
            { name: "C line", stepsFromCenterFront: -5, useAsReference: true },
            {
                name: "Back Edge",
                stepsFromCenterFront: -10,
                useAsReference: true,
            },
        ],
    };
}

function sheet(rows: Partial<ParsedSheet["rows"][0]>[]): ParsedSheet {
    return {
        pageIndex: 0,
        quadrant: "TL",
        header: { label: "S1" },
        rows: rows.map((r) => ({
            setId: "1",
            measureRange: "1-4",
            counts: 32,
            lateralText: "",
            fbText: "",
            ...r,
        })),
    };
}

describe("normalizeSheets", () => {
    it("normalizes outdoor lateral and fb text to steps", () => {
        const result = normalizeSheets(
            [
                sheet([
                    {
                        lateralText: "On 50 yd ln",
                        fbText: "On Front Hash",
                    },
                ]),
            ],
            makeOutdoorField(),
            "HS",
        );
        expect(result[0].rows[0].xSteps).toBeCloseTo(0, 0);
        expect(result[0].rows[0].ySteps).toBeCloseTo(-28, 0);
    });

    it("sets xSteps to NaN on unparsable lateral", () => {
        const result = normalizeSheets(
            [
                sheet([
                    {
                        lateralText: "completely invalid text",
                        fbText: "On Front Hash",
                    },
                ]),
            ],
            makeOutdoorField(),
            "HS",
        );
        expect(Number.isNaN(result[0].rows[0].xSteps)).toBe(true);
        expect(result[0].rows[0].xParseError).toBeDefined();
    });

    it("sets ySteps to NaN on unparsable fb", () => {
        const result = normalizeSheets(
            [
                sheet([
                    {
                        lateralText: "On 50 yd ln",
                        fbText: "completely invalid text",
                    },
                ]),
            ],
            makeOutdoorField(),
            "HS",
        );
        expect(Number.isNaN(result[0].rows[0].ySteps)).toBe(true);
        expect(result[0].rows[0].yParseError).toBeDefined();
    });

    it("preserves sheet metadata through normalization", () => {
        const result = normalizeSheets(
            [
                sheet([
                    {
                        setId: "5A",
                        counts: 16,
                        lateralText: "On 50 yd ln",
                        fbText: "On Front Hash",
                    },
                ]),
            ],
            makeOutdoorField(),
            "HS",
        );
        expect(result[0].pageIndex).toBe(0);
        expect(result[0].quadrant).toBe("TL");
        expect(result[0].header.label).toBe("S1");
        expect(result[0].rows[0].setId).toBe("5A");
        expect(result[0].rows[0].counts).toBe(16);
    });

    it("handles indoor field parsing", () => {
        const result = normalizeSheets(
            [
                sheet([
                    {
                        lateralText: "On 2 line",
                        fbText: "On B line",
                    },
                ]),
            ],
            makeIndoorField(),
            undefined,
            true,
        );
        expect(result[0].rows[0].xSteps).toBeCloseTo(0, 0);
        expect(result[0].rows[0].ySteps).toBeCloseTo(0, 0);
    });

    it("handles empty sheets", () => {
        const result = normalizeSheets([], makeOutdoorField());
        expect(result).toEqual([]);
    });
});
