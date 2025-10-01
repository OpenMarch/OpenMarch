import { describe, it, expect } from "vitest";
import { detectHeaderAndBands, mapRowToColumns, bucketRows } from "../columns";

function makeItem(str: string, x: number, y: number) {
    return { str, x, y, w: 10, h: 10 } as any;
}

describe("columns", () => {
    it("detects header and builds bands", () => {
        const rows = [
            [
                makeItem("Set", 10, 100),
                makeItem("Measures", 60, 100),
                makeItem("Counts", 120, 100),
                makeItem("Side to Side", 200, 100),
                makeItem("Front to Back", 300, 100),
            ],
            [
                makeItem("1", 10, 80),
                makeItem("m1-4", 60, 80),
                makeItem("8", 120, 80),
                makeItem("2 Outside 45 yd ln", 200, 80),
                makeItem("On Front Hash", 300, 80),
            ],
        ];
        const header = detectHeaderAndBands(rows as any);
        expect(header).toBeTruthy();
        expect(header!.bands.length).toBeGreaterThanOrEqual(4);
        const mapped = mapRowToColumns(rows[1] as any, header!.bands);
        expect(mapped.setId).toBe("1");
        expect(mapped.counts).toBe("8");
        expect(mapped.fbText.toLowerCase()).toContain("front");
    });

    it("row bucketing groups by y", () => {
        const items = [
            makeItem("A", 0, 100),
            makeItem("B", 50, 100.5),
            makeItem("C", 0, 80),
        ];
        const rows = bucketRows(items as any, 2);
        expect(rows.length).toBe(2);
    });
});
