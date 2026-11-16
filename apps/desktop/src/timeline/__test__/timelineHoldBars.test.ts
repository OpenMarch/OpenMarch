import { describe, expect, it } from "vitest";
import type { CarrySpan } from "../timelineCarryForward";
import {
    dragLitRanges,
    marcherHoldPieces,
    marcherHolds,
    notDefinedOver,
    selectionHolds,
    type SelectionHoldBar,
} from "../timelineHoldBars";

/**
 * The selection's hold bars and departure ticks (holds README decisions 10 and 11; fork #472,
 * #477). Pages flag at 8, 16, 24 and 32 (spec beats).
 */

const SHOW_END = 32;

const move = (start: number, end: number): CarrySpan => ({
    start,
    end,
    kind: "founding",
});
const hold = (start: number, end: number): CarrySpan => ({
    start,
    end,
    kind: "hold",
});
const mark = (id: number, marcherId: number, start: number, end: number) => ({
    id,
    marcherId,
    start,
    end,
});

describe("marcherHolds", () => {
    it("runs each hold from its arrival to its departure, the leading one from 0", () => {
        expect(
            marcherHolds(
                [
                    hold(-Infinity, 0),
                    move(0, 8),
                    hold(8, 20),
                    move(20, 24),
                    hold(24, Infinity),
                ],
                SHOW_END,
            ),
        ).toEqual([
            { start: 8, end: 20, departs: true },
            { start: 24, end: 32, departs: false },
        ]);
    });

    it("joins touching holds and starts the leading one at the starting spots", () => {
        expect(
            marcherHolds(
                [hold(-Infinity, 4), hold(4, 12), move(12, 16)],
                SHOW_END,
            ),
        ).toEqual([{ start: 0, end: 12, departs: true }]);
    });

    it("stops at the last page flag; a hold past it draws nothing", () => {
        expect(
            marcherHolds([move(0, 36), hold(36, Infinity)], SHOW_END),
        ).toEqual([]);
        expect(marcherHolds([hold(16, 40), move(40, 44)], SHOW_END)).toEqual([
            { start: 16, end: 32, departs: false },
        ]);
    });
});

describe("marcherHoldPieces", () => {
    const holds = [{ start: 8, end: 32, departs: false }];

    it("is Not defined where no mark is, and Held over the marks", () => {
        expect(
            marcherHoldPieces({ holds, marks: [{ start: 16, end: 24 }] }),
        ).toEqual([
            { start: 8, end: 16, kind: "notDefined", shape: false, lit: false },
            { start: 16, end: 24, kind: "held", shape: false, lit: false },
            {
                start: 24,
                end: 32,
                kind: "notDefined",
                shape: false,
                lit: false,
            },
        ]);
    });

    it("draws Held where a shape carries the marcher (`carriedStretches`), Not defined around it", () => {
        expect(
            marcherHoldPieces({
                holds,
                marks: [],
                carried: [{ start: 12, end: 24 }],
            }),
        ).toEqual([
            { start: 8, end: 12, kind: "notDefined", shape: false, lit: false },
            { start: 12, end: 24, kind: "held", shape: true, lit: false },
            {
                start: 24,
                end: 32,
                kind: "notDefined",
                shape: false,
                lit: false,
            },
        ]);
    });

    it("a Held mark wins over a shape carried over the same counts", () => {
        expect(
            marcherHoldPieces({
                holds,
                marks: [{ start: 16, end: 24 }],
                carried: [{ start: 8, end: 32 }],
            }).map((p) => [p.start, p.end, p.kind, p.shape]),
        ).toEqual([
            [8, 16, "held", true],
            [16, 24, "held", false],
            [24, 32, "held", true],
        ]);
    });

    it("cuts a Held mark to the holds: a mark read before an undo reached the resolver draws nothing over a move", () => {
        expect(
            marcherHoldPieces({
                holds: [{ start: 8, end: 16, departs: true }],
                marks: [{ start: 8, end: 24 }],
            }),
        ).toEqual([
            { start: 8, end: 16, kind: "held", shape: false, lit: false },
        ]);
        expect(
            marcherHoldPieces({ holds: [], marks: [{ start: 8, end: 24 }] }),
        ).toEqual([]);
    });

    it("splits where an edit would carry, and marks those parts lit", () => {
        expect(
            marcherHoldPieces({
                holds,
                marks: [{ start: 24, end: 32 }],
                lit: [{ start: 12, end: 28 }],
            }),
        ).toEqual([
            { start: 8, end: 12, kind: "notDefined", shape: false, lit: false },
            { start: 12, end: 24, kind: "notDefined", shape: false, lit: true },
            { start: 24, end: 28, kind: "held", shape: false, lit: true },
            { start: 28, end: 32, kind: "held", shape: false, lit: false },
        ]);
    });
});

