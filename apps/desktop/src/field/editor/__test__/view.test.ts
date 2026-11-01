// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    baseZoom,
    centerAtBase,
    clampPan,
    previewFit,
    isPanButton,
    MAX_ZOOM,
    MIN_ZOOM,
    pinchStep,
    viewBetween,
    wheel,
    zoomAt,
    type FieldView,
    type NavigationSettings,
} from "../view";

const field = { width: 1800, height: 960 };
const view: FieldView = {
    width: 1000,
    height: 600,
    zoom: 0.5,
    panX: 50,
    panY: 60,
};
const mouse: NavigationSettings = {
    trackpadMode: false,
    zoomSensitivity: 1,
    trackpadPanSensitivity: 0.5,
};
const trackpad: NavigationSettings = { ...mouse, trackpadMode: true };

/** Where a field point is drawn in the element. */
const at = (v: FieldView, x: number, y: number) => ({
    x: v.panX + x * v.zoom,
    y: v.panY + y * v.zoom,
});
const toField = (v: FieldView, x: number, y: number) => ({
    x: (x - v.panX) / v.zoom,
    y: (y - v.panY) / v.zoom,
});

const wheelAt = (x: number, y: number, deltaY: number, deltaX = 0) => ({
    x,
    y,
    deltaX,
    deltaY,
    ctrlKey: false,
    metaKey: false,
});

describe("zoomAt", () => {
    it("keeps the field point under the cursor in place", () => {
        const under = toField(view, 300, 200);
        const zoomed = zoomAt(view, { x: 300, y: 200 }, 2);
        expect(zoomed.zoom).toBe(2);
        expect(at(zoomed, under.x, under.y).x).toBeCloseTo(300);
        expect(at(zoomed, under.x, under.y).y).toBeCloseTo(200);
    });

    it("stops at the zoom limits", () => {
        expect(zoomAt(view, { x: 0, y: 0 }, 100).zoom).toBe(MAX_ZOOM);
        expect(zoomAt(view, { x: 0, y: 0 }, 0.01).zoom).toBe(MIN_ZOOM);
    });
});

describe("clampPan", () => {
    it("lets the field scroll at most one element's size past each edge", () => {
        // At zoom 0.5 the field (900 × 480 px) fits: it may sit anywhere
        // inside, and scroll one element's size past it
        const far = clampPan({ ...view, panX: 5000, panY: -5000 }, field);
        expect(far.panX).toBe(1000 - 900 + 1000);
        expect(far.panY).toBe(-600);
        // Zoomed in, it overflows: its far edge may come one size inside
        const zoomed = clampPan(
            { ...view, zoom: 2, panX: -1e6, panY: -1e6 },
            field,
        );
        expect(zoomed.panX).toBe(1000 - 1800 * 2 - 1000);
        expect(zoomed.panY).toBe(600 - 960 * 2 - 600);
    });

    it("leaves a view inside the limits alone", () => {
        expect(clampPan(view, field)).toEqual(view);
    });
});

describe("the opening view", () => {
    it("fits the field's height when the pane is wide, with a margin", () => {
        // 1800 x 960 in a 2000 x 600 pane: the height is the limit
        expect(baseZoom(2000, 600, field)).toBeCloseTo((600 - 32) / 960);
    });

    it("fits the field's width when the pane is narrow, with a margin", () => {
        // A short timeline under a narrow pane: the width is the limit
        expect(baseZoom(1000, 900, field)).toBeCloseTo((1000 - 32) / 1800);
    });

    it("fills a big pane, above 1", () => {
        expect(baseZoom(4000, 2000, field)).toBeCloseTo((2000 - 32) / 960);
    });

    it("keeps most of a small pane for the field", () => {
        // The margin is at most 5% of a side
        expect(baseZoom(2000, 300, field)).toBeCloseTo((300 - 30) / 960);
    });

    it("follows the pane's height as the timeline grows", () => {
        expect(baseZoom(2000, 400, field)).toBeLessThan(
            baseZoom(2000, 600, field),
        );
    });

    it("is 1 before the pane or the field has a size", () => {
        expect(baseZoom(0, 0, field)).toBe(1);
        expect(baseZoom(1000, 600, { width: 0, height: 0 })).toBe(1);
    });

    it("centers the whole field at the base zoom", () => {
        const opened = centerAtBase(1000, 600, field);
        const zoom = Math.min((1000 - 32) / 1800, (600 - 32) / 960);
        expect(opened.zoom).toBeCloseTo(zoom);
        expect(opened.panX).toBeCloseTo((1000 - 1800 * zoom) / 2);
        expect(opened.panY).toBeCloseTo((600 - 960 * zoom) / 2);
        // Every edge of the field is inside the pane
        expect(opened.panX).toBeGreaterThanOrEqual(16 - 1e-9);
        expect(opened.panY).toBeGreaterThanOrEqual(16 - 1e-9);
        expect(opened.panX + 1800 * zoom).toBeLessThanOrEqual(1000 - 16 + 1e-9);
        expect(opened.panY + 960 * zoom).toBeLessThanOrEqual(600 - 16 + 1e-9);
    });
});

