import { describe, expect, it } from "vitest";
import {
    beatWhere,
    countsText,
    moveInSentence,
    moveName,
} from "../timelineRangeWords";
import * as passThrough from "../timelinePassThrough";
import { translateTimelineText } from "../translateTimelineText";
import type { TimelineTextArg } from "../timelineText";

/** A phrase in English, through the app's Tolgee (English in tests); `null` stays `null`. */
const say = (value: TimelineTextArg | null) =>
    value === null ? null : translateTimelineText(value);

// Each box is named after the page whose flag ends it (`pageFlags`); page 1 is home
const boxes = [
    { start: 1, end: 9, name: "2" },
    { start: 9, end: 17, name: "3" },
    { start: 17, end: 25, name: "3A" },
];

describe("timeline words for refusals (wp18): pages and counts, never beats", () => {
    it("says where a moment is", () => {
        expect(say(beatWhere(9, boxes))).toBe("Page 2 count 8");
        expect(say(beatWhere(10, boxes))).toBe("Page 3 count 1");
        expect(say(beatWhere(20, boxes))).toBe("Page 3A count 3");
        // Past the last flag
        expect(say(beatWhere(28, boxes))).toBe("count 3 after Page 3A");
        // Home, and a page with no name, have no words
        expect(say(beatWhere(1, boxes))).toBeNull();
        expect(say(beatWhere(4, [{ start: 1, end: 9 }]))).toBeNull();
    });

    it("words a range as the object of a sentence", () => {
        expect(say(countsText({ start: 2, end: 6 }, boxes))).toBe(
            "Page 2, counts 2–5",
        );
        expect(say(countsText({ start: 5, end: 12 }, boxes))).toBe(
            "the counts from Page 2 count 5 to Page 3 count 3",
        );
        expect(say(countsText({ start: 25, end: 29 }, boxes))).toBe(
            "after Page 3A, counts 1–4",
        );
        // A range from home has no words for its first count
        expect(say(countsText({ start: 0, end: 4 }, boxes))).toBe(
            "these counts",
        );
    });

    it("names a page's box as its page's move inside a sentence", () => {
        const moves = [
            { id: 1, start: 9, end: 17, name: null },
            { id: 2, start: 3, end: 7, name: null },
            { id: 3, start: 18, end: 20, name: "Company front" },
        ];
        expect(say(moveInSentence({ start: 9, end: 17 }, boxes, moves))).toBe(
            "Page 3's move",
        );
        expect(say(moveInSentence({ start: 3, end: 7 }, boxes, moves))).toBe(
            "Move 1 (Page 2, counts 3–6)",
        );
        expect(say(moveInSentence({ start: 18, end: 20 }, boxes, moves))).toBe(
            "Company front (Page 3A, counts 2–3)",
        );
        // An unnamed page box is no page: it reads as any other range
        expect(
            say(moveInSentence({ start: 1, end: 9 }, [{ start: 1, end: 9 }])),
        ).toBe("another move");
    });

    it("keeps the words as keys and arguments until they are shown", () => {
        expect(beatWhere(9, boxes)).toEqual({
            key: "timeline.where.pageCount",
            params: { page: "2", count: 8 },
        });
        // Several moves over one range: their names as a list, joined when shown
        const twins = [
            { id: 1, start: 3, end: 7, name: "Opener" },
            { id: 2, start: 3, end: 7, name: "Echo" },
            { id: 3, start: 3, end: 7, name: "Push" },
        ];
        expect(say(moveName({ start: 3, end: 7 }, boxes, twins))).toBe(
            "Opener, Echo and Push (Page 2, counts 3–6)",
        );
    });

    it("is the same naming the pass-through toast uses", () => {
        expect(passThrough.moveName).toBe(moveName);
    });
});