describe("dragLitRanges", () => {
    const holds = [
        { start: 8, end: 24, departs: true },
        { start: 28, end: 32, departs: false },
    ];

    it("a drag on the arrival or inside a Not defined stretch carries to the departure", () => {
        expect(dragLitRanges(holds, [], 8)).toEqual([{ start: 8, end: 24 }]);
        expect(dragLitRanges(holds, [], 16)).toEqual([{ start: 16, end: 24 }]);
    });

    it("a drag inside a Held mark moves the whole hold, from its arrival", () => {
        expect(dragLitRanges(holds, [{ start: 8, end: 16 }], 12)).toEqual([
            { start: 8, end: 24 },
        ]);
        // At the mark's end it's still inside it (start < beat <= end)
        expect(dragLitRanges(holds, [{ start: 8, end: 16 }], 16)).toEqual([
            { start: 8, end: 24 },
        ]);
    });

    it("partway through a move, or at a departure, carries into no hold", () => {
        expect(dragLitRanges(holds, [], 26)).toEqual([]);
        expect(dragLitRanges(holds, [], 24)).toEqual([]);
    });

    describe("an Expert window (#476)", () => {
        const mark = [{ start: 8, end: 24 }];

        it("that starts inside the hold wins: lights from the start flag, not the part that stays", () => {
            expect(dragLitRanges(holds, mark, 20, 16)).toEqual([
                { start: 16, end: 24 },
                { start: 20, end: 24 },
            ]);
        });

        it("at the hold's start moves the whole hold", () => {
            expect(dragLitRanges(holds, mark, 20, 8)).toEqual([
                { start: 8, end: 24 },
            ]);
        });

        it("from before the hold's start, ending inside it, moves the whole hold", () => {
            expect(dragLitRanges(holds, mark, 20, 4)).toEqual([
                { start: 8, end: 24 },
            ]);
        });

        it("that covers the hold's start and ends past it lights the hold it replaces", () => {
            expect(
                dragLitRanges(holds, [{ start: 8, end: 16 }], 22, 4),
            ).toEqual([
                { start: 8, end: 16 },
                { start: 22, end: 24 },
            ]);
        });

        it("that starts inside the hold and ends past it lights from the start flag", () => {
            expect(
                dragLitRanges(holds, [{ start: 8, end: 16 }], 22, 12),
            ).toEqual([
                { start: 12, end: 16 },
                { start: 22, end: 24 },
            ]);
        });

        it("leaves a drag with no hold under it as it was", () => {
            expect(dragLitRanges(holds, [], 16, 8)).toEqual([
                { start: 16, end: 24 },
            ]);
        });

        it("without a window (Basic), a drag inside the hold moves all of it", () => {
            expect(dragLitRanges(holds, mark, 20, null)).toEqual([
                { start: 8, end: 24 },
            ]);
        });
    });
});

describe("a hovered command's would-be hold", () => {
    const spansOf = () => [move(0, 8), hold(8, Infinity)];
    const byMarcher = new Map([[1, [{ start: 8, end: 24 }]]]);

    it("draws whole as one pulsing Held bar, over the Not defined bar left as it was", () => {
        const { bars } = selectionHolds({
            marcherIds: [1],
            spansOf,
            marks: [],
            showEnd: SHOW_END,
            light: { byMarcher, wouldHold: true },
        });
        expect(bars.filter((b) => b.preview)).toEqual([
            expect.objectContaining({
                start: 8,
                end: 24,
                kind: "held",
                lit: true,
                marcherIds: [1],
            }),
        ]);
        expect(bars.filter((b) => !b.preview).map((b) => b.lit)).toEqual([
            false,
        ]);
    });

    it("draws even where nothing holds yet: over a move the command would replace", () => {
        const { bars } = selectionHolds({
            marcherIds: [1],
            spansOf: () => [move(0, 24), hold(24, Infinity)],
            marks: [],
            showEnd: 24,
            light: { byMarcher, wouldHold: true },
        });
        expect(bars).toEqual([
            expect.objectContaining({ start: 8, end: 24, preview: true }),
        ]);
    });

    it("a follow-back's light still only lights bars already there", () => {
        const { bars } = selectionHolds({
            marcherIds: [1],
            spansOf,
            marks: [],
            showEnd: SHOW_END,
            light: { byMarcher },
        });
        expect(bars.some((b) => b.preview)).toBe(false);
    });
});

