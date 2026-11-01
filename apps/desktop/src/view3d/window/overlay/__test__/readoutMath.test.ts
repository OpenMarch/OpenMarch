// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    countsPastEnd,
    formatLength,
    pageCountAt,
    pausedPageCount,
    type ReadoutPage,
} from "../readoutMath";

/** Pages of `counts` beats at 0.5 s each, back to back, starting at 0. */
function makePages(spec: [name: string, counts: number][]): ReadoutPage[] {
    let t = 0;
    return spec.map(([name, counts], index) => {
        const beats = Array.from({ length: counts }, (_, i) => ({
            timestamp: t + i * 0.5,
        }));
        const page: ReadoutPage = {
            id: 100 + index,
            name,
            order: index,
            counts,
            timestamp: t,
            duration: counts * 0.5,
            beats,
        };
        t += counts * 0.5;
        return page;
    });
}

// Page 1 has no counts (the opening set); 2 and 3 have 8 and 4.
const pages = makePages([
    ["1", 0],
    ["2", 8],
    ["3", 4],
]);

describe("pageCountAt", () => {
    it("returns null without pages", () => {
        expect(pageCountAt([], 0)).toBeNull();
    });

    it("shows the opening set at time 0", () => {
        expect(pageCountAt(pages, 0)).toEqual({
            pageId: 100,
            pageName: "1",
            count: 0,
            total: 0,
        });
    });

    it("counts beats into the page while playing", () => {
        // 0.1 s into page 2: count 1.
        expect(pageCountAt(pages, 100)).toMatchObject({
            pageName: "2",
            count: 1,
            total: 8,
        });
        // 1.6 s: the fourth beat has started.
        expect(pageCountAt(pages, 1600)).toMatchObject({
            pageName: "2",
            count: 4,
        });
    });

    it("puts a page's end on that page, at its set", () => {
        expect(pageCountAt(pages, 4000)).toMatchObject({
            pageName: "2",
            count: 8,
        });
        expect(pageCountAt(pages, 4001)).toMatchObject({
            pageName: "3",
            count: 1,
        });
    });

    it("holds the last page's set after the show", () => {
        expect(pageCountAt(pages, 60_000)).toMatchObject({
            pageName: "3",
            count: 4,
            total: 4,
        });
    });

    it("doesn't depend on the input order", () => {
        expect(pageCountAt([...pages].reverse(), 100)).toMatchObject({
            pageName: "2",
        });
    });
});

describe("pausedPageCount", () => {
    // Page "2" (id 101) runs from 0 s to 4 s, eight beats of 0.5 s; page "3"
    // (id 102) from 4 s to 6 s
    it("counts the beats before a paused time inside the selected page", () => {
        expect(pausedPageCount(pages, 101, 0)?.count).toBe(0);
        expect(pausedPageCount(pages, 101, 500)?.count).toBe(1);
        expect(pausedPageCount(pages, 101, 2000)?.count).toBe(4);
        expect(pausedPageCount(pages, 101, 4000)).toEqual({
            pageId: 101,
            pageName: "2",
            count: 8,
            total: 8,
        });
    });

    it("moves with each beat step", () => {
        const counts = [1000, 1500, 2000].map(
            (ms) => pausedPageCount(pages, 101, ms)?.count,
        );
        expect(counts).toEqual([2, 3, 4]);
    });

    it("keeps the selected page at a boundary it shares with the previous one", () => {
        expect(pausedPageCount(pages, 102, 4000)).toMatchObject({
            pageId: 102,
            count: 0,
        });
        expect(pausedPageCount(pages, 101, 4000)).toMatchObject({
            pageId: 101,
            count: 8,
        });
    });

    it("is the page's set when the time is outside the selected page", () => {
        expect(pausedPageCount(pages, 102, 1000)?.count).toBe(4);
        expect(pausedPageCount(pages, 101, 5000)?.count).toBe(8);
    });

    it("is null for an unknown or missing page", () => {
        expect(pausedPageCount(pages, 999, 0)).toBeNull();
        expect(pausedPageCount(pages, null, 0)).toBeNull();
    });
});

describe("formatLength", () => {
    it("uses whole feet for imperial fields", () => {
        expect(formatLength(12.192, "imperial")).toEqual({
            value: "40",
            unit: "ft",
        });
    });

    it("uses meters with one decimal for metric fields", () => {
        expect(formatLength(12.25, "metric")).toEqual({
            value: "12.3",
            unit: "m",
        });
        expect(formatLength(182.4, "metric")).toEqual({
            value: "182",
            unit: "m",
        });
    });

    it("clamps bad values to zero", () => {
        expect(formatLength(Number.NaN, "metric").value).toBe("0.0");
        expect(formatLength(-3, "imperial").value).toBe("0");
    });
});

describe("countsPastEnd", () => {
    // 0.5 s counts past the stored ones: count n past the end (6 s) is playing in (6 + (n-1)/2, 6 + n/2]
    const clock = {
        timeAtBeat: (b: number) => b * 0.5,
        beatAtTime: (s: number) => s * 2,
    };

    it("is null up to the show's end, and without pages", () => {
        expect(countsPastEnd(pages, 3000, clock)).toBeNull();
        expect(countsPastEnd(pages, 6000, clock)).toBeNull();
        expect(countsPastEnd([], 9000, clock)).toBeNull();
    });

    it("numbers the count playing past the end, as the timeline's END +n", () => {
        expect(countsPastEnd(pages, 6100, clock)).toBe(1);
        expect(countsPastEnd(pages, 6500, clock)).toBe(1);
        expect(countsPastEnd(pages, 6600, clock)).toBe(2);
        expect(countsPastEnd(pages, 8500, clock)).toBe(5);
    });
});
