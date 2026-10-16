import { describe, expect, it } from "vitest";
import type { FieldPointer } from "../fieldEditor";
import type { MarcherPosition } from "../moveGesture";
import {
    PRECISION_START,
    anchorAt,
    precisionDelta,
    ruledMove,
    type MoveRules,
    type PrecisionTrack,
} from "../moveRules";

// A grid of 10 field units a step, with center front at (500, 400): rounding
// to 1 step puts marchers on x = 500 ± 10n, y = 400 ± 10n.
const GRID = {
    pixelsPerStep: 10,
    centerFrontPoint: { xPixels: 500, yPixels: 400 },
};

const rules = (overrides: Partial<MoveRules> = {}): MoveRules => ({
    rounding: { nearestXSteps: 1, nearestYSteps: 1 },
    lockX: false,
    lockY: false,
    grid: GRID,
    ...overrides,
});

const pointer = (modifiers: Partial<FieldPointer> = {}): FieldPointer => ({
    field: { x: 0, y: 0 },
    screen: { x: 0, y: 0 },
    button: 0,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    ...modifiers,
});

/** Three marchers off the grid: 3 units right of it and 4 below. */
const GROUP: MarcherPosition[] = [
    { id: 1, x: 503, y: 404 },
    { id: 2, x: 523, y: 404 },
    { id: 3, x: 513, y: 434 },
];

const move = (
    overrides: Partial<MoveRules>,
    delta: { x: number; y: number },
    starts: MarcherPosition[],
    modifiers?: Partial<FieldPointer>,
) => ruledMove(() => rules(overrides))(delta, pointer(modifiers), starts);

describe("ruledMove snapping (user stories 36 and 37)", () => {
    it("snaps a single marcher onto the rounding grid", () => {
        expect(move({}, { x: 26, y: -12 }, [GROUP[0]])).toEqual([
            { id: 1, x: 530, y: 390 },
        ]);
    });

    it("snaps a single marcher to the grid's reference point and step size", () => {
        expect(
            move(
                {
                    rounding: {
                        nearestXSteps: 2,
                        referencePointX: 1,
                        nearestYSteps: 0.5,
                    },
                },
                { x: 26, y: -12 },
                [GROUP[0]],
            ),
        ).toEqual([{ id: 1, x: 530, y: 390 }]);
        expect(
            move(
                {
                    rounding: {
                        nearestXSteps: 2,
                        referencePointX: 1,
                        nearestYSteps: 0.5,
                    },
                },
                { x: 40, y: -11 },
                [GROUP[0]],
            ),
        ).toEqual([{ id: 1, x: 550, y: 395 }]);
    });

    it("moves a group in whole rounding steps, keeping each marcher's offset from the grid", () => {
        expect(move({}, { x: 26, y: -12 }, GROUP)).toEqual([
            { id: 1, x: 533, y: 394 },
            { id: 2, x: 553, y: 394 },
            { id: 3, x: 543, y: 424 },
        ]);
    });

    it("keeps float noise out of a group's positions", () => {
        const moved = ruledMove(() =>
            rules({
                rounding: { nearestXSteps: 0.1, nearestYSteps: 0 },
                grid: { ...GRID, pixelsPerStep: 11.25 },
            }),
        )({ x: 3.4, y: 0.1 + 0.2 }, pointer(), [
            { id: 1, x: 0.1, y: 0.2 },
            { id: 2, x: 10, y: 10 },
        ]);
        expect(moved).toEqual([
            { id: 1, x: 3.475, y: 0.5 },
            { id: 2, x: 13.375, y: 10.3 },
        ]);
    });

    it("moves a group in multiples of each axis's step size", () => {
        expect(
            move(
                { rounding: { nearestXSteps: 4, nearestYSteps: 0.5 } },
                { x: 26, y: -12 },
                GROUP,
            ),
        ).toEqual([
            { id: 1, x: 543, y: 394 },
            { id: 2, x: 563, y: 394 },
            { id: 3, x: 553, y: 424 },
        ]);
    });

    it("follows the pointer on an axis with rounding off", () => {
        expect(
            move(
                { rounding: { nearestXSteps: 0, nearestYSteps: 1 } },
                { x: 26, y: -12 },
                [GROUP[0]],
            ),
        ).toEqual([{ id: 1, x: 529, y: 390 }]);
        expect(move({ rounding: undefined }, { x: 26, y: -12 }, GROUP)).toEqual(
            [
                { id: 1, x: 529, y: 392 },
                { id: 2, x: 549, y: 392 },
                { id: 3, x: 539, y: 422 },
            ],
        );
    });

    it("doesn't snap before the field is known", () => {
        expect(move({ grid: null }, { x: 26, y: -12 }, [GROUP[0]])).toEqual([
            { id: 1, x: 529, y: 392 },
        ]);
    });
});

