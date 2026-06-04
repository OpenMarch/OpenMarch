import { describe, it, expect } from "vitest";
import { reconcileSheets } from "../reconcile";
import type { ParsedSheet } from "../types";

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

describe("reconcileSheets", () => {
    it("fills blank coordinates from previous row (hold inference)", () => {
        const result = reconcileSheets([
            sheet([
                {
                    setId: "0",
                    lateralText: "4 Inside 40 yd ln",
                    fbText: "2 steps Behind Front Hash",
                },
                { setId: "1", lateralText: "", fbText: "" },
            ]),
        ]);
        expect(result[0].rows[1].lateralText).toBe("4 Inside 40 yd ln");
        expect(result[0].rows[1].fbText).toBe("2 steps Behind Front Hash");
    });

    it("does not propagate non-coordinate text", () => {
        const result = reconcileSheets([
            sheet([
                { setId: "0", lateralText: "garbage", fbText: "nonsense" },
                { setId: "1", lateralText: "", fbText: "" },
            ]),
        ]);
        expect(result[0].rows[1].lateralText).toBe("");
        expect(result[0].rows[1].fbText).toBe("");
    });

    it("enforces counts consistency from majority", () => {
        const result = reconcileSheets([
            sheet([{ setId: "1", counts: 32 }]),
            sheet([{ setId: "1", counts: 0 }]),
        ]);
        expect(result[1].rows[0].counts).toBe(32);
    });

    it("preserves valid rows untouched", () => {
        const result = reconcileSheets([
            sheet([
                {
                    setId: "1",
                    counts: 32,
                    lateralText: "On 50 yd ln",
                    fbText: "On Front Hash",
                },
            ]),
        ]);
        expect(result[0].rows[0]).toMatchObject({
            setId: "1",
            counts: 32,
            lateralText: "On 50 yd ln",
            fbText: "On Front Hash",
        });
    });

    it("handles empty sheets array", () => {
        expect(reconcileSheets([])).toEqual([]);
    });
});
