// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    cancelFieldPoint,
    requestFieldPoint,
    takeFieldPoint,
} from "../fieldPointPick";

const press = (x: number, y: number) => ({ x, y });

afterEach(() => cancelFieldPoint());

describe("picking a field point", () => {
    it("gives the next press on the field to the asker, once", () => {
        const onPoint = vi.fn();
        requestFieldPoint(onPoint);
        expect(takeFieldPoint(press(12, 34))).toBe(true);
        expect(onPoint).toHaveBeenCalledWith({ x: 12, y: 34 });
        // the next press is the editor's again
        expect(takeFieldPoint(press(1, 2))).toBe(false);
        expect(onPoint).toHaveBeenCalledOnce();
    });

    it("leaves presses alone once cancelled", () => {
        const onPoint = vi.fn();
        requestFieldPoint(onPoint);
        cancelFieldPoint();
        expect(takeFieldPoint(press(1, 2))).toBe(false);
        expect(onPoint).not.toHaveBeenCalled();
    });
});
