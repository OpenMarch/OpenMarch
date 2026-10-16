import { describe, expect, it } from "vitest";
import {
    flagsInside,
    isolatedTimelineName,
    isWholePageWindow,
    passedSets,
    editingWords,
    stoppedNote,
    stoppedSpot,
} from "../TimelineIsolationBar";
import { planCanvasEdit } from "@/timeline/timelineCoordinateWrites";

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
        // Beat 0 is page 1's start too (a flag pinned there)
        expect(isolatedTimelineName({ start: 0, end: 9 }, PAGES)).toBe(
            "Page 1's move",
        );
        // Whole pages read as pages (UI-17 follow-up)
        expect(isolatedTimelineName({ start: 9, end: 25 }, PAGES)).toBe(
            "Pages 2–3",
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
        expect(passedSets(["2"])).toBe("set 2");
        expect(passedSets(["1", "2"])).toBe("sets 1 and 2");
        expect(passedSets(["1", "2", "3"])).toBe("sets 1, 2 and 3");
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

describe("the field line after playing on stops (UI-17)", () => {
    /** The store's page boxes for PAGES, as `useTimelinePageBoxes` sets them */
    const BOXES = [
        { start: 1, end: 9, name: "1" },
        { start: 9, end: 17, name: "2" },
        { start: 17, end: 25, name: "3" },
    ];

    it("names the page the playhead stopped on; a page's flag is that page's", () => {
        expect(
            stoppedSpot({ kind: "range", start: 9, end: 20 }, BOXES),
        ).toEqual({ kind: "page", name: "3" });
        expect(
            stoppedSpot({ kind: "range", start: 9, end: 17 }, BOXES),
        ).toEqual({ kind: "page", name: "2" });
        // A window that starts on an earlier page is placed by where it ends (the playhead)
        expect(
            stoppedSpot({ kind: "range", start: 5, end: 13 }, BOXES),
        ).toEqual({ kind: "page", name: "2" });
        expect(stoppedSpot({ kind: "home" }, BOXES)).toEqual({ kind: "home" });
        expect(stoppedSpot({ kind: "none" }, BOXES)).toBeNull();
        // Before the boxes load
        expect(
            stoppedSpot({ kind: "range", start: 9, end: 17 }, []),
        ).toBeNull();
    });

    it("tells past the last flag apart from a page", () => {
        expect(
            stoppedSpot({ kind: "range", start: 25, end: 33 }, BOXES),
        ).toEqual({ kind: "after" });
    });

    it("never reads as a page being made (basic-past-flag study: 4/4 went to check)", () => {
        expect(stoppedNote({ kind: "page", name: "3" })).toBe(
            "Paused on page 3",
        );
        expect(stoppedNote({ kind: "after" })).toBe(
            "Paused after the last page",
        );
    });
});

describe("the field line past the last flag in Basic (UI-19)", () => {
    const BOXES = [
        { start: 1, end: 9, name: "1" },
        { start: 9, end: 17, name: "2" },
    ];
    const plan = (start: number, end: number, basic: boolean) =>
        planCanvasEdit(
            {
                selection: { kind: "range", start, end },
                isolation: null,
                pageBoxes: BOXES,
                startPinned: false,
            },
            basic,
            false,
        );

    it("says how to edit there, since a drop is refused, with or without a stop note", () => {
        expect(
            editingWords(plan(17, 21, true), "After page 2, counts 1–4"),
        ).toBe("Add a page with + to edit here");
    });

    it("names what a drop edits everywhere else", () => {
        expect(editingWords(plan(9, 13, true), "count 4 of page 2")).toBe(
            "Editing count 4 of page 2",
        );
        expect(editingWords(null, "After page 2, counts 1–4")).toBe(
            "Editing After page 2, counts 1–4",
        );
    });
});