describe("ruledMove modifiers", () => {
    it("turns snapping off with Shift (user story 38)", () => {
        expect(
            move({}, { x: 26, y: -12 }, [GROUP[0]], { shift: true }),
        ).toEqual([{ id: 1, x: 529, y: 392 }]);
        expect(move({}, { x: 26, y: -12 }, GROUP, { shift: true })).toEqual([
            { id: 1, x: 529, y: 392 },
            { id: 2, x: 549, y: 392 },
            { id: 3, x: 539, y: 422 },
        ]);
    });

    it("turns snapping off with Alt (user story 39)", () => {
        expect(move({}, { x: 26, y: -12 }, [GROUP[0]], { alt: true })).toEqual([
            { id: 1, x: 529, y: 392 },
        ]);
        expect(move({}, { x: 26, y: -12 }, GROUP, { alt: true })).toEqual([
            { id: 1, x: 529, y: 392 },
            { id: 2, x: 549, y: 392 },
            { id: 3, x: 539, y: 422 },
        ]);
    });
});

describe("ruledMove locks (user story 40)", () => {
    it("keeps X where the marchers started with Lock X", () => {
        expect(
            move(
                { lockX: true, rounding: undefined },
                { x: 26, y: -12 },
                GROUP,
            ),
        ).toEqual([
            { id: 1, x: 503, y: 392 },
            { id: 2, x: 523, y: 392 },
            { id: 3, x: 513, y: 422 },
        ]);
        // A single marcher snaps along Y only; X stays off the grid
        expect(move({ lockX: true }, { x: 26, y: -12 }, [GROUP[0]])).toEqual([
            { id: 1, x: 503, y: 390 },
        ]);
    });

    it("keeps Y where the marchers started with Lock Y", () => {
        expect(move({ lockY: true }, { x: 26, y: -12 }, GROUP)).toEqual([
            { id: 1, x: 533, y: 404 },
            { id: 2, x: 553, y: 404 },
            { id: 3, x: 543, y: 434 },
        ]);
        expect(
            move({ lockY: true }, { x: 26, y: -12 }, [GROUP[0]], {
                shift: true,
            }),
        ).toEqual([{ id: 1, x: 529, y: 404 }]);
    });

    it("returns one position per start, in order", () => {
        const moved = move({ lockX: true }, { x: 5, y: 5 }, GROUP);
        expect(moved.map((p) => p.id)).toEqual([1, 2, 3]);
    });
});

describe("precisionDelta (Alt at a quarter speed)", () => {
    /** Runs pointer deltas through the tracker, returning each delta out. */
    const run = (steps: [number, number, boolean][]) => {
        let track: PrecisionTrack = PRECISION_START;
        return steps.map(([x, y, alt]) => {
            const moved = precisionDelta(track, { x, y }, alt);
            track = moved.track;
            return moved.delta;
        });
    };

    it("follows the pointer exactly without Alt", () => {
        expect(
            run([
                [0.1, 0.2, false],
                [0.3, 0.7, false],
            ]),
        ).toEqual([
            { x: 0.1, y: 0.2 },
            { x: 0.3, y: 0.7 },
        ]);
    });

    it("moves a quarter as far as the pointer with Alt", () => {
        expect(
            run([
                [40, -20, true],
                [80, -40, true],
            ]),
        ).toEqual([
            { x: 10, y: -5 },
            { x: 20, y: -10 },
        ]);
    });

    it("doesn't jump when Alt is pressed or released, and keeps the lag after", () => {
        expect(
            run([
                [40, 0, false],
                [40, 0, true], // Alt pressed: same place
                [80, 0, true], // +40 counts as +10
                [80, 0, false], // Alt released: same place
                [100, 0, false], // full speed, 30 behind the pointer
            ]),
        ).toEqual([
            { x: 40, y: 0 },
            { x: 40, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 0 },
            { x: 70, y: 0 },
        ]);
    });
});

describe("anchorAt", () => {
    it("re-anchors the drag on where the marchers are drawn", () => {
        // The pointer is 37 across; the marcher is drawn snapped at 40
        let track = precisionDelta(
            PRECISION_START,
            { x: 37, y: 0 },
            false,
        ).track;
        track = anchorAt(track, { x: 40, y: 0 });
        expect(precisionDelta(track, { x: 37, y: 0 }, true).delta).toEqual({
            x: 40,
            y: 0,
        });
        expect(precisionDelta(track, { x: 77, y: 0 }, true).delta).toEqual({
            x: 50,
            y: 0,
        });
    });
});
