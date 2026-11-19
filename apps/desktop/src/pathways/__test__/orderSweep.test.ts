import { describe, expect, it } from "vitest";
import type { OrderForm } from "@/db-functions/rememberedOrder";
import {
    SWEEP_MIN_PX,
    orderAfterSweep,
    sweepThrough,
    sweepTolerance,
    type XY,
} from "../orderSweep";
import { shownOrderOf, shownOrders } from "../marcherOrderStore";

/**
 * Set order's sweep and the order shown (pathways step 4g, DL-27, DL-30, DL-31,
 * QA-DL-30, QA-DL-31, QA-DL-33)
 */

/** Five marchers in a row, 12 apart (a step of 12): ids 1–5 left to right */
const ROW = new Map<number, XY>(
    [1, 2, 3, 4, 5].map((id) => [id, { x: id * 12, y: 0 }]),
);
const STEP = 12;

describe("sweepTolerance", () => {
    it("is half a step, or a few pixels on screen when zoomed far out", () => {
        // 2 screen px per field unit: half a step (6) is 12 px, more than the minimum
        expect(sweepTolerance(STEP, 2)).toBe(6);
        // 0.1 px per field unit: half a step is 0.6 px, so the minimum holds
        expect(sweepTolerance(STEP, 0.1)).toBeCloseTo(SWEEP_MIN_PX / 0.1);
    });
});

describe("sweepThrough (QA-DL-30)", () => {
    const tolerance = sweepTolerance(STEP, 2);

    it("picks each marcher the way passes near, in the order it passes them", () => {
        // Right to left, a little above the row: the pointer needn't land on the dots
        expect(
            sweepThrough({
                picked: [],
                from: { x: 70, y: 4 },
                to: { x: 30, y: 4 },
                candidates: ROW,
                tolerance,
            }),
        ).toEqual([5, 4, 3]);
    });

    it("leaves out a marcher the way passes farther than half a step from", () => {
        expect(
            sweepThrough({
                picked: [],
                from: { x: 0, y: 7 },
                to: { x: 70, y: 7 },
                candidates: ROW,
                tolerance,
            }),
        ).toEqual([]);
    });

    it("a press picks the marcher under it, within the same reach", () => {
        expect(
            sweepThrough({
                picked: [2],
                from: { x: 37, y: 3 },
                to: { x: 37, y: 3 },
                candidates: ROW,
                tolerance,
            }),
        ).toEqual([2, 3]);
    });

    it("passing a marcher twice does nothing", () => {
        const once = sweepThrough({
            picked: [],
            from: { x: 10, y: 0 },
            to: { x: 40, y: 0 },
            candidates: ROW,
            tolerance,
        });
        expect(once).toEqual([1, 2, 3]);
        // Back over 2 and on to 5
        expect(
            sweepThrough({
                picked: once,
                from: { x: 40, y: 0 },
                to: { x: 20, y: 0 },
                candidates: ROW,
                tolerance,
            }),
        ).toEqual([1, 2, 3]);
        expect(
            sweepThrough({
                picked: once,
                from: { x: 20, y: 0 },
                to: { x: 62, y: 0 },
                candidates: ROW,
                tolerance,
            }),
        ).toEqual([1, 2, 3, 4, 5]);
    });
});

describe("orderAfterSweep (QA-DL-31)", () => {
    it("puts the skipped after those picked, in the order they had", () => {
        expect(
            orderAfterSweep({
                picked: [4, 2],
                before: [1, 2, 3, 4, 5],
                selected: [1, 2, 3, 4, 5],
            }),
        ).toEqual([4, 2, 1, 3, 5]);
    });

    it("with no order before, the skipped go by id; only the selected count", () => {
        expect(
            orderAfterSweep({
                picked: [3, 9],
                before: null,
                selected: [5, 3, 1],
            }),
        ).toEqual([3, 1, 5]);
    });
});

describe("the order shown (QA-DL-33)", () => {
    const set = (endBeat: number, order: number[]): OrderForm => ({
        endBeat,
        kind: "set",
        order,
    });

    it("is the remembered order when there is one", () => {
        expect(
            shownOrderOf([set(9, [3, 1, 5, 2, 4])], [1, 2, 3, 4, 5], 9, ROW),
        ).toEqual({
            order: [3, 1, 5, 2, 4],
            guessed: false,
        });
    });

    it("is the guess from where they stand, marked guessed, when nothing is remembered", () => {
        const shown = shownOrderOf([], [1, 2, 3, 4, 5], 9, ROW);
        expect(shown?.guessed).toBe(true);
        expect([shown!.order, [...shown!.order].reverse()]).toContainEqual([
            1, 2, 3, 4, 5,
        ]);
        // Before the form is made, it's guessed too
        expect(
            shownOrderOf([set(17, [3, 1, 5, 2, 4])], [1, 2, 3, 4, 5], 9, ROW)
                ?.guessed,
        ).toBe(true);
    });

    it("is nothing when the guess fails too, or for fewer than two", () => {
        // Two tight pairs far apart, and one far off both: no line, arc or chain fits
        const scattered = new Map<number, XY>([
            [1, { x: 0, y: 0 }],
            [2, { x: 3, y: 1 }],
            [3, { x: 240, y: 170 }],
            [4, { x: 243, y: 169 }],
            [5, { x: 30, y: 400 }],
        ]);
        expect(shownOrderOf([], [1, 2, 3, 4, 5], 9, scattered)).toBeNull();
        expect(shownOrderOf([], [1], 9, ROW)).toBeNull();
    });

    it("Always draws every line in force, and the selection's guess when nothing holds for it", () => {
        const forms = [set(9, [5, 4, 3]), set(9, [1, 2])];
        expect(
            shownOrders({
                forms,
                selected: [],
                beat: 9,
                at: ROW,
                always: true,
            }),
        ).toEqual([
            { order: [5, 4, 3], guessed: false },
            { order: [1, 2], guessed: false },
        ]);
        // Part of a line drawn already: not drawn again
        expect(
            shownOrders({
                forms,
                selected: [3, 4],
                beat: 9,
                at: ROW,
                always: true,
            }),
        ).toHaveLength(2);
        // While selected only: the selection's own
        expect(
            shownOrders({
                forms,
                selected: [3, 4],
                beat: 9,
                at: ROW,
                always: false,
            }),
        ).toEqual([{ order: [4, 3], guessed: false }]);
    });
});
