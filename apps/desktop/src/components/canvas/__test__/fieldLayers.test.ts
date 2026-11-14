import { describe, expect, it } from "vitest";
import {
    clearSpot,
    coverInset,
    LAYER_GAP,
    liftClear,
    overlaps,
    type Rect,
} from "../fieldLayers";
import { choosePillPosition } from "../touch/pillPlacement";

// The field at 1180 × 820 landscape with the Inspector open (finding A): 747 × 556 px
const FIELD: Rect = { left: 0, top: 0, width: 747, height: 556 };
// The zoom box in its bottom-right corner, in the touch layout's size
const ZOOM: Rect = { left: 571, top: 451, width: 170, height: 99 };
// The Inspector's edge tab hanging over the field's right edge, at mid-height
const INSPECTOR_TAB: Rect = { left: 723, top: 234, width: 44, height: 88 };

const right = (r: Rect) => r.left + r.width;
const bottom = (r: Rect) => r.top + r.height;

describe("overlaps", () => {
    it("counts the gap between two boxes", () => {
        const a = { left: 0, top: 0, width: 10, height: 10 };
        const b = { left: 14, top: 0, width: 10, height: 10 };
        expect(overlaps(a, b)).toBe(false);
        expect(overlaps(a, b, 8)).toBe(true);
    });
});

describe("clearSpot: the shape editor bar keeps clear of controls", () => {
    it("stays where it is when nothing is in the way", () => {
        const bar = { left: 100, top: 300, width: 400, height: 80 };
        expect(clearSpot(bar, [ZOOM, INSPECTOR_TAB], FIELD)).toEqual({
            left: 100,
            top: 300,
            clear: true,
        });
    });

    it("slides left off the zoom box after a handle drag (finding A)", () => {
        const bar = { left: 215, top: 438, width: 528, height: 115 };
        const spot = clearSpot(bar, [ZOOM, INSPECTOR_TAB], FIELD);
        expect(spot.top).toBe(bar.top);
        expect(right({ ...bar, ...spot })).toBeLessThanOrEqual(
            ZOOM.left - LAYER_GAP,
        );
        expect(spot.left).toBeGreaterThanOrEqual(0);
    });

    it("slides left off the Inspector's edge tab (06b)", () => {
        const bar = { left: 195, top: 250, width: 545, height: 80 };
        const spot = clearSpot(bar, [ZOOM, INSPECTOR_TAB], FIELD);
        expect(spot.top).toBe(bar.top);
        expect(right({ ...bar, ...spot })).toBeLessThanOrEqual(
            INSPECTOR_TAB.left - LAYER_GAP,
        );
    });

    it("goes up when there's no room beside the control", () => {
        const bar = { left: 10, top: 440, width: 720, height: 60 };
        const spot = clearSpot(bar, [ZOOM], FIELD);
        expect(spot.left).toBe(bar.left);
        expect(bottom({ ...bar, ...spot })).toBeLessThanOrEqual(
            ZOOM.top - LAYER_GAP,
        );
    });

    it("keeps clear of two controls at once", () => {
        const bar = { left: 300, top: 280, width: 440, height: 220 };
        const spot = clearSpot(bar, [ZOOM, INSPECTOR_TAB], FIELD);
        const moved = { ...bar, ...spot };
        expect(overlaps(moved, ZOOM, LAYER_GAP)).toBe(false);
        expect(overlaps(moved, INSPECTOR_TAB, LAYER_GAP)).toBe(false);
    });

    it("stays where it is when no spot inside the field is clear", () => {
        const bar = { left: 0, top: 0, width: 747, height: 556 };
        expect(clearSpot(bar, [ZOOM], FIELD)).toEqual({
            left: 0,
            top: 0,
            clear: false,
        });
    });

    it("slides along even when it already runs past the field's bottom", () => {
        const bar = { left: 300, top: 500, width: 400, height: 80 };
        const spot = clearSpot(bar, [ZOOM], FIELD);
        expect(spot.top).toBe(500);
        expect(right({ ...bar, ...spot })).toBeLessThanOrEqual(
            ZOOM.left - LAYER_GAP,
        );
    });
});

