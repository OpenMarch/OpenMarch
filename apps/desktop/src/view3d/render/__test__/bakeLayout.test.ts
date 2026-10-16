import { describe, expect, it } from "vitest";
import { bakeLayout, rowTexel } from "../bakeLayout";

// Worked by hand: each entry takes its samples plus a closing one, channels
// in the order Feet, Horn/Equipment, Body whatever order they come in.
//   feet A, 30 samples: rows 0..30
//   feet B, 60 samples: rows 31..91
//   horn hold H, 1 sample: rows 92..93
//   horn transition T, 30 samples: rows 94..124      125 rows in all
const ENTRIES = [
    { name: "hold:brass:up", channel: "horn" as const, frames: 1 },
    { name: "8to5", channel: "feet" as const, frames: 30 },
    { name: "trans:brass:up>carry", channel: "horn" as const, frames: 30 },
    { name: "mt", channel: "feet" as const, frames: 60 },
];

describe("bakeLayout", () => {
    it("lays the channels out one after another, so rows add up across channels", () => {
        const l = bakeLayout(ENTRIES, { bones: 24, maxRows: 64 });
        expect(l.rows["8to5"]).toEqual({
            row: 0,
            frames: 30,
            counts: 1,
            channel: "feet",
        });
        expect(l.rows["mt"]).toEqual({
            row: 31,
            frames: 60,
            counts: 2,
            channel: "feet",
        });
        expect(l.rows["hold:brass:up"]).toEqual({
            row: 92,
            frames: 1,
            counts: 1 / 30,
            channel: "horn",
        });
        expect(l.rows["trans:brass:up>carry"]).toEqual({
            row: 94,
            frames: 30,
            counts: 1,
            channel: "horn",
        });
        expect(l.total).toBe(125);
        expect(l.channels).toEqual({
            feet: { first: 0, rows: 92 },
            horn: { first: 92, rows: 33 },
            body: { first: 125, rows: 0 },
        });
    });

    it("wraps rows into columns of maxRows, each a row of bones four texels wide", () => {
        const l = bakeLayout(ENTRIES, { bones: 24, maxRows: 64 });
        // 125 rows in columns of 64: two columns of 24 bones x 4 texels
        expect(l.rowsPerColumn).toBe(64);
        expect(l.columns).toBe(2);
        expect(l.width).toBe(192);
        // row 92 is the second column's row 28; bone 5 starts 20 texels in
        expect(rowTexel(l, 92, 5)).toEqual([116, 28]);
        expect(rowTexel(l, 63, 0)).toEqual([0, 63]);
        expect(rowTexel(l, 64, 23)).toEqual([188, 0]);
    });

    it("uses one column as tall as the rows when they fit", () => {
        const l = bakeLayout(ENTRIES, { bones: 23, maxRows: 2048 });
        expect(l.rowsPerColumn).toBe(125);
        expect(l.columns).toBe(1);
        expect(l.width).toBe(92);
    });

    it("keeps a one-row texture for an empty bake", () => {
        const l = bakeLayout([], { bones: 24 });
        expect(l.total).toBe(0);
        expect(l.rowsPerColumn).toBe(1);
        expect(l.columns).toBe(1);
        expect(l.width).toBe(96);
    });

    it("refuses a row name twice", () => {
        expect(() =>
            bakeLayout(
                [
                    { name: "a", channel: "feet", frames: 1 },
                    { name: "a", channel: "horn", frames: 1 },
                ],
                { bones: 24 },
            ),
        ).toThrow(/twice/);
    });

    it("refuses a layout wider than the texture limit", () => {
        // 3 rows a column: 3 entries of 2 rows need 2 columns, 2 x 96 > 100
        expect(() =>
            bakeLayout(
                [
                    { name: "a", channel: "feet", frames: 1 },
                    { name: "b", channel: "feet", frames: 1 },
                    { name: "c", channel: "feet", frames: 1 },
                ],
                { bones: 24, maxRows: 3, maxWidth: 100 },
            ),
        ).toThrow(/192 texels wide/);
    });
});
