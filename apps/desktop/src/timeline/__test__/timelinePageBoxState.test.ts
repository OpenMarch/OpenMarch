import { describe, expect, it } from "vitest";
import {
    pageBoxStateOf,
    pageBoxStatesForSelection,
} from "../timelinePageBoxState";

/** Keep later pages: a marcher's state on a page box, from its rows. */

const BOX = { start: 17, end: 25 };
const row = (id: number, marcher: number, start: number, end: number) => ({
    id,
    marcher,
    start,
    end,
});

describe("pageBoxStateOf", () => {
    it("follows with no row over the box", () => {
        expect(pageBoxStateOf([], BOX)).toBe("follows");
    });

    it("is its own move for rows inside the box", () => {
        expect(pageBoxStateOf([row(1, 1, 17, 25)], BOX)).toBe("own");
        expect(pageBoxStateOf([row(1, 1, 17, 21)], BOX)).toBe("own");
        // A move with a window over part of it
        expect(
            pageBoxStateOf([row(1, 1, 17, 25), row(2, 1, 19, 21)], BOX),
        ).toBe("own");
    });

    it("is mid-move when a row crosses either flag", () => {
        expect(pageBoxStateOf([row(1, 1, 9, 21)], BOX)).toBe("midMove");
        expect(pageBoxStateOf([row(1, 1, 21, 33)], BOX)).toBe("midMove");
        // A drag through the page overrides its move
        expect(pageBoxStateOf([row(1, 1, 17, 25), row(2, 1, 9, 33)], BOX)).toBe(
            "midMove",
        );
    });
});

describe("pageBoxStatesForSelection", () => {
    it("gives each asked marcher's state on each box, with counts", () => {
        const assignments = [
            row(1, 1, 9, 17),
            row(2, 1, 17, 25),
            row(3, 2, 9, 17),
            row(4, 3, 9, 33),
            // Not asked
            row(6, 9, 17, 25),
        ];
        const [page3, page4] = pageBoxStatesForSelection({
            assignments,
            boxes: [BOX, { start: 25, end: 33 }],
            marcherIds: [1, 2, 3],
        });
        expect([...page3!.states]).toEqual([
            [1, "own"],
            [2, "follows"],
            [3, "midMove"],
        ]);
        expect(page3!.counts).toEqual({ follows: 1, own: 1, midMove: 1 });
        expect(page4!.box).toEqual({ start: 25, end: 33 });
        expect(page4!.counts).toEqual({ follows: 2, own: 0, midMove: 1 });
    });
});
