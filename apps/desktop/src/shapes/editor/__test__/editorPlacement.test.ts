// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    editorPlacement,
    GAP_PX,
    stackedPlacement,
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

describe("a second floating editor stacked clear of the first (pathways interaction round 4)", () => {
    // The shape's bar under the same box: where the path bar would go too
    const first = editorPlacement(input());
    const bar = { left: first.left, top: first.top, width: 300, height: 70 };

    it("stays where it goes when it covers nothing", () => {
        expect(stackedPlacement(input(), null)).toEqual(first);
        const away = { ...bar, left: 800, width: 100 };
        expect(stackedPlacement(input(), away)).toEqual(first);
    });

    it("goes under the first bar when it would cover it, a gap between them", () => {
        const p = stackedPlacement(input(), bar);
        expect(p.above).toBe(false);
        expect(p.top).toBe(bar.top + bar.height + GAP_PX);
        expect(p.left).toBe(first.left);
    });

    it("goes above both without room under the first bar", () => {
        const p = stackedPlacement(input({ fieldHeight: 360 }), bar);
        expect(p.above).toBe(true);
        expect(p.top + 40).toBeLessThan(170);
    });
});
