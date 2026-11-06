import { describe, expect, it } from "vitest";
import {
    borrowedMoveStart,
    heldMarkSource,
    isDecidedAt,
    marcherDecided,
    marksByMarcher,
    notDefinedAt,
} from "../timelineDecided";
import type { CarrySpan } from "../timelineCarryForward";

const hold = (start: number, end: number): CarrySpan => ({
    start,
    end,
    kind: "hold",
});
const move = (start: number, end: number): CarrySpan => ({
    start,
    end,
    kind: "founding",
});

/** Which of `beats` are decided. */
const decidedOn = (
    stretches: ReturnType<typeof marcherDecided>,
    beats: number[],
) => beats.filter((b) => isDecidedAt(stretches, b));

// The holds demo's "9 · The field look" (docs/timeline/research/holds/demo/holds-demo.html):
// pages flag at 8, 16 and 24.
describe("the field look (holds demo scenario 9)", () => {
    // B1 waits on Page 1's spot, then walks 8–16 and 16–24
    const b1 = marcherDecided(
        [hold(-Infinity, 8), move(8, 16), move(16, 24), hold(24, Infinity)],
        [],
    );
    // B2 walks 0–8, then is Held through Page 3 (to 24)
    const b2 = marcherDecided(
        [move(0, 8), hold(8, Infinity)],
        [{ start: 8, end: 24 }],
    );
    // B3 never has a move
    const b3 = marcherDecided([hold(-Infinity, Infinity)], []);

    it("draws B1 walking, B2 Held and B3 never set as solid, solid and dashed at count 12", () => {
        const look = notDefinedAt(
            new Map([
                [1, b1],
                [2, b2],
                [3, b3],
            ]),
            12,
        );
        expect([...look]).toEqual([3]);
    });

    it("leaves the first page decided for everyone", () => {
        expect(
            notDefinedAt(
                new Map([
                    [1, b1],
                    [3, b3],
                ]),
                0,
            ).size,
        ).toBe(0);
    });

    it("draws a marcher Not defined before its first move, solid from its first step", () => {
        expect(decidedOn(b1, [0, 1, 4, 8, 9, 16, 20, 24, 25])).toEqual([
            0, 9, 16, 20, 24,
        ]);
    });

    it("draws a Held marcher solid through its hold, and Not defined after it ends", () => {
        expect(decidedOn(b2, [4, 8, 12, 24, 25, 32])).toEqual([4, 8, 12, 24]);
    });
});

describe("marcherDecided", () => {
    it("joins touching moves and marks into one stretch", () => {
        expect(
            marcherDecided(
                [move(0, 8), hold(8, 16), move(16, 24)],
                [{ start: 8, end: 16 }],
            ),
        ).toEqual([{ start: 0, end: 24 }]);
    });

    it("counts a stored move that goes nowhere as decided (holds decision 13)", () => {
        const stay = marcherDecided([hold(-Infinity, 8), move(8, 16)], []);
        expect(decidedOn(stay, [8, 12, 16, 17])).toEqual([12, 16]);
    });

    it("counts a move cut short by a later one as walking, not a gap", () => {
        // A lower move 0–16 cut at 8 by a higher one 8–12, which then resumes 12–16
        const stretches = marcherDecided(
            [
                move(0, 8),
                { start: 8, end: 12, kind: "join" },
                { start: 12, end: 16, kind: "resume" },
            ],
            [],
        );
        expect(stretches).toEqual([{ start: 0, end: 16 }]);
    });

    it("ignores the leading and trailing holds' infinite ends", () => {
        expect(
            marcherDecided([hold(-Infinity, 4), hold(4, Infinity)], []),
        ).toEqual([]);
    });
});

