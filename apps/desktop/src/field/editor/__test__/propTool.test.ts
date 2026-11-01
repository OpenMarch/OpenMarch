// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { DrawnOutline } from "@/items/itemOutlines";
import type { OutlineType } from "@/db-functions/items";
import {
    DOUBLE_CLICK_MS,
    FieldEditor,
    type FieldEditorPorts,
    type FieldPoint,
    type FieldPointer,
} from "../fieldEditor";

const ZOOM = 2;

/** Snapping rounds to multiples of 10 field units */
const snap = (p: FieldPoint) => ({
    x: Math.round(p.x / 10) * 10,
    y: Math.round(p.y / 10) * 10,
});

function setup(outlineType: OutlineType) {
    const clock = { now: 1000 };
    const state = {
        selected: [] as readonly number[],
        drawn: [] as DrawnOutline[],
    };
    const ports: FieldEditorPorts = {
        selection: {
            get: () => state.selected,
            set: vi.fn((ids: readonly number[]) => {
                state.selected = ids;
            }),
        },
        marchers: () => ({
            ids: [1],
            positions: Float64Array.from([100, 100]),
        }),
        zoom: () => ZOOM,
        canSelect: () => true,
        showPositions: vi.fn(),
        drop: vi.fn(() => Promise.resolve("saved" as const)),
        snap,
        propDrawn: (outline) => state.drawn.push(outline),
    };
    const editor = new FieldEditor(ports, { now: () => clock.now });
    editor.setPropTool(outlineType);
    return { editor, state, clock };
}

const at = (x: number, y: number): FieldPointer => ({
    field: { x, y },
    screen: { x: x * ZOOM, y: y * ZOOM },
    button: 0,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
});

const click = (editor: FieldEditor, x: number, y: number) => {
    editor.pointerDown(at(x, y));
    editor.pointerUp(at(x, y));
};

describe("the prop tool", () => {
    it("draws a rectangle by dragging, snapped, and hands it over on release", () => {
        const { editor, state } = setup("rectangle");
        editor.pointerDown(at(101, 99));
        editor.pointerMove(at(158, 141));
        expect(editor.propToolShape()?.preview?.points).toEqual([
            { x: 100, y: 100 },
            { x: 160, y: 100 },
            { x: 160, y: 140 },
            { x: 100, y: 140 },
        ]);
        editor.pointerUp(at(158, 141));
        expect(state.drawn).toEqual([
            {
                outlineType: "rectangle",
                centerX: 130,
                centerY: 120,
                widthPixels: 60,
                depthPixels: 40,
            },
        ]);
        expect(editor.propToolShape()?.preview).toBeNull();
    });

    it("never selects while it's on, even pressing a marcher", () => {
        const { editor, state } = setup("rectangle");
        click(editor, 100, 100);
        expect(state.selected).toEqual([]);
        expect(editor.cursor()).toBe("crosshair");
        expect(editor.activeGesture()).toBe("prop");
    });

    it("hands over nothing for a drag too small to be meant, and stays on", () => {
        const { editor, state } = setup("circle");
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(102, 100));
        editor.pointerUp(at(102, 100));
        expect(state.drawn).toEqual([]);
        expect(editor.propToolShape()).not.toBeNull();
    });

    it("draws an arc with three clicks: its ends, then its bulge", () => {
        const { editor, state } = setup("arc");
        click(editor, 0, 0);
        click(editor, 100, 0);
        editor.pointerMove(at(50, 40));
        expect(editor.propToolShape()?.preview?.closed).toBe(false);
        click(editor, 50, 40);
        expect(state.drawn).toHaveLength(1);
        expect(state.drawn[0].points).toEqual([
            { x: 0, y: 0 },
            { x: 50, y: 40 },
            { x: 100, y: 0 },
        ]);
    });

    it("finishes a polygon on a double-click, without a repeated corner", () => {
        const { editor, state, clock } = setup("polygon");
        click(editor, 0, 0);
        clock.now += 1000;
        click(editor, 100, 0);
        clock.now += 1000;
        click(editor, 50, 80);
        clock.now += DOUBLE_CLICK_MS / 2;
        click(editor, 50, 80);
        expect(state.drawn).toHaveLength(1);
        expect(state.drawn[0].points).toEqual([
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 50, y: 80 },
        ]);
    });

    it("keeps a polygon going on a double-click before it has three corners", () => {
        const { editor, state, clock } = setup("polygon");
        click(editor, 0, 0);
        clock.now += DOUBLE_CLICK_MS / 2;
        click(editor, 0, 0);
        expect(state.drawn).toEqual([]);
        expect(editor.propToolShape()?.preview).not.toBeNull();
    });

    it("draws freehand on a drag, unsnapped", () => {
        const { editor, state } = setup("freehand");
        editor.pointerDown(at(1, 1));
        for (let i = 1; i <= 20; i++)
            editor.pointerMove(at(1 + i * 3, 1 + (i % 2 === 0 ? 0 : 30)));
        editor.pointerUp(at(61, 1));
        expect(state.drawn).toHaveLength(1);
        expect(state.drawn[0].outlineType).toBe("freehand");
        expect(state.drawn[0].points![0]).toEqual({ x: 1, y: 1 });
    });

    it("starts over when turned off and on again", () => {
        const { editor } = setup("polygon");
        click(editor, 0, 0);
        editor.setPropTool(null);
        expect(editor.propToolShape()).toBeNull();
        editor.setPropTool("polygon");
        editor.pointerMove(at(10, 10));
        expect(editor.propToolShape()?.preview).toBeNull();
    });
});