describe("liftClear: the zoom box rises above a task's card", () => {
    it("doesn't move with nothing in the way", () => {
        expect(liftClear(ZOOM, [], 0)).toBe(0);
    });

    it("rises above the prop tool's card", () => {
        const card = { left: 370, top: 500, width: 440, height: 140 };
        const lift = liftClear(ZOOM, [card], 0);
        expect(lift).not.toBeNull();
        expect(bottom(ZOOM) - lift!).toBeLessThanOrEqual(card.top - LAYER_GAP);
    });

    it("rises above stacked cards", () => {
        const low = { left: 500, top: 480, width: 300, height: 60 };
        const high = { left: 500, top: 380, width: 300, height: 90 };
        const lift = liftClear(ZOOM, [low, high], 0)!;
        const moved = { ...ZOOM, top: ZOOM.top - lift };
        expect(overlaps(moved, low, LAYER_GAP)).toBe(false);
        expect(overlaps(moved, high, LAYER_GAP)).toBe(false);
    });

    it("has no spot when the card reaches the top", () => {
        const tall = { left: 500, top: 50, width: 300, height: 500 };
        expect(liftClear(ZOOM, [tall], 0)).toBeNull();
    });
});

describe("coverInset: the field's top bars sit below the toolbar panel", () => {
    it("is how far the panel reaches over the field", () => {
        const panel = { left: 0, top: -16, width: 700, height: 100 };
        expect(coverInset(FIELD, [panel])).toBe(84);
    });

    it("is nothing for a closed panel, or one beside the field", () => {
        expect(
            coverInset(FIELD, [{ left: 0, top: 0, width: 0, height: 0 }]),
        ).toBe(0);
        expect(
            coverInset(FIELD, [{ left: 800, top: 0, width: 100, height: 100 }]),
        ).toBe(0);
    });
});

describe("the pill keeps clear of the task's cards and bars", () => {
    const container = { width: 747, height: 556 };
    const pill = { width: 690, height: 56 };
    // Marchers along the field's bottom: every bottom spot covers some (finding B)
    const marchers = Array.from({ length: 30 }, (_, i) => ({
        x: 20 + i * 24,
        y: 520,
    }));
    const pillRect = (p: { left: number; bottom: number }): Rect => ({
        left: p.left,
        top: container.height - p.bottom - pill.height,
        ...pill,
    });

    it("leaves the top to the line tool's card", () => {
        const card = { left: 150, top: 12, width: 450, height: 52 };
        const spot = choosePillPosition(container, pill, null, marchers, [
            ZOOM,
            card,
        ]);
        expect(overlaps(pillRect(spot), card)).toBe(false);
    });

    it("leaves the top to the isolation bar and the toolbar panel", () => {
        const panel = { left: 0, top: -20, width: 700, height: 100 };
        const bar = { left: 100, top: 88, width: 540, height: 44 };
        const spot = choosePillPosition(container, pill, null, marchers, [
            ZOOM,
            panel,
            bar,
        ]);
        const at = pillRect(spot);
        expect(overlaps(at, panel)).toBe(false);
        expect(overlaps(at, bar)).toBe(false);
    });
});

describe("the pill slides along a spot that's in the way", () => {
    it("keeps off both the zoom box and the Inspector's tab at 1180 × 820 (Inspector open)", () => {
        const container = { width: 747, height: 556 };
        const pill = { width: 643, height: 50 };
        // The zoom box and the tab, in the field's pixels
        const zoom = { left: 571, top: 451, width: 170, height: 99 };
        const tab = { left: 711, top: 313, width: 44, height: 113 };
        const spot = choosePillPosition(container, pill, null, [], [zoom, tab]);
        const at = {
            left: spot.left,
            top: container.height - spot.bottom - pill.height,
            ...pill,
        };
        expect(overlaps(at, zoom)).toBe(false);
        expect(overlaps(at, tab)).toBe(false);
        expect(at.top).toBeGreaterThan(container.height / 2);
    });
});
