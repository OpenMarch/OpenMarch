import { describe, expect, it } from "vitest";
import {
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
