import { describe, expect, it } from "vitest";
import {
    flagsInside,
    isolatedTimelineName,
    isWholePageWindow,
    passedSets,
} from "../TimelineIsolationBar";

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

describe("the field line's words (UI-12)", () => {
    it("names a window past the last flag by the last page", () => {
        expect(isolatedTimelineName({ start: 25, end: 29 }, PAGES)).toBe(
            "After page 3, counts 1–4",
        );
    });

    it("names the sets a window passes through, not the page it ends on", () => {
        expect(flagsInside({ start: 5, end: 21 }, PAGES)).toEqual(["1", "2"]);
        expect(flagsInside({ start: 9, end: 17 }, PAGES)).toEqual([]);
        expect(passedSets(["2"])).toBe("page 2's set");
        expect(passedSets(["1", "2"])).toBe("pages 1 and 2's sets");
        expect(passedSets(["1", "2", "3"])).toBe("pages 1, 2 and 3's sets");
    });
});

describe("the field line's quiet case (UI-12 review)", () => {
    it("is quiet for home and for exactly a page box's range", () => {
        expect(isWholePageWindow({ kind: "home" }, PAGES)).toBe(true);
        expect(
            isWholePageWindow({ kind: "range", start: 9, end: 17 }, PAGES),
        ).toBe(true);
    });

    it("is loud for part of a page, a range across a flag, past the last flag, or nothing", () => {
        expect(
            isWholePageWindow({ kind: "range", start: 13, end: 17 }, PAGES),
        ).toBe(false);
        expect(
            isWholePageWindow({ kind: "range", start: 9, end: 25 }, PAGES),
        ).toBe(false);
        expect(
            isWholePageWindow({ kind: "range", start: 25, end: 29 }, PAGES),
        ).toBe(false);
        expect(isWholePageWindow({ kind: "none" }, PAGES)).toBe(false);
    });
});
