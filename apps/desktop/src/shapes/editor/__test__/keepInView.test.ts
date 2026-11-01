// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MIN_ZOOM, type FieldView } from "@/field/editor/view";
import { CLEAR_PX, editorPlacement, GAP_PX } from "../editorPlacement";
import {
    keepInView,
    VIEW_MARGIN_PX,
    type KeepInViewInput,
} from "../keepInView";

/** Keeping the shape and its editor in view after an edit (#441) */

/** 10 px per field unit, field (0, 0) at the element's top-left: field units × 10 = px */
const VIEW: FieldView = {
    width: 1000,
    height: 600,
    zoom: 10,
    panX: 0,
    panY: 0,
};

/** A box `w` × `h` field units centered at (cx, cy) */
const box = (cx: number, cy: number, w = 10, h = 6) => [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 },
];

const input = (over: Partial<KeepInViewInput> = {}): KeepInViewInput => ({
    view: VIEW,
    outline: box(50, 20),
    width: 300,
    height: 40,
    ...over,
});

/** The shape's and editor's px box in `view` */
const shown = (i: KeepInViewInput, view: FieldView) => {
    const outline = i.outline.map((p) => ({
        x: view.panX + p.x * view.zoom,
        y: view.panY + p.y * view.zoom,
    }));
    const editor = editorPlacement({
        outline,
        width: i.width,
        height: i.height,
        fieldWidth: view.width,
        fieldHeight: view.height,
    });
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    return {
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys, editor.top),
        bottom: Math.max(...ys, editor.top + i.height),
    };
};

const expectInside = (i: KeepInViewInput, view: FieldView) => {
    const s = shown(i, view);
    const m = VIEW_MARGIN_PX - 0.5;
    expect(s.left).toBeGreaterThanOrEqual(m);
    expect(s.right).toBeLessThanOrEqual(view.width - m);
    expect(s.top).toBeGreaterThanOrEqual(m);
    expect(s.bottom).toBeLessThanOrEqual(view.height - m);
};

describe("keep in view", () => {
    it("doesn't move the view when the shape and editor are in view", () => {
        expect(keepInView(input())).toEqual(VIEW);
    });

    it("pans just far enough to bring a corner off the right back", () => {
        const to = keepInView(input({ outline: box(98, 20) }));
        expect(to.zoom).toBe(VIEW.zoom);
        expect(to.panY).toBe(0);
        // The box's right edge (103 units = 1030 px) ends a margin inside the element
        expect(to.panX).toBeCloseTo(1000 - VIEW_MARGIN_PX - 1030);
    });

    it("pans down when the shape goes off the top", () => {
        const to = keepInView(input({ outline: box(50, 1) }));
        expect(to.panX).toBe(0);
        expect(to.panY).toBeCloseTo(VIEW_MARGIN_PX + 20);
    });

    it("keeps the editor in view too", () => {
        // The shape fits low in the view, and the editor flips above it: both end inside
        const i = input({ outline: box(50, 57) });
        expectInside(i, keepInView(i));
    });
});

describe("zooming out", () => {
    it("zooms out just enough when the shape gets wider than the view", () => {
        const i = input({ outline: box(60, 20, 150, 6) });
        const to = keepInView(i);
        // 150 units across fill the view less its margins
        expect(to.zoom).toBeCloseTo((1000 - 2 * VIEW_MARGIN_PX) / 150);
        expectInside(i, to);
    });

    it("counts the editor under the shape when it gets too deep", () => {
        const i = input({ outline: box(50, 30, 10, 60) });
        const to = keepInView(i);
        expect(to.zoom).toBeCloseTo(
            (600 - 2 * VIEW_MARGIN_PX - GAP_PX - CLEAR_PX - 40) / 60,
        );
        expectInside(i, to);
    });

    it("never zooms in, however small the shape", () => {
        const view = { ...VIEW, zoom: 2 };
        const i = input({ view, outline: box(50, 20, 1, 1) });
        expect(keepInView(i).zoom).toBe(2);
    });

    it("stops at the field's least zoom and centers what still doesn't fit", () => {
        const i = input({ outline: box(60, 20, 100_000, 6) });
        const to = keepInView(i);
        expect(to.zoom).toBe(MIN_ZOOM);
        expect(to.panX + 60 * to.zoom).toBeCloseTo(500);
    });
});
