// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FieldPointer } from "@/field/editor/fieldEditor";
import { OrderSweepMode } from "../orderSweepMode";
import {
    cancelOrderSweep,
    openOrderSweep,
    useMarcherOrderStore,
} from "../marcherOrderStore";
import type { XY } from "../orderSweep";

/**
 * Set order's field mode (pathways step 4g, DL-27): a drag that picks someone keeps the order at
 * its release; clicks, and a drag that picks no one, leave it on; a cancelled press keeps nothing.
 * The node environment has no animation frames, so each move is worked out at once.
 */

/** Four marchers in a row, 12 apart: ids 1–4 left to right */
const ROW = new Map<number, XY>(
    [1, 2, 3, 4].map((id) => [id, { x: id * 12, y: 0 }]),
);

const at = (x: number, y = 0): FieldPointer => ({
    field: { x, y },
    screen: { x, y },
    button: 0,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    kind: "mouse",
});
const CLICK = { double: false, ownFirst: false };
const sweep = () => useMarcherOrderStore.getState().sweep;

const open = () => {
    openOrderSweep({ ids: [1, 2, 3, 4], at: ROW, beat: 17, before: null });
    const finish = vi.fn();
    return { mode: new OrderSweepMode(finish), finish };
};

afterEach(() => void cancelOrderSweep());

describe("OrderSweepMode", () => {
    it("claims presses only while Set order is on", () => {
        const { mode } = open();
        expect(mode.claims()).toBe(true);
        cancelOrderSweep();
        expect(mode.claims()).toBe(false);
    });

    it("a drag through the marchers picks them in the order passed, and its release keeps the order", () => {
        const { mode, finish } = open();
        mode.press(at(48));
        mode.move(at(30));
        mode.move(at(12));
        expect(sweep()!.picked).toEqual([4, 3, 2, 1]);
        expect(sweep()!.pointer).toEqual({ x: 12, y: 0 });
        mode.release(at(12), null);
        expect(finish).toHaveBeenCalledTimes(1);
        expect(sweep()!.pointer).toBeNull();
    });

    it("a drag that passes no one leaves Set order on, with nothing kept", () => {
        const { mode, finish } = open();
        mode.press(at(30, 100));
        mode.move(at(60, 100));
        mode.release(at(60, 100), null);
        expect(finish).not.toHaveBeenCalled();
        expect(sweep()).not.toBeNull();
        expect(sweep()!.picked).toEqual([]);
        // ...and so does one after clicks that adds no one
        mode.press(at(24));
        mode.release(at(24), CLICK);
        mode.press(at(30, 100));
        mode.move(at(60, 100));
        mode.release(at(60, 100), null);
        expect(finish).not.toHaveBeenCalled();
        expect(sweep()!.picked).toEqual([2]);
        // A drag that adds someone keeps the order
        mode.press(at(36));
        mode.move(at(48));
        mode.release(at(48), null);
        expect(sweep()!.picked).toEqual([2, 3, 4]);
        expect(finish).toHaveBeenCalledTimes(1);
    });

    it("clicks pick one at a time and keep the order once everyone is picked", () => {
        const { mode, finish } = open();
        for (const id of [3, 1, 4]) {
            mode.press(at(id * 12));
            mode.release(at(id * 12), CLICK);
        }
        expect(sweep()!.picked).toEqual([3, 1, 4]);
        expect(finish).not.toHaveBeenCalled();
        mode.press(at(24));
        mode.release(at(24), CLICK);
        expect(finish).toHaveBeenCalledTimes(1);
    });

    it("a cancelled press keeps nothing more and leaves Set order on; moves after it pick no one", () => {
        const { mode, finish } = open();
        mode.press(at(12));
        mode.move(at(24));
        expect(sweep()!.picked).toEqual([1, 2]);
        mode.cancel();
        expect(sweep()!.pointer).toBeNull();
        mode.move(at(48));
        expect(sweep()!.picked).toEqual([1, 2]);
        expect(finish).not.toHaveBeenCalled();
        expect(sweep()).not.toBeNull();
    });
});