describe("notDefinedAt", () => {
    const decided = new Map([
        [1, marcherDecided([hold(-Infinity, Infinity)], [])],
        [2, marcherDecided([hold(-Infinity, Infinity)], [])],
    ]);

    it("draws a carried shape's members decided: the shape is their hold", () => {
        expect([...notDefinedAt(decided, 12, () => new Set([2]))]).toEqual([1]);
    });

    it("only asks for the carried shapes when someone would be Not defined", () => {
        let asked = 0;
        const carried = () => {
            asked++;
            return new Set<number>();
        };
        notDefinedAt(new Map([[1, [{ start: 0, end: 24 }]]]), 12, carried);
        expect(asked).toBe(0);
        notDefinedAt(decided, 12, carried);
        expect(asked).toBe(1);
    });
});

describe("marksByMarcher", () => {
    it("groups marks by marcher", () => {
        const byMarcher = marksByMarcher([
            { marcherId: 1, start: 0, end: 8 },
            { marcherId: 2, start: 8, end: 16 },
            { marcherId: 1, start: 16, end: 24 },
        ]);
        expect(byMarcher.get(1)?.map((m) => m.start)).toEqual([0, 16]);
        expect(byMarcher.get(2)?.length).toBe(1);
    });
});

// The holds demo's "Anchors · Borrowed hold": pages flag at 8, 16, 24, 32 and 40. B1 last moves on
// Page 2 (0–8); Hold from previous page on Page 6 holds 32–40, where nothing arrives.
describe("borrowed holds (fork #474)", () => {
    const b1 = [move(0, 8), hold(8, Infinity)];

    it("names what a mark grows out of: its arrival, the starting spot, or the spot it borrows", () => {
        expect(heldMarkSource(b1, { start: 8 })).toEqual({ kind: "arrival" });
        expect(
            heldMarkSource([hold(-Infinity, Infinity)], { start: 32 }),
        ).toEqual({ kind: "home" });
        expect(heldMarkSource(b1, { start: 32 })).toEqual({
            kind: "borrowed",
            from: 8,
        });
    });

    it("borrows from the last move before the hold, whichever ends latest", () => {
        expect(
            heldMarkSource(
                [move(0, 8), hold(8, 12), move(12, 14), hold(14, Infinity)],
                { start: 32 },
            ),
        ).toEqual({ kind: "borrowed", from: 14 });
    });

    it("once the set it borrows from goes, names the set before", () => {
        // Page 2's keyframe removed: B1 now last moves on Page 1 (0–4, say)
        expect(
            heldMarkSource([move(0, 4), hold(4, Infinity)], { start: 32 }),
        ).toEqual({ kind: "borrowed", from: 4 });
    });

    it("draws a borrowed Held marcher solid through its hold, and Not defined between", () => {
        const stretches = marcherDecided(b1, [{ start: 32, end: 40 }]);
        expect(decidedOn(stretches, [8, 12, 24, 32, 33, 36, 40, 41])).toEqual([
            8, 33, 36, 40,
        ]);
    });
});

describe("borrowedMoveStart (#474; 04-anchors, consistency review M2)", () => {
    const flags = [8, 16, 24, 32, 40];

    it("starts at the page flag before the hold, after an earlier last arrival", () => {
        expect(
            borrowedMoveStart({ start: 32, lastArrival: 8, marks: [], flags }),
        ).toBe(24);
    });

    it("starts at the last arrival, or an earlier hold's end, when later than that flag", () => {
        expect(
            borrowedMoveStart({ start: 32, lastArrival: 28, marks: [], flags }),
        ).toBe(28);
        expect(
            borrowedMoveStart({
                start: 32,
                lastArrival: 8,
                marks: [{ end: 30 }, { end: 40 }],
                flags,
            }),
        ).toBe(30);
    });

    it("a hold mid-page starts it at the flag before, and none fits before a hold at count 0", () => {
        expect(
            borrowedMoveStart({ start: 28, lastArrival: 8, marks: [], flags }),
        ).toBe(24);
        expect(
            borrowedMoveStart({ start: 0, lastArrival: 0, marks: [], flags }),
        ).toBeNull();
    });
});
