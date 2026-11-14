import { describe, expect, it } from "vitest";
import {
    FINGER_CLEARANCE,
    FINGER_SIDE_CLEARANCE,
    READOUT_EDGE,
    READOUT_LAYER_GAP,
    touchReadoutPlacement,
} from "../readoutPlacement";
import { overlaps } from "@/components/canvas/fieldLayers";

/** Where a readout of a touch drag goes: clear of the finger, inside the field (tablet 1.7) */

const FIELD = { width: 800, height: 600 };
const PILL = { width: 120, height: 24 };

describe("touchReadoutPlacement", () => {
    it("centers the readout above the finger, its bottom clear of the fingertip", () => {
        expect(touchReadoutPlacement({ x: 400, y: 300 }, PILL, FIELD)).toEqual({
            left: 400 - PILL.width / 2,
            top: 300 - FINGER_CLEARANCE - PILL.height,
        });
    });

    it("keeps inside the field's left and right edges, still above the finger", () => {
        const top = 300 - FINGER_CLEARANCE - PILL.height;
        expect(touchReadoutPlacement({ x: 10, y: 300 }, PILL, FIELD)).toEqual({
            left: READOUT_EDGE,
            top,
        });
        expect(touchReadoutPlacement({ x: 795, y: 300 }, PILL, FIELD)).toEqual({
            left: FIELD.width - PILL.width - READOUT_EDGE,
            top,
        });
    });

    it("goes beside the finger near the top, where there's no room above it", () => {
        const placed = touchReadoutPlacement({ x: 400, y: 40 }, PILL, FIELD);
        expect(placed.left).toBe(400 + FINGER_SIDE_CLEARANCE);
        // Level with the fingertip, never under it
        expect(placed.top).toBe(40 - PILL.height / 2);
        expect(placed.left).toBeGreaterThan(400);
    });

    it("goes to the finger's left near the top right corner", () => {
        const placed = touchReadoutPlacement({ x: 780, y: 40 }, PILL, FIELD);
        expect(placed.left).toBe(780 - FINGER_SIDE_CLEARANCE - PILL.width);
        expect(placed.left + PILL.width).toBeLessThan(780);
    });

    it("never leaves the field, however small it is", () => {
        const tiny = { width: 100, height: 30 };
        const placed = touchReadoutPlacement({ x: 50, y: 15 }, PILL, tiny);
        expect(placed.left).toBe(READOUT_EDGE);
        expect(placed.top).toBe(READOUT_EDGE);
    });
});

/** #936: the handle-drag readout keeps clear of the pill and the Shapes rail near the field's top */
describe("touchReadoutPlacement, clear of the layers over the field", () => {
    // 06c, in the field's px: the pill across the top, the Shapes rail at the top right
    const BOUNDS = { width: 747, height: 556 };
    const PILL_LAYER = { left: 12, top: 88, width: 645, height: 48 };
    const RAIL = { left: 685, top: 0, width: 54, height: 123 };
    const TIP = { width: 190, height: 26 };
    const box = (at: { left: number; top: number }) => ({ ...at, ...TIP });

    it("stays above the finger when nothing is in the way", () => {
        const finger = { x: 400, y: 400 };
        expect(
            touchReadoutPlacement(finger, TIP, BOUNDS, [PILL_LAYER, RAIL]),
        ).toEqual(touchReadoutPlacement(finger, TIP, BOUNDS));
    });

    it("goes beside the finger rather than behind the pill", () => {
        // The finger under the pill: above it, the readout would sit behind the pill
        const finger = { x: 507, y: 170 };
        const plain = box(touchReadoutPlacement(finger, TIP, BOUNDS));
        expect(overlaps(plain, PILL_LAYER)).toBe(true);
        const at = box(
            touchReadoutPlacement(finger, TIP, BOUNDS, [PILL_LAYER, RAIL]),
        );
        expect(overlaps(at, PILL_LAYER, READOUT_LAYER_GAP)).toBe(false);
        expect(overlaps(at, RAIL, READOUT_LAYER_GAP)).toBe(false);
        // Not over or under the finger
        expect(at.left >= finger.x || at.left + at.width <= finger.x).toBe(
            true,
        );
    });

    it("keeps off the rail at the top right, to the finger's left", () => {
        const finger = { x: 640, y: 160 };
        const at = box(
            touchReadoutPlacement(finger, TIP, BOUNDS, [PILL_LAYER, RAIL]),
        );
        expect(overlaps(at, RAIL, READOUT_LAYER_GAP)).toBe(false);
        expect(overlaps(at, PILL_LAYER, READOUT_LAYER_GAP)).toBe(false);
        expect(at.left + at.width).toBeLessThan(finger.x);
    });
});
