// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FINGER_REACH } from "@/components/canvas/fieldLayers";
import {
    clearPlacement,
    editorPlacement,
    GAP_PX,
    isInside,
    oneRowRoom,
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

    it("keeps off its own box's handles and slots when it's nearly as wide as the field (06b, #933)", () => {
        // 1180 × 820 landscape with the Inspector open: the field is 747 × 556, the bar 730 wide
        // with its layout row under it
        const field = { fieldWidth: 747, fieldHeight: 556 };
        const panel = { left: 0, top: 0, width: 747, height: 60 };
        const displayBar = { left: 683, top: 10, width: 58, height: 123 };
        const zoom = { left: 571, top: 453, width: 170, height: 103 };
        const tab = { left: 711, top: 323, width: 44, height: 113 };
        const outline = rectangle(374, 200, 553, 368);
        const handles = [
            ...outline,
            { x: 463, y: 200 },
            { x: 553, y: 284 },
            { x: 463, y: 368 },
            { x: 374, y: 284 },
        ];
        // 6 × 3 slots
        const spots = Array.from({ length: 18 }, (_, i) => ({
            x: 374 + (i % 6) * 36,
            y: 200 + Math.floor(i / 6) * 84,
        }));
        const input = {
            outline,
            handles,
            knob: { x: 463, y: 160 },
            spots,
            width: 730,
            height: 85,
            ...field,
        };
        const at = placed(
            input,
            clearPlacement(input, [displayBar, zoom, tab, panel], [panel]),
        );
        const reach = (p: { x: number; y: number }) =>
            p.x > at.left - FINGER_REACH &&
            p.x < at.left + at.width + FINGER_REACH &&
            p.y > at.top - FINGER_REACH &&
            p.y < at.top + at.height + FINGER_REACH;
        expect(handles.filter(reach)).toEqual([]);
        expect(spots.filter(reach)).toEqual([]);
        expect(hits(at, bounds(outline))).toBe(false);
        expect(hits(at, panel)).toBe(false);
        expect(at.top).toBeGreaterThanOrEqual(0);
        expect(at.top + at.height).toBeLessThanOrEqual(field.fieldHeight);
    });

    it("goes onto the shape only when nowhere else keeps its buttons clear", () => {
        // A shape over nearly the whole field
        const outline = rectangle(20, 100, 680, 880);
        const input = { outline, width: 650, height: 110, ...FIELD };
        const at = placed(input, clearPlacement(input, [ZOOM, PANEL]));
        expect(hits(at, ZOOM)).toBe(false);
        expect(hits(at, PANEL)).toBe(false);
    });

    // #936: a 12 × 8 box pinch-zoomed to 200 %, bigger than the field every way
    describe("kept inside the field's visible box (#936)", () => {
        // 1180 × 820 landscape: the field 747 × 556, the toolbar panel over its top 60 px
        const field = { fieldWidth: 747, fieldHeight: 556 };
        const panel = { left: 0, top: -10, width: 747, height: 70 };
        const displayBar = { left: 683, top: 70, width: 58, height: 123 };
        const zoom = { left: 571, top: 453, width: 170, height: 103 };
        const tab = { left: 711, top: 323, width: 30, height: 113 };
        const visible = { left: 0, top: 60, width: 747, height: 496 };
        // 12 columns × 8 rows of slots, 96 px apart, past every edge of the field
        const outline = rectangle(-150, -100, 950, 700);
        const spots = Array.from({ length: 96 }, (_, i) => ({
            x: -150 + (i % 12) * 100,
            y: -100 + Math.floor(i / 12) * 114,
        }));
        const handles = [
            ...outline,
            { x: 400, y: -100 },
            { x: 950, y: 300 },
            { x: 400, y: 700 },
            { x: -150, y: 300 },
        ];
        const big = {
            outline,
            handles,
            knob: { x: 400, y: -140 },
            spots,
            width: 528,
            height: 130,
            ...field,
        };

        it("stays inside the field, clear of the controls and the panel, though it covers the shape", () => {
            // Following the shape alone, it would leave the field
            const free = placed(
                big,
                clearPlacement(big, [displayBar, zoom, tab, panel], [panel]),
            );
            expect(isInside(free, visible)).toBe(false);
            const at = placed(
                big,
                clearPlacement(
                    big,
                    [displayBar, zoom, tab, panel],
                    [panel],
                    visible,
                ),
            );
            expect(isInside(at, visible)).toBe(true);
            for (const control of [displayBar, zoom, tab, panel])
                expect(hits(at, control)).toBe(false);
        });

        it("stays inside after a pan that puts the shape below the field", () => {
            const low = {
                ...big,
                outline: outline.map((p) => ({ x: p.x, y: p.y + 500 })),
                handles: handles.map((p) => ({ x: p.x, y: p.y + 500 })),
                spots: spots.map((p) => ({ x: p.x, y: p.y + 500 })),
                knob: { x: 400, y: 360 },
            };
            const at = placed(
                low,
                clearPlacement(
                    low,
                    [displayBar, zoom, tab, panel],
                    [panel],
                    visible,
                ),
            );
            expect(isInside(at, visible)).toBe(true);
        });

        it("doesn't move a bar that's already inside", () => {
            const small = {
                outline: rectangle(200, 150, 400, 250),
                width: 300,
                height: 80,
                ...field,
            };
            expect(
                clearPlacement(
                    small,
                    [displayBar, zoom, tab, panel],
                    [panel],
                    visible,
                ),
            ).toEqual(
                clearPlacement(small, [displayBar, zoom, tab, panel], [panel]),
            );
        });
    });
});

/** #936: the editor's one row never reaches under an edge tab, so Place shows whole (06b) */
describe("oneRowRoom", () => {
    it("is the field's width with no edge tabs (the desktop)", () => {
        expect(oneRowRoom(747, [])).toBe(747);
    });

    it("takes off the widest edge tab on each side, with a gap", () => {
        // 06b: the Inspector's tab and the field display rail on the right, the zoom box in the
        // bottom-right corner (too wide to be a tab)
        const tab = { left: 723, top: 323, width: 24, height: 90 };
        const rail = { left: 685, top: 10, width: 54, height: 123 };
        const zoom = { left: 571, top: 453, width: 170, height: 103 };
        expect(oneRowRoom(747, [tab, zoom])).toBe(747 - 24 - 8);
        expect(oneRowRoom(747, [tab, rail, zoom])).toBe(747 - 62 - 8);
        const leftTab = { left: 0, top: 200, width: 30, height: 90 };
        expect(oneRowRoom(747, [leftTab, tab])).toBe(747 - 38 - 32);
    });

    it("so the 730 px bar of 06b goes on two rows", () => {
        const tab = { left: 723, top: 323, width: 24, height: 90 };
        expect(730 > oneRowRoom(747, [tab]) - 2 * 4).toBe(true);
    });
});
