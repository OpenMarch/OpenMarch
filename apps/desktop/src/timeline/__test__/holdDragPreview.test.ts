// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SpanInfo } from "@openmarch/core";
import { holdDragPreview, makeHeldCount } from "../holdDragPreview";

/**
 * What a drag will do, before you let go (fork #476; holds 04-anchors "Display", review R1 and
 * R2; demo B2 and M6). Flags: the start at 0, Page 2 at 8, Page 3 at 16, Page 4 at 24, Page 5 at 32.
 */

const FLAGS = [
    { beat: 0, name: "1" },
    { beat: 8, name: "2" },
    { beat: 16, name: "3" },
    { beat: 24, name: "4" },
    { beat: 32, name: "5" },
];

let next = 1;
const span = (
    marcherId: number,
    start: number,
    end: number,
    kind: SpanInfo["kind"] = "founding",
): SpanInfo => ({
    marcherId,
    start,
    end,
    kind,
    assignmentId: kind === "hold" ? null : next++,
    assignmentEnd: kind === "hold" ? null : end,
    transitionId: null,
    slot: null,
});

/** B1 and B2 arrive at 16 (Page 3's flag); B1 is Held to 32. B3 walks over 18–22. */
const SPANS: Record<number, SpanInfo[]> = {
    1: [span(1, 8, 16)],
    2: [span(2, 8, 16)],
    3: [span(3, 18, 22)],
    // Held from its starting spot
    4: [],
};
const MARKS = [
    { marcherId: 1, start: 16, end: 32 },
    { marcherId: 4, start: 1, end: 32 },
];
const spansOf = (id: number) => SPANS[id] ?? [];

const preview = (
    target: Parameters<typeof holdDragPreview>[0]["target"],
    marcherIds: number[],
) =>
    holdDragPreview({
        target,
        marcherIds,
        marks: MARKS,
        spansOf,
        flags: FLAGS,
    });

describe("holdDragPreview", () => {
    it("B2: a mixed selection says how many are Held and what a drag does to each kind", () => {
        expect(preview({ kind: "range", start: 16, end: 20 }, [1, 2])).toEqual({
            held: 1,
            total: 2,
            outcomes: [
                { kind: "movesHold", page: "3" },
                { kind: "addsMove", page: "4" },
            ],
        });
    });

    it("Basic's count inside the hold moves it, as a window starting at its start does", () => {
        expect(preview({ kind: "point", beat: 20 }, [1])?.outcomes).toEqual([
            { kind: "movesHold", page: "3" },
        ]);
    });

    it("M6: a window starting inside the hold wins, so the drag adds a move", () => {
        expect(
            preview({ kind: "range", start: 20, end: 28 }, [1])?.outcomes,
        ).toEqual([{ kind: "addsMove", page: "5" }]);
    });

    it("a hold from the starting spot moves the starting position", () => {
        expect(preview({ kind: "point", beat: 20 }, [4])?.outcomes).toEqual([
            { kind: "movesHold", page: null },
        ]);
    });

    it("a marcher whose own move ends at the count changes it", () => {
        expect(preview({ kind: "point", beat: 22 }, [1, 3])?.outcomes).toEqual([
            { kind: "movesHold", page: "3" },
            { kind: "movesOwn", page: "4" },
        ]);
    });

    it("says nothing when no selected marcher is Held at the count", () => {
        expect(
            preview({ kind: "range", start: 8, end: 12 }, [1, 2]),
        ).toBeNull();
        expect(preview({ kind: "point", beat: 20 }, [2, 3])).toBeNull();
        expect(preview({ kind: "point", beat: 20 }, [])).toBeNull();
    });
});

describe("makeHeldCount", () => {
    const count = (beat: number, marcherIds: number[]) =>
        makeHeldCount({ beat, marcherIds, marks: MARKS, spansOf });

    it("counts the selected marchers standing still without a hold, beside a Held one", () => {
        expect(count(20, [1, 2])).toBe(1);
        // 3 walks over count 20
        expect(count(20, [1, 2, 3])).toBe(1);
        // 3's own move ends at 22
        expect(count(22, [1, 3])).toBe(0);
    });

    it("is 0 without a Held marcher, or with every one Held", () => {
        expect(count(20, [2, 3])).toBe(0);
        expect(count(20, [1, 4])).toBe(0);
    });
});
