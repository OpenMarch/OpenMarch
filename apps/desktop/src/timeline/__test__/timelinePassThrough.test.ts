import { describe, expect, it } from "vitest";
import {
    keepStopsLabel,
    moveName,
    narrowingFlag,
    passThroughMessage,
    rangeWhere,
    type PassThroughTranslate,
} from "../timelinePassThrough";

/** Fills `{name}` placeholders in the English default, as Tolgee does without a translation. */
const english: PassThroughTranslate = (_key, defaultMessage, params = {}) =>
    defaultMessage.replace(/\{(\w+)\}/g, (_, name: string) => params[name]!);

// Each box is named after the page whose flag ends it (`pageFlags`); page 1 is home
const boxes = [
    { start: 0, end: 16, name: "2" },
    { start: 16, end: 32, name: "3" },
    { start: 32, end: 48, name: "4" },
];

const pass = (flags: number[], extra = {}) => ({
    range: { start: 4, end: 48 },
    marcherIds: [3, 4],
    labels: ["T3", "T4"],
    overridden: [],
    caughtUp: [],
    flags,
    ...extra,
});

describe("timeline pass-through messages (research/ownership/10, defined-coordinates 08)", () => {
    it("names a page's box by its page, and any other move by its pages and counts", () => {
        expect(moveName({ start: 16, end: 32 }, boxes)).toBe("Page 3");
        // No stored move with the range: where it is, never beats
        expect(moveName({ start: 20, end: 32 }, boxes)).toBe(
            "the move on Page 3, counts 5–16",
        );
        expect(moveName({ start: 8, end: 12 }, boxes)).toBe(
            "the move on Page 2, counts 9–12",
        );
        expect(moveName({ start: 8, end: 9 }, boxes)).toBe(
            "the move on Page 2, count 9",
        );
        expect(moveName({ start: 12, end: 20 }, boxes)).toBe(
            "the move from Page 2 count 13 to Page 3 count 4",
        );
        // Past the last flag, where the next page gets written (UI-12)
        expect(moveName({ start: 48, end: 52 }, boxes)).toBe(
            "the move after Page 4, counts 1–4",
        );
        expect(moveName({ start: 44, end: 52 }, boxes)).toBe(
            "the move from Page 4 count 13 to count 4 after Page 4",
        );
    });

    it("names a stored move by its label (UI-14), with where it is", () => {
        const moves = [
            { id: 7, start: 16, end: 32, name: null }, // Page 3's own move
            { id: 8, start: 8, end: 12, name: "Company front" },
            { id: 9, start: 20, end: 24, name: "Move 2" },
            { id: 10, start: 36, end: 40, name: null },
        ];
        expect(moveName({ start: 8, end: 12 }, boxes, moves)).toBe(
            "Company front (Page 2, counts 9–12)",
        );
        expect(moveName({ start: 20, end: 24 }, boxes, moves)).toBe(
            "Move 2 (Page 3, counts 5–8)",
        );
        // Stored without a name: numbered after the highest "Move N"
        expect(moveName({ start: 36, end: 40 }, boxes, moves)).toBe(
            "Move 3 (Page 4, counts 5–8)",
        );
        // A page's box stays "Page 3", even with its own stored move
        expect(moveName({ start: 16, end: 32 }, boxes, moves)).toBe("Page 3");
        // No stored move has this range
        expect(moveName({ start: 24, end: 28 }, boxes, moves)).toBe(
            "the move on Page 3, counts 9–12",
        );
    });

    it("says where without beats, or nothing where a page has no name", () => {
        expect(rangeWhere({ start: 20, end: 32 }, boxes)?.where).toBe(
            "Page 3, counts 5–16",
        );
        const unnamed = [{ start: 0, end: 16 }, ...boxes.slice(1)];
        expect(rangeWhere({ start: 4, end: 8 }, unnamed)).toBeNull();
        expect(moveName({ start: 4, end: 8 }, unnamed)).toBe("another move");
        expect(
            moveName({ start: 4, end: 8 }, unnamed, [
                { id: 1, start: 4, end: 8, name: "Opener" },
            ]),
        ).toBe("Opener");
        expect(rangeWhere({ start: 4, end: 8 }, [])).toBeNull();
    });

    it("narrows to the last flag strictly inside the range", () => {
        expect(narrowingFlag({ start: 0, end: 48 }, boxes)).toBe(32);
        expect(narrowingFlag({ start: 4, end: 40 }, boxes)).toBe(32);
        expect(narrowingFlag({ start: 16, end: 32 }, boxes)).toBeNull();
    });

    it("says which pages are no longer stops, without marcher names", () => {
        expect(passThroughMessage(pass([16]), boxes, english)).toBe(
            "Page 2 is no longer a stop",
        );
        expect(passThroughMessage(pass([16, 32]), boxes, english)).toBe(
            "Pages 2–3 are no longer stops",
        );
        // What catches up after the window is ordinary carry-forward, not a lost stop
        expect(
            passThroughMessage(
                pass([16, 32], { caughtUp: [{ start: 32, end: 48 }] }),
                boxes,
                english,
            ),
        ).toBe("Pages 2–3 are no longer stops");
        // A flag with no named page
        expect(passThroughMessage(pass([20]), boxes, english)).toBe(
            "The sets inside this move are no longer stops",
        );
    });

    it("labels the action by what it restores: every flag inside the drag", () => {
        expect(keepStopsLabel(pass([16]), boxes, english)).toBe(
            "Keep Page 2 as a stop",
        );
        expect(keepStopsLabel(pass([16, 32]), boxes, english)).toBe(
            "Keep Pages 2–3 as stops",
        );
        expect(keepStopsLabel(pass([20]), boxes, english)).toBe(
            "Keep them as stops",
        );
    });

    it("without a page flag, says what it moves through and what catches up", () => {
        const clips = pass([], {
            overridden: [
                { start: 0, end: 16 },
                { start: 16, end: 32 },
            ],
            caughtUp: [{ start: 32, end: 48 }],
        });
        expect(passThroughMessage(clips, boxes, english)).toBe(
            "Now moves straight through Page 2 and Page 3, then catches up to the set at the end of Page 4",
        );
        expect(
            passThroughMessage({ ...clips, caughtUp: [] }, boxes, english),
        ).toBe("Now moves straight through Page 2 and Page 3");
        expect(
            passThroughMessage({ ...clips, overridden: [] }, boxes, english),
        ).toBe("Now catches up to the set at the end of Page 4");
    });

    it("names the moves it crosses in pages and counts, never beats (study 10)", () => {
        // A window over page 3's counts 1–12 crossing a clip, running into another
        const clips = pass([], {
            range: { start: 16, end: 28 },
            overridden: [{ start: 20, end: 24 }],
            caughtUp: [{ start: 24, end: 32 }],
        });
        const moves = [
            { id: 1, start: 20, end: 24, name: "Move 2" },
            { id: 2, start: 24, end: 32, name: "Company front" },
        ];
        expect(passThroughMessage(clips, boxes, english, moves)).toBe(
            "Now moves straight through Move 2 (Page 3, counts 5–8), then catches up to the set at the end of Company front (Page 3, counts 9–16)",
        );
        // Without stored names (before the timelines load)
        const unnamed = passThroughMessage(clips, boxes, english);
        expect(unnamed).toBe(
            "Now moves straight through the move on Page 3, counts 5–8, then catches up to the set at the end of the move on Page 3, counts 9–16",
        );
        expect(
            passThroughMessage(
                { ...clips, caughtUp: [] },
                boxes,
                english,
                moves,
            ),
        ).toBe("Now moves straight through Move 2 (Page 3, counts 5–8)");
        expect(
            passThroughMessage(
                { ...clips, overridden: [] },
                boxes,
                english,
                moves,
            ),
        ).toBe(
            "Now catches up to the set at the end of Company front (Page 3, counts 9–16)",
        );
        for (const text of [
            unnamed,
            passThroughMessage(clips, boxes, english, moves),
        ]) {
            expect(text).not.toMatch(/beat|\[|\d+, \d+\)/);
        }
    });
});
