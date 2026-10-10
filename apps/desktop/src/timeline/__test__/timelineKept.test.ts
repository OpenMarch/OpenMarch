import { describe, expect, it } from "vitest";
import { keptStateOf, keptStatesForSelection } from "../timelineKept";

/** Keep later pages: a marcher's state on a page box, from rows and kept markers. */

const BOX = { start: 17, end: 25 };
const row = (id: number, marcher: number, start: number, end: number) => ({
    id,
    marcher,
    start,
    end,
});

describe("keptStateOf", () => {
    it("follows with no row over the box", () => {
        expect(keptStateOf([], BOX, new Set())).toBe("follows");
    });

    it("is kept for a marked row over exactly the box", () => {
        expect(keptStateOf([row(1, 1, 17, 25)], BOX, new Set([1]))).toBe(
            "kept",
        );
    });

    it("is its own move for an unmarked row, or a marked one that no longer spans the box", () => {
        expect(keptStateOf([row(1, 1, 17, 25)], BOX, new Set())).toBe("own");
        expect(keptStateOf([row(1, 1, 17, 21)], BOX, new Set([1]))).toBe("own");
        // A kept move with a window over part of it
        expect(
            keptStateOf(
                [row(1, 1, 17, 25), row(2, 1, 19, 21)],
                BOX,
                new Set([1]),
            ),
        ).toBe("own");
    });

    it("is mid-move when a row crosses either flag, kept or not", () => {
        expect(keptStateOf([row(1, 1, 9, 21)], BOX, new Set())).toBe("midMove");
        expect(keptStateOf([row(1, 1, 21, 33)], BOX, new Set())).toBe(
            "midMove",
        );
        // A drag through the kept page overrides it
        expect(
            keptStateOf(
                [row(1, 1, 17, 25), row(2, 1, 9, 33)],
                BOX,
                new Set([1]),
            ),
        ).toBe("midMove");
    });
});

describe("keptStatesForSelection", () => {
    it("gives each asked marcher's state on each box, with counts", () => {
        const assignments = [
            row(1, 1, 9, 17),
            row(2, 1, 17, 25),
            row(3, 2, 9, 17),
            row(4, 3, 9, 33),
            row(5, 4, 17, 25),
            // Not asked
            row(6, 9, 17, 25),
        ];
        const [page3, page4] = keptStatesForSelection({
            assignments,
            kept: new Set([2, 6]),
            boxes: [BOX, { start: 25, end: 33 }],
            marcherIds: [1, 2, 3, 4],
        });
        expect([...page3!.states]).toEqual([
            [1, "kept"],
            [2, "follows"],
            [3, "midMove"],
            [4, "own"],
        ]);
        expect(page3!.counts).toEqual({
            follows: 1,
            kept: 1,
            own: 1,
            midMove: 1,
        });
        expect(page4!.box).toEqual({ start: 25, end: 33 });
        expect(page4!.counts).toEqual({
            follows: 3,
            kept: 0,
            own: 0,
            midMove: 1,
        });
    });
});
