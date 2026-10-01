import { describe, expect, it } from "vitest";
import type { TransitionRow, XY } from "@openmarch/core";
import {
    castDistance,
    castSlots,
    MAX_CAST_SLOTS,
    nearestSlots,
    transitionSlotPoints,
} from "../timelineCasting";

/** P8.4: nearest-slot casting. */

const slotsAt = (points: XY[]) => points.map((xy, slot) => ({ slot, xy }));

describe("nearestSlots", () => {
    it("gives each marcher the slot nearest to it when the nearest slots differ", () => {
        const cast = nearestSlots(
            [
                { id: 1, xy: [10, 0] },
                { id: 2, xy: [0, 0] },
            ],
            slotsAt([
                [0, 1],
                [10, 1],
            ]),
        );
        expect(Object.fromEntries(cast)).toEqual({ 1: 1, 2: 0 });
    });

    it("minimizes the total distance, not each marcher's own", () => {
        // Greedy (marcher 1 first) would take slot 0 and send marcher 2 far away
        const marchers = [
            { id: 1, xy: [1, 0] as XY },
            { id: 2, xy: [0, 0] as XY },
        ];
        const points: XY[] = [
            [1, 0],
            [100, 0],
        ];
        const cast = nearestSlots(marchers, slotsAt(points));
        const greedy = new Map([
            [1, 0],
            [2, 1],
        ]);
        expect(castDistance(marchers, points, cast)).toBeLessThanOrEqual(
            castDistance(marchers, points, greedy),
        );
    });

    it("leaves the far slots vacant when there are more slots than marchers", () => {
        const cast = nearestSlots(
            [
                { id: 5, xy: [20, 0] },
                { id: 6, xy: [40, 0] },
            ],
            slotsAt([
                [0, 0],
                [20, 0],
                [40, 0],
                [60, 0],
            ]),
        );
        expect(Object.fromEntries(cast)).toEqual({ 5: 1, 6: 2 });
    });

    it("only uses the slots it is given (the vacant ones)", () => {
        const cast = nearestSlots(
            [{ id: 1, xy: [0, 0] }],
            [
                { slot: 3, xy: [50, 0] },
                { slot: 7, xy: [5, 0] },
            ],
        );
        expect(cast.get(1)).toBe(7);
    });

    it("gives distinct slots when slots share a point", () => {
        const cast = nearestSlots(
            [
                { id: 1, xy: [0, 0] },
                { id: 2, xy: [0, 0] },
                { id: 3, xy: [0, 0] },
            ],
            slotsAt([
                [1, 1],
                [1, 1],
                [1, 1],
            ]),
        );
        expect(new Set(cast.values())).toEqual(new Set([0, 1, 2]));
    });

    it("casts nobody for no marchers, and refuses too few slots", () => {
        expect(nearestSlots([], slotsAt([[0, 0]])).size).toBe(0);
        expect(() =>
            nearestSlots(
                [
                    { id: 1, xy: [0, 0] },
                    { id: 2, xy: [0, 0] },
                ],
                slotsAt([[0, 0]]),
            ),
        ).toThrow();
    });
});

describe("transitionSlotPoints", () => {
    const row = (over: Partial<TransitionRow>): TransitionRow => ({
        id: 1,
        start: 0,
        end: 8,
        dest: null,
        slots: 2,
        style: "direct",
        order: "slot",
        params: null,
        ...over,
    });

    it("reads individually placed points", () => {
        expect(
            transitionSlotPoints(
                row({
                    points: [
                        [1, 2],
                        [3, 4],
                    ],
                }),
                {},
            ),
        ).toEqual([
            [1, 2],
            [3, 4],
        ]);
    });

    it("samples a shape, one point per slot from its start to its end (R-13)", () => {
        const points = transitionSlotPoints(row({ dest: 9, slots: 3 }), {
            9: {
                kind: "line",
                geometry: {
                    points: [
                        [0, 0],
                        [40, 0],
                    ],
                },
            },
        });
        expect(points).toHaveLength(3);
        expect(points[0]![0]).toBeCloseTo(0);
        expect(points[1]![0]).toBeCloseTo(20);
        expect(points[2]![0]).toBeCloseTo(40);
    });
});

describe("castSlots", () => {
    const far = [
        { id: 1, xy: [100, 0] as XY },
        { id: 2, xy: [0, 0] as XY },
    ];
    const line = slotsAt([
        [0, 0],
        [50, 0],
        [100, 0],
    ]);

    it("casts direct and arc by nearest slot", () => {
        for (const style of ["direct", "arc"] as const)
            expect(Object.fromEntries(castSlots(style, far, line))).toEqual({
                1: 2,
                2: 0,
            });
    });

    it("gives follow the leader the lowest slots in the marchers' order, wherever they stand", () => {
        expect(
            Object.fromEntries(castSlots("follow_the_leader", far, line)),
        ).toEqual({ 1: 0, 2: 1 });
        // Only among the slots it is given
        expect(
            Object.fromEntries(
                castSlots("follow_the_leader", far, [
                    { slot: 7, xy: [0, 0] },
                    { slot: 3, xy: [0, 0] },
                ]),
            ),
        ).toEqual({ 1: 3, 2: 7 });
    });

    it("falls back to the lowest slots in order past MAX_CAST_SLOTS", () => {
        const n = MAX_CAST_SLOTS + 1;
        const marchers = Array.from({ length: n }, (_, i) => ({
            id: i + 1,
            // In reverse, so nearest-slot casting would reverse them
            xy: [n - 1 - i, 0] as XY,
        }));
        const slots = slotsAt(Array.from({ length: n }, (_, i): XY => [i, 0]));
        const cast = castSlots("direct", marchers, slots);
        expect(cast.get(1)).toBe(0);
        expect(cast.get(n)).toBe(n - 1);
    });
});

describe("a marcher that never moves in the transition", () => {
    it("costs nothing wherever it goes, so the others get their nearest slots", () => {
        const cast = nearestSlots(
            [
                { id: 1, xy: null },
                { id: 2, xy: [0, 0] },
            ],
            slotsAt([
                [0, 0],
                [50, 0],
            ]),
        );
        expect(Object.fromEntries(cast)).toEqual({ 1: 1, 2: 0 });
        expect(
            castDistance([{ id: 1, xy: null }], [[0, 0]], new Map([[1, 0]])),
        ).toBe(0);
    });
});
