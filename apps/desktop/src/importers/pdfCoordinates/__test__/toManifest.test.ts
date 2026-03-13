import { describe, it, expect } from "vitest";
import { toManifest } from "../index";
import type { NormalizedSheet } from "../types";

function makeNormalizedSheets(): NormalizedSheet[] {
    return [
        {
            pageIndex: 0,
            quadrant: "TL",
            header: { label: "S1", performer: "Snare 1" },
            rows: [
                {
                    setId: "0",
                    counts: 0,
                    xSteps: 0,
                    ySteps: 0,
                    lateralText: "On 50",
                    fbText: "On FSL",
                },
                {
                    setId: "1",
                    counts: 32,
                    xSteps: 4,
                    ySteps: -28,
                    lateralText: "4 Inside 40",
                    fbText: "On FH",
                },
            ],
        },
        {
            pageIndex: 0,
            quadrant: "TR",
            header: { label: "S2", performer: "Snare 2" },
            rows: [
                {
                    setId: "0",
                    counts: 0,
                    xSteps: 8,
                    ySteps: 0,
                    lateralText: "On 40",
                    fbText: "On FSL",
                },
                {
                    setId: "1",
                    counts: 32,
                    xSteps: 12,
                    ySteps: -28,
                    lateralText: "4 Inside 30",
                    fbText: "On FH",
                },
            ],
        },
    ];
}

describe("toManifest", () => {
    it("creates correct number of marchers from unique sheet keys", () => {
        const manifest = toManifest(makeNormalizedSheets(), "test.pdf");
        expect(manifest.marchers).toHaveLength(2);
        expect(manifest.marchers[0].label).toBe("S1");
        expect(manifest.marchers[1].label).toBe("S2");
    });

    it("creates sets from page plan", () => {
        const manifest = toManifest(makeNormalizedSheets(), "test.pdf");
        expect(manifest.sets.length).toBeGreaterThan(0);
        expect(manifest.sets[0].setId).toBe("0");
    });

    it("creates positions for all rows across all sheets", () => {
        const manifest = toManifest(makeNormalizedSheets(), "test.pdf");
        expect(manifest.positions).toHaveLength(4);
    });

    it("sets source format and filename", () => {
        const manifest = toManifest(makeNormalizedSheets(), "my-show.pdf");
        expect(manifest.source.format).toBe("pdf-coordinates");
        expect(manifest.source.filename).toBe("my-show.pdf");
    });

    it("deduplicates marchers with same key", () => {
        const sheets: NormalizedSheet[] = [
            {
                pageIndex: 0,
                quadrant: "TL",
                header: { label: "S1" },
                rows: [
                    {
                        setId: "0",
                        counts: 0,
                        xSteps: 0,
                        ySteps: 0,
                        lateralText: "",
                        fbText: "",
                    },
                ],
            },
            {
                pageIndex: 1,
                quadrant: "TL",
                header: { label: "S1" },
                rows: [
                    {
                        setId: "0",
                        counts: 0,
                        xSteps: 4,
                        ySteps: 0,
                        lateralText: "",
                        fbText: "",
                    },
                ],
            },
        ];
        const manifest = toManifest(sheets, "test.pdf");
        expect(manifest.marchers).toHaveLength(1);
        expect(manifest.positions).toHaveLength(2);
    });

    it("handles empty sheets", () => {
        const manifest = toManifest([], "test.pdf");
        expect(manifest.marchers).toHaveLength(0);
        expect(manifest.sets).toHaveLength(0);
        expect(manifest.positions).toHaveLength(0);
    });
});
