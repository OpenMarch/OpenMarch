// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    clearPlacement,
    editorPlacement,
    GAP_PX,
    type PlacementInput,
} from "../editorPlacement";

/** Where the floating editor goes (#437) */

/** A 100 × 60 box centered at (cx, cy), turned by `degrees` */
const box = (cx: number, cy: number, degrees = 0) => {
    const a = (degrees * Math.PI) / 180;
    return [
        [-50, -30],
        [50, -30],
        [50, 30],
        [-50, 30],
    ].map(([x, y]) => ({
        x: cx + x * Math.cos(a) - y * Math.sin(a),
        y: cy + x * Math.sin(a) + y * Math.cos(a),
    }));
};

const input = (over: Partial<PlacementInput> = {}): PlacementInput => ({
    outline: box(400, 200),
    width: 300,
    height: 40,
    fieldWidth: 1000,
    fieldHeight: 600,
    ...over,
});

describe("the floating editor's place", () => {
    it("sits under the outline, centered", () => {
        const p = editorPlacement(input());
        expect(p.above).toBe(false);
        expect(p.left).toBe(400 - 150);
        expect(p.top).toBeGreaterThan(230 + GAP_PX);
    });

    it("goes above with no room below, and follows the outline as it turns", () => {
        expect(editorPlacement(input({ outline: box(400, 540) })).above).toBe(
            true,
        );
        const still = editorPlacement(input());
        const turned = editorPlacement(input({ outline: box(400, 200, 30) }));
        expect(turned.top).not.toBe(still.top);
    });

    it("stays inside the field side to side", () => {
        expect(editorPlacement(input({ outline: box(60, 200) })).left).toBe(4);
        expect(editorPlacement(input({ outline: box(980, 200) })).left).toBe(
            1000 - 300 - 4,
        );
    });

    it("never covers the rotate knob, the shape turned so it's underneath (#485)", () => {
        // Turned 180°: the back edge, and the knob 24 px beyond it, are at the bottom
        const knob = { x: 400, y: 230 + 24 };
        const p = editorPlacement(input({ outline: box(400, 200, 180), knob }));
        expect(p.above).toBe(false);
        expect(p.top).toBeGreaterThanOrEqual(knob.y + GAP_PX);
        // With no room under the knob, above the shape
        const low = { x: 400, y: 560 + 24 };
        const q = editorPlacement(
            input({ outline: box(400, 530, 180), knob: low }),
        );
        expect(q.above).toBe(true);
        expect(q.top + 40).toBeLessThanOrEqual(530 - 30);
    });

    it("keeps centering on the outline when the knob is off to one side (#485)", () => {
        const p = editorPlacement(
            input({ outline: box(400, 200, 90), knob: { x: 454, y: 200 } }),
        );
        expect(p.left).toBeCloseTo(400 - 150);
    });
});

/** #927, touch layout: the editor keeps clear of the controls over the field, off its own shape */
describe("clearPlacement", () => {
    type Box = { left: number; top: number; width: number; height: number };
    const hits = (a: Box, b: Box) =>
        a.left < b.left + b.width &&
        b.left < a.left + a.width &&
        a.top < b.top + b.height &&
        b.top < a.top + a.height;
    // The field at 820 × 1180 portrait with the toolbar panel open
    const FIELD = { fieldWidth: 700, fieldHeight: 900 };
    const PANEL = { left: 0, top: -20, width: 700, height: 110 };
    const ZOOM = { left: 524, top: 795, width: 170, height: 99 };
    const TAB = { left: 656, top: 400, width: 44, height: 113 };
    const rectangle = (
        left: number,
        top: number,
        right: number,
        bottom: number,
    ) => [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
    ];
    const bounds = (outline: { x: number; y: number }[]): Box => {
        const xs = outline.map((p) => p.x);
        const ys = outline.map((p) => p.y);
        return {
            left: Math.min(...xs),
            top: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
        };
    };
    const placed = (
        input: PlacementInput,
        at: { left: number; top: number },
    ): Box => ({ ...at, width: input.width, height: input.height });

    it("is editorPlacement with nothing in the way", () => {
        const input = {
            outline: rectangle(100, 200, 300, 300),
            width: 300,
            height: 80,
            ...FIELD,
        };
        expect(clearPlacement(input, [ZOOM])).toEqual(editorPlacement(input));
    });

    it("slides along under its shape, off the zoom box (portrait, panel open)", () => {
        const outline = rectangle(400, 600, 650, 760);
        const input = { outline, width: 500, height: 110, ...FIELD };
        const at = placed(input, clearPlacement(input, [ZOOM, TAB, PANEL]));
        expect(hits(at, ZOOM)).toBe(false);
        expect(hits(at, TAB)).toBe(false);
        expect(hits(at, bounds(outline))).toBe(false);
        // Still under the shape
        expect(at.top).toBeGreaterThanOrEqual(760 + GAP_PX);
    });

    it("goes to the shape's other side rather than onto it when there's no room beside the control", () => {
        const outline = rectangle(300, 500, 650, 700);
        const input = { outline, width: 650, height: 110, ...FIELD };
        const at = placed(input, clearPlacement(input, [ZOOM, TAB, PANEL]));
        expect(hits(at, ZOOM)).toBe(false);
        expect(hits(at, PANEL)).toBe(false);
        expect(hits(at, bounds(outline))).toBe(false);
        expect(at.top + at.height).toBeLessThanOrEqual(500);
    });

    it("goes onto the shape only when nowhere else keeps its buttons clear", () => {
        // A shape over nearly the whole field
        const outline = rectangle(20, 100, 680, 880);
        const input = { outline, width: 650, height: 110, ...FIELD };
        const at = placed(input, clearPlacement(input, [ZOOM, PANEL]));
        expect(hits(at, ZOOM)).toBe(false);
        expect(hits(at, PANEL)).toBe(false);
    });
});