describe("viewBetween", () => {
    const zoomedIn: FieldView = {
        width: 1000,
        height: 600,
        zoom: 2,
        panX: -900,
        panY: -300,
    };
    const fitted = centerAtBase(1000, 600, field);
    const shown = (v: FieldView) => ({
        left: -v.panX / v.zoom,
        right: (v.width - v.panX) / v.zoom,
        top: -v.panY / v.zoom,
    });

    it("starts at the first view and ends at the second", () => {
        const start = viewBetween(zoomedIn, fitted, 0);
        expect(start.zoom).toBeCloseTo(zoomedIn.zoom);
        expect(start.panX).toBeCloseTo(zoomedIn.panX);
        expect(start.panY).toBeCloseTo(zoomedIn.panY);
        const end = viewBetween(zoomedIn, fitted, 1);
        expect(end.zoom).toBeCloseTo(fitted.zoom);
        expect(end.panX).toBeCloseTo(fitted.panX);
        expect(end.panY).toBeCloseTo(fitted.panY);
    });

    it("slides the shown part of the field in a straight line", () => {
        const [a, b, half] = [
            shown(zoomedIn),
            shown(fitted),
            shown(viewBetween(zoomedIn, fitted, 0.5)),
        ];
        expect(half.left).toBeCloseTo((a.left + b.left) / 2);
        expect(half.right).toBeCloseTo((a.right + b.right) / 2);
        expect(half.top).toBeCloseTo((a.top + b.top) / 2);
    });

    it("zooms between the two zooms", () => {
        const half = viewBetween(zoomedIn, fitted, 0.5);
        expect(half.zoom).toBeLessThan(zoomedIn.zoom);
        expect(half.zoom).toBeGreaterThan(fitted.zoom);
    });
});

describe("previewFit", () => {
    it("fits the whole field at 87%, centered across and a tenth of the spare height down", () => {
        const fit = previewFit(view, { width: 1600, height: 1000 }, field)!;
        const zoom = Math.min((1600 / 1800) * 0.87, (1000 / 960) * 0.87);
        expect(fit.zoom).toBeCloseTo(zoom);
        expect(fit.panX).toBeCloseTo((1600 - 1800 * zoom) / 2);
        expect(fit.panY).toBeCloseTo((1000 - 960 * zoom) / 10);
    });

    it("does nothing before the container has a size", () => {
        expect(previewFit(view, { width: 0, height: 0 }, field)).toBeNull();
    });
});

describe("wheel", () => {
    it("zooms at the cursor in mouse mode", () => {
        const under = toField(view, 400, 300);
        const zoomedIn = wheel(view, wheelAt(400, 300, -100), mouse, field);
        expect(zoomedIn.zoom).toBeCloseTo(0.5 * 0.997 ** -50);
        expect(at(zoomedIn, under.x, under.y).x).toBeCloseTo(400);
        expect(at(zoomedIn, under.x, under.y).y).toBeCloseTo(300);
        expect(
            wheel(view, wheelAt(400, 300, 100), mouse, field).zoom,
        ).toBeLessThan(0.5);
    });

    it("scales the zoom rate by the zoom sensitivity", () => {
        const fast = wheel(
            view,
            wheelAt(400, 300, -100),
            { ...mouse, zoomSensitivity: 2 },
            field,
        );
        expect(fast.zoom).toBeCloseTo(0.5 * 0.997 ** -100);
    });

    it("pans in trackpad mode, scaled by the pan sensitivity", () => {
        const panned = wheel(view, wheelAt(400, 300, 40, -20), trackpad, field);
        expect(panned).toEqual({ ...view, panX: 60, panY: 40 });
    });

    it("zooms at the cursor on a pinch (Ctrl or Cmd) in either mode, faster than the wheel", () => {
        for (const settings of [mouse, trackpad])
            for (const key of ["ctrlKey", "metaKey"] as const) {
                const pinch = { ...wheelAt(400, 300, -10), [key]: true };
                expect(wheel(view, pinch, settings, field).zoom).toBeCloseTo(
                    0.5 * 0.99 ** -5,
                );
            }
    });

    it("stays within the zoom limits", () => {
        let v = view;
        for (let i = 0; i < 200; i++)
            v = wheel(v, wheelAt(400, 300, -500), mouse, field);
        expect(v.zoom).toBe(MAX_ZOOM);
        for (let i = 0; i < 200; i++)
            v = wheel(v, wheelAt(400, 300, 500), mouse, field);
        expect(v.zoom).toBe(MIN_ZOOM);
    });

    it("keeps the field within the pan limit", () => {
        let v = view;
        for (let i = 0; i < 100; i++)
            v = wheel(v, wheelAt(400, 300, 0, -500), trackpad, field);
        expect(v.panX).toBe(1000 - 900 + 1000);
    });
});

describe("pinchStep", () => {
    it("adds 0.01 zoom per pixel the fingers spread, at the point between them", () => {
        const under = toField(view, 500, 250);
        const pinched = pinchStep(view, { x: 500, y: 250 }, 30, field);
        expect(pinched.zoom).toBeCloseTo(0.8);
        expect(at(pinched, under.x, under.y).x).toBeCloseTo(500);
    });
});

describe("isPanButton", () => {
    it("pans with the right and middle buttons, and Ctrl+left only on a Mac", () => {
        const press = (button: number, ctrlKey = false) => ({
            button,
            ctrlKey,
        });
        expect(isPanButton(press(2), false)).toBe(true);
        expect(isPanButton(press(1), false)).toBe(true);
        expect(isPanButton(press(0), false)).toBe(false);
        expect(isPanButton(press(0, true), false)).toBe(false);
        expect(isPanButton(press(0, true), true)).toBe(true);
        expect(isPanButton(press(0), true)).toBe(false);
    });
});
