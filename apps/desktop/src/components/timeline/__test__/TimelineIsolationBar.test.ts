import { describe, expect, it } from "vitest";
import { isolatedTimelineName } from "../TimelineIsolationBar";

/** Page 1 ends at beat 9, page 2 at 17, page 3 at 25 (flags), as `useTimingObjects` gives them */
const page = (id: number, name: string, beats: number[]) => ({
    id,
    name,
    beats: beats.map((index) => ({ index })),
});
const PAGES = [
    page(0, "0", [0]),
    page(1, "1", [1, 2, 3, 4, 5, 6, 7, 8]),
    page(2, "2", [9, 10, 11, 12, 13, 14, 15, 16]),
    page(3, "3", [17, 18, 19, 20, 21, 22, 23, 24]),
];

describe("isolatedTimelineName", () => {
    it("names a page box's move, a range inside a page, and a range across pages", () => {
        expect(isolatedTimelineName({ start: 9, end: 17 }, PAGES)).toBe(
            "Page 2's move",
        );
        expect(isolatedTimelineName({ start: 13, end: 17 }, PAGES)).toBe(
            "Page 2, counts 5–8",
        );
        expect(isolatedTimelineName({ start: 13, end: 21 }, PAGES)).toBe(
            "Page 2 count 5 to page 3 count 4",
        );
    });
});