describe("selectionHolds", () => {
    const spans = new Map<number, CarrySpan[]>([
        // T1: moves on page 1, holds to page 3's flag, moves on, holds to the end
        [1, [move(0, 8), hold(8, 24), move(24, 28), hold(28, Infinity)]],
        // T2: the same holds
        [2, [move(0, 8), hold(8, 24), move(24, 28), hold(28, Infinity)]],
        // T3: moves all the way
        [3, [move(0, 32), hold(32, Infinity)]],
    ]);
    const spansOf = (id: number) => spans.get(id) ?? [];

    it("one bar per stretch and kind for the selection, in selection order, with the departures", () => {
        expect(
            selectionHolds({
                marcherIds: [2, 1, 3],
                spansOf,
                marks: [mark(1, 1, 8, 16), mark(2, 4, 8, 16)],
                showEnd: SHOW_END,
            }),
        ).toEqual({
            bars: [
                {
                    start: 8,
                    end: 16,
                    kind: "held",
                    shape: false,
                    lit: false,
                    marcherIds: [1],
                    total: 3,
                },
                {
                    start: 8,
                    end: 24,
                    kind: "notDefined",
                    shape: false,
                    lit: false,
                    marcherIds: [2],
                    total: 3,
                },
                {
                    start: 16,
                    end: 24,
                    kind: "notDefined",
                    shape: false,
                    lit: false,
                    marcherIds: [1],
                    total: 3,
                },
                {
                    start: 28,
                    end: 32,
                    kind: "notDefined",
                    shape: false,
                    lit: false,
                    marcherIds: [2, 1],
                    total: 3,
                },
            ],
            departures: [{ beat: 24, marcherIds: [2, 1], total: 3 }],
        });
    });

    it("during a drag at page 2's flag, lights the Not defined pages it carries into", () => {
        const { bars } = selectionHolds({
            marcherIds: [2],
            spansOf,
            marks: [],
            showEnd: SHOW_END,
            dragBeat: 16,
        });
        expect(bars.map((b) => [b.start, b.end, b.kind, b.lit])).toEqual([
            [8, 16, "notDefined", false],
            [16, 24, "notDefined", true],
            [28, 32, "notDefined", false],
        ]);
    });

    it("during an Expert drag on a later page of a hold, lights only from the start flag on", () => {
        const { bars } = selectionHolds({
            marcherIds: [2],
            spansOf,
            marks: [{ id: 1, marcherId: 2, start: 8, end: 24 }],
            showEnd: SHOW_END,
            dragBeat: 24,
            dragWindowStart: 16,
        });
        expect(bars.map((b) => [b.start, b.end, b.kind, b.lit])).toEqual([
            [8, 16, "held", false],
            [16, 24, "held", true],
            [28, 32, "notDefined", false],
        ]);
    });

    it("the same drag with no window (Basic) lights the whole hold", () => {
        const { bars } = selectionHolds({
            marcherIds: [2],
            spansOf,
            marks: [{ id: 1, marcherId: 2, start: 8, end: 24 }],
            showEnd: SHOW_END,
            dragBeat: 24,
        });
        expect(bars.map((b) => [b.start, b.end, b.kind, b.lit])).toEqual([
            [8, 24, "held", true],
            [28, 32, "notDefined", false],
        ]);
    });

    it("a follow-back light lights only its marchers' bars, on its pages", () => {
        const { bars } = selectionHolds({
            marcherIds: [1, 2],
            spansOf,
            marks: [],
            showEnd: SHOW_END,
            light: { byMarcher: new Map([[1, [{ start: 8, end: 16 }]]]) },
        });
        expect(bars.map((b) => [b.start, b.end, b.lit, b.marcherIds])).toEqual([
            [8, 16, true, [1]],
            [8, 24, false, [2]],
            [16, 24, false, [1]],
            [28, 32, false, [1, 2]],
        ]);
    });

    it("draws nothing without a selection", () => {
        expect(
            selectionHolds({
                marcherIds: [],
                spansOf,
                marks: [],
                showEnd: SHOW_END,
            }),
        ).toEqual({ bars: [], departures: [] });
    });
});

describe("notDefinedOver", () => {
    const bar = (
        start: number,
        end: number,
        kind: SelectionHoldBar["kind"],
    ): SelectionHoldBar => ({
        start,
        end,
        kind,
        shape: false,
        lit: false,
        marcherIds: [1],
        total: 2,
    });

    it("finds where a Held bar has Not defined over the same counts, joined and cut to the bar", () => {
        const held = bar(8, 24, "held");
        expect(
            notDefinedOver(held, [
                held,
                bar(4, 12, "notDefined"),
                bar(10, 16, "notDefined"),
                bar(20, 28, "notDefined"),
                bar(24, 32, "notDefined"),
                bar(8, 24, "held"),
            ]),
        ).toEqual([
            { start: 8, end: 16 },
            { start: 20, end: 24 },
        ]);
        expect(notDefinedOver(held, [held])).toEqual([]);
    });
});
