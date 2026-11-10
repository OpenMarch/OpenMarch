import { describe, expect, it } from "vitest";
import { holdOverWindowLight } from "../timelineExpertHolds";

const mark = (marcherId: number, start: number, end: number) => ({
    id: marcherId * 100 + start,
    marcherId,
    start,
    end,
});

describe("holdOverWindowLight (#476)", () => {
    const window = { start: 21, end: 29 };
    const light = (
        rows: Record<number, { start: number; end: number }[]>,
        marks: ReturnType<typeof mark>[] = [],
    ) =>
        holdOverWindowLight({
            window,
            marcherIds: Object.keys(rows).map(Number),
            marks,
            rowsOf: (id) => rows[id]!,
            showStart: 1,
            showEnd: 33,
        });

    it("stays inside the show: from its first page's start to the last flag", () => {
        const inShow = (window: { start: number; end: number }) =>
            holdOverWindowLight({
                window,
                marcherIds: [1],
                marks: [],
                rowsOf: () => [],
                showStart: 1,
                showEnd: 33,
            });
        expect(inShow({ start: 0, end: 41 })?.byMarcher.get(1)).toEqual([
            { start: 1, end: 33 },
        ]);
        expect(inShow({ start: 33, end: 41 })).toBeNull();
    });

    it("draws a would-be hold from where the write would start it: the window, or what it reaches back to", () => {
        const out = light({
            1: [{ start: 9, end: 17 }],
            2: [{ start: 17, end: 25 }],
            3: [],
        });
        expect(out?.wouldHold).toBe(true);
        expect(out?.byMarcher.get(1)).toEqual([{ start: 17, end: 29 }]);
        expect(out?.byMarcher.get(2)).toEqual([{ start: 21, end: 29 }]);
        expect(out?.byMarcher.get(3)).toEqual([{ start: 1, end: 29 }]);
    });

    it("leaves out a marcher Held over the whole window, and is null with nobody to change", () => {
        expect(
            light({ 1: [], 2: [] }, [mark(1, 17, 33)])?.byMarcher.has(1),
        ).toBe(false);
        expect(light({ 1: [] }, [mark(1, 17, 33)])).toBeNull();
    });
});
