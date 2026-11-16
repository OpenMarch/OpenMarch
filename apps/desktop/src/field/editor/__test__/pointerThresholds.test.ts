import { describe, expect, it } from "vitest";
import {
    pointerKindOf,
    thresholdsFor,
    type PointerKind,
} from "../pointerThresholds";
import { CLICK_SLOP, DOUBLE_CLICK_SLOP } from "../fieldEditor";
import { hitRadius, MIN_HIT_SCREEN_RADIUS } from "../hitTest";
import { HANDLE_SIZE, handleAt, type HandleId } from "../groupTransform";
import { HANDLE_REACH_PX } from "@/shapes/tool/toolEnv";
import { TOUCH_HIT_RADIUS_PX } from "@/components/canvas/touch/touchHitTest";
import { GESTURE_TIMING } from "@/components/canvas/touch/touchGestures";

const KINDS: PointerKind[] = ["mouse", "pen", "touch"];

describe("thresholdsFor", () => {
    it("keeps the mouse's values exactly as the field has always had them", () => {
        expect(thresholdsFor("mouse")).toEqual({
            clickSlop: 4,
            moveThreshold: 4,
            doubleClickSlop: 8,
            hitRadius: 5,
            handleReach: 6.5,
            shapeHandleReach: 10,
        });
        // and the constants the rest of the app reads are the mouse's
        expect(CLICK_SLOP).toBe(4);
        expect(DOUBLE_CLICK_SLOP).toBe(8);
        expect(MIN_HIT_SCREEN_RADIUS).toBe(5);
        expect(thresholdsFor("mouse").handleReach).toBe(HANDLE_SIZE / 2);
        expect(HANDLE_REACH_PX).toBe(10);
    });

    it("gives a finger a 10 px tap slop, a 12 px move threshold and a 22 px tap radius", () => {
        const touch = thresholdsFor("touch");
        expect(touch.clickSlop).toBe(10);
        expect(touch.moveThreshold).toBe(12);
        expect(touch.hitRadius).toBe(22);
        expect(touch.handleReach).toBe(22);
        expect(touch.shapeHandleReach).toBe(22);
        // the touch gesture rules read the same values
        expect(TOUCH_HIT_RADIUS_PX).toBe(touch.hitRadius);
        expect(GESTURE_TIMING.tapSlopPx).toBe(touch.clickSlop);
    });

    it("gives a pen a modest bump: more than a mouse, less than a finger", () => {
        const mouse = thresholdsFor("mouse");
        const pen = thresholdsFor("pen");
        const touch = thresholdsFor("touch");
        for (const key of Object.keys(mouse) as (keyof typeof mouse)[]) {
            expect(pen[key], key).toBeGreaterThan(mouse[key]);
            expect(pen[key], key).toBeLessThan(touch[key]);
        }
    });

    it.each(KINDS)(
        "never starts a %s drag before the press stops being a click",
        (kind) => {
            const t = thresholdsFor(kind);
            expect(t.moveThreshold).toBeGreaterThanOrEqual(t.clickSlop);
        },
    );
});

describe("pointerKindOf", () => {
    it("reads a PointerEvent's pointerType, and anything else as a mouse", () => {
        expect(pointerKindOf("mouse")).toBe("mouse");
        expect(pointerKindOf("pen")).toBe("pen");
        expect(pointerKindOf("touch")).toBe("touch");
        expect(pointerKindOf("")).toBe("mouse");
        expect(pointerKindOf("unknown")).toBe("mouse");
    });
});

describe("hitRadius by kind", () => {
    it("is the mouse's when no kind is given (a marquee or lasso)", () => {
        expect(hitRadius(0.25)).toBe(hitRadius(0.25, "mouse"));
    });

    it.each(KINDS)("reaches the %s's screen radius when zoomed out", (kind) => {
        expect(hitRadius(0.25, kind) * 0.25).toBeCloseTo(
            thresholdsFor(kind).hitRadius,
        );
    });

    it("is never less than the dot as drawn, for any kind", () => {
        for (const kind of KINDS) expect(hitRadius(100, kind)).toBe(6);
    });
});

describe("handleAt reach", () => {
    const handles = {
        nw: { x: 0, y: 0 },
        n: { x: 50, y: 0 },
        ne: { x: 100, y: 0 },
        e: { x: 100, y: 50 },
        se: { x: 100, y: 100 },
        s: { x: 50, y: 100 },
        sw: { x: 0, y: 100 },
        w: { x: 0, y: 50 },
        rot: { x: 50, y: -20 },
    } satisfies Record<HandleId, { x: number; y: number }>;

    it("reaches half the handle's square by default, as a mouse", () => {
        expect(handleAt(handles, { x: 106.5, y: 50 }, 1)).toBe("e");
        expect(handleAt(handles, { x: 106.6, y: 50 }, 1)).toBeNull();
    });

    it("reaches as far as it's told: a finger's 22 px", () => {
        const reach = thresholdsFor("touch").handleReach;
        expect(handleAt(handles, { x: 122, y: 50 }, 1, reach)).toBe("e");
        expect(handleAt(handles, { x: 122.1, y: 50 }, 1, reach)).toBeNull();
        // at zoom 2, 22 px is 11 field units
        expect(handleAt(handles, { x: 111, y: 50 }, 2, reach)).toBe("e");
    });
});
