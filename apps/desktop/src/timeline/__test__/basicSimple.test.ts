// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    lockedMarchersByPage,
    marcherSimpleOnBox,
    pointsInBox,
    type BasicRow,
} from "../basicSimple";

let nextId = 1;
const row = (
    marcherId: number,
    start: number,
    end: number,
    over: Partial<BasicRow> = {},
): BasicRow => {
    const id = nextId++;
    return {
        assignmentId: id,
        marcherId,
        transitionId: id,
        slotIndex: 0,
        timelineId: id,
        start,
        end,
        layer: 0,
        slotCount: 1,
        shapeId: null,
        pathStyle: "direct",
        ...over,
    };
};

const BOX = { start: 9, end: 17 };

describe("marcherSimpleOnBox", () => {
    it("no rows, or rows only outside the box, is simple", () => {
        expect(marcherSimpleOnBox([], BOX)).toEqual({ simple: true });
        expect(marcherSimpleOnBox([row(1, 1, 9), row(1, 17, 25)], BOX)).toEqual(
            { simple: true },
        );
    });

    it("ordered one-slot direct moves inside the box are simple, on any layers", () => {
        expect(
            marcherSimpleOnBox(
                [row(1, 13, 17, { layer: 2 }), row(1, 9, 11), row(1, 11, 13)],
                BOX,
            ),
        ).toEqual({ simple: true });
    });

    it("a move across either flag isn't", () => {
        expect(marcherSimpleOnBox([row(1, 5, 13)], BOX)).toEqual({
            simple: false,
            reason: "crossesFlag",
        });
        expect(marcherSimpleOnBox([row(1, 13, 21)], BOX)).toEqual({
            simple: false,
            reason: "crossesFlag",
        });
    });

    it("moves overlapping in time aren't, whatever their layers", () => {
        expect(
            marcherSimpleOnBox(
                [row(1, 9, 17), row(1, 11, 15, { layer: 1 })],
                BOX,
            ),
        ).toEqual({ simple: false, reason: "overlaps" });
    });

    it("a shared shapeless transition is simple (a converted page)", () => {
        expect(
            marcherSimpleOnBox(
                [row(1, 9, 17, { slotCount: 4, slotIndex: 2 })],
                BOX,
            ),
        ).toEqual({ simple: true });
    });

    it("a shape, and a path other than direct, aren't", () => {
        expect(
            marcherSimpleOnBox([row(1, 9, 17, { shapeId: 3 })], BOX),
        ).toEqual({ simple: false, reason: "shape" });
        expect(
            marcherSimpleOnBox([row(1, 9, 17, { pathStyle: "arc" })], BOX),
        ).toEqual({ simple: false, reason: "path" });
    });

    it("a crossing move wins over the other reasons", () => {
        expect(
            marcherSimpleOnBox(
                [row(1, 9, 13, { pathStyle: "arc" }), row(1, 13, 21)],
                BOX,
            ),
        ).toEqual({ simple: false, reason: "crossesFlag" });
    });
});

describe("lockedMarchersByPage", () => {
    const boxes = [
        { start: 1, end: 9 },
        { start: 9, end: 17 },
        { start: 17, end: 25 },
    ];

    it("lists the locked marchers per box, with an entry for every box", () => {
        const rows = [
            row(1, 1, 9),
            row(1, 13, 21), // crosses 17: locks boxes 1 and 2
            row(2, 9, 17, { pathStyle: "arc" }),
            row(3, 17, 25),
            row(3, 19, 23, { layer: 1 }),
        ];
        const locked = lockedMarchersByPage(rows, boxes);
        expect([...locked.keys()]).toEqual([0, 1, 2]);
        expect([...locked.get(0)!]).toEqual([]);
        expect(locked.get(1)).toEqual(
            new Map([
                [1, "crossesFlag"],
                [2, "path"],
            ]),
        );
        expect(locked.get(2)).toEqual(
            new Map([
                [1, "crossesFlag"],
                [3, "overlaps"],
            ]),
        );
    });

    it("agrees with marcherSimpleOnBox on unsorted boxes and rows", () => {
        const shuffled = [boxes[2]!, boxes[0]!, boxes[1]!];
        const rows = [
            row(5, 17, 21),
            row(4, 3, 12),
            row(5, 20, 24),
            row(4, 9, 12, { shapeId: 1 }),
        ];
        const locked = lockedMarchersByPage(rows, shuffled);
        shuffled.forEach((box, i) => {
            for (const marcherId of [4, 5]) {
                const verdict = marcherSimpleOnBox(
                    rows.filter((r) => r.marcherId === marcherId),
                    box,
                );
                expect(locked.get(i)!.get(marcherId)).toBe(
                    verdict.simple ? undefined : verdict.reason,
                );
            }
        });
    });

    it("handles overlapping boxes by scanning", () => {
        const locked = lockedMarchersByPage(
            [row(1, 5, 12)],
            [
                { start: 1, end: 9 },
                { start: 5, end: 12 },
            ],
        );
        expect(locked.get(0)!.get(1)).toBe("crossesFlag");
        expect(locked.get(1)!.size).toBe(0);
    });

    it("is quick for a big show (300 marchers × 100 pages)", () => {
        const pages = Array.from({ length: 100 }, (_, i) => ({
            start: 1 + 8 * i,
            end: 9 + 8 * i,
        }));
        const rows: BasicRow[] = [];
        for (let m = 0; m < 300; m++)
            for (const p of pages) {
                rows.push(row(m, p.start, p.start + 4));
                rows.push(row(m, p.start + 4, p.end));
            }
        const t0 = performance.now();
        const locked = lockedMarchersByPage(rows, pages);
        expect(performance.now() - t0).toBeLessThan(1000);
        expect([...locked.values()].every((m) => m.size === 0)).toBe(true);
    });
});

describe("pointsInBox", () => {
    it("is the marcher's move ends strictly inside the box", () => {
        const rows = [
            row(1, 9, 11),
            row(1, 11, 13),
            row(1, 13, 17),
            row(2, 9, 15),
            row(1, 17, 21),
        ];
        expect(pointsInBox(rows, 1, BOX)).toEqual([11, 13]);
        expect(pointsInBox(rows, 2, BOX)).toEqual([15]);
        expect(pointsInBox(rows, 3, BOX)).toEqual([]);
    });
});
