import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { fabric } from "fabric";
import {
    DEFAULT_FIELD_THEME,
    rgbaToString,
    type ShapeRow,
} from "@openmarch/core";
import TimelineShapeOverlay from "@/global/classes/canvasObjects/TimelineShapeOverlay";
import {
    useTimelineShapeCanvasStore,
    type TimelineShapeCanvasState,
} from "../timelineShapeCanvas";
import type { ShapeEditTarget } from "../timelineShapeEditor";
import {
    useTimelineShapeCanvas,
    type ShapeOverlayCanvas,
} from "../useTimelineShapeCanvas";

/**
 * P7.11: the picked spec shape on the canvas. The overlay draws it and its handles, redraws it
 * locally on every mouse move and commits once on release; the hook keeps the dragged shape while
 * the edit is pending and redraws from the editor's rows once it settles.
 */

const OFFSET = TimelineShapeOverlay.gridOffset;

const BOX: ShapeRow = {
    kind: "box",
    geometry: { origin: [10, 20], width: 80, height: 40 },
};
const MOVED: ShapeRow = {
    kind: "box",
    geometry: { origin: [10, 20], width: 100, height: 60 },
};
const BLOCK: ShapeRow = {
    kind: "block",
    geometry: { origin: [0, 0], rows: 2, cols: 2, spacing: [10, 10] },
};

const makeCanvas = () => {
    const canvas = new fabric.Canvas(null) as ShapeOverlayCanvas;
    canvas.fieldProperties = { theme: DEFAULT_FIELD_THEME };
    return canvas;
};

const target = (shape: ShapeRow, version = 1): ShapeEditTarget => ({
    id: 3,
    name: null,
    shape,
    version,
    usedBy: [],
    minCells: 0,
});

/** Drags a handle object to field point (x, y): every mouse move, then the release. */
const drag = (
    object: fabric.Object,
    moves: readonly (readonly [number, number])[],
    release = true,
) => {
    for (const [x, y] of moves) {
        object.set({ left: x + OFFSET, top: y + OFFSET });
        object.fire("moving", {});
    }
    if (release) object.fire("modified", {});
};

const outlineOf = (canvas: fabric.Canvas) =>
    canvas.getObjects().find((o) => o instanceof fabric.Polyline) as
        | fabric.Polyline
        | undefined;

const setStore = (state: Partial<TimelineShapeCanvasState>) =>
    act(() => {
        useTimelineShapeCanvasStore.setState(state);
    });

afterEach(() => {
    useTimelineShapeCanvasStore.setState({
        target: null,
        pending: false,
        commit: null,
    });
});

describe("TimelineShapeOverlay", () => {
    it("draws the outline, a block's cells and a handle per shapeHandles", () => {
        const canvas = makeCanvas();
        const overlay = new TimelineShapeOverlay(
            canvas,
            { shape: "red", handleFill: "white" },
            vi.fn(),
        );
        overlay.show(BLOCK, true);
        // outline + 4 cells + move and spacing handles
        expect(canvas.getObjects()).toHaveLength(7);
        expect(overlay.handleObjects).toHaveLength(2);
        overlay.show(BOX, false);
        expect(canvas.getObjects()).toHaveLength(1);
        expect(overlay.handleObjects).toHaveLength(0);
        overlay.clear();
        expect(canvas.getObjects()).toHaveLength(0);
        expect(overlay.shown).toBeNull();
    });

    it("redraws on every mouse move and commits once, on release", () => {
        const canvas = makeCanvas();
        const onCommit = vi.fn();
        const overlay = new TimelineShapeOverlay(
            canvas,
            { shape: "red", handleFill: "white" },
            onCommit,
        );
        overlay.show(BOX, true);
        const corner = overlay.handleObjects[1]!;
        const move = overlay.handleObjects[2]!;
        drag(
            corner,
            [
                [95, 65],
                [105, 75],
                [110, 80],
            ],
            false,
        );
        expect(onCommit).not.toHaveBeenCalled();
        expect(overlay.shown).toEqual(MOVED);
        // The move handle follows to the new middle; the outline's right edge moved
        expect(move.left).toBeCloseTo(60 + OFFSET, 9);
        expect(move.top).toBeCloseTo(50 + OFFSET, 9);
        const outline = outlineOf(canvas)!;
        expect(
            Math.max(...outline.points!.map((p) => p.x)) - OFFSET,
        ).toBeCloseTo(110, 9);
        corner.fire("modified", {});
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith(MOVED);
    });

    it("a move handle drag commits the translated shape", () => {
        const canvas = makeCanvas();
        const onCommit = vi.fn();
        const overlay = new TimelineShapeOverlay(
            canvas,
            { shape: "red", handleFill: "white" },
            onCommit,
        );
        overlay.show(BOX, true);
        drag(overlay.handleObjects[2]!, [
            [55, 45],
            [60, 50],
        ]);
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith({
            kind: "box",
            geometry: { origin: [20, 30], width: 80, height: 40 },
        });
    });

    it("handles that aren't interactive take no drags", () => {
        const canvas = makeCanvas();
        const overlay = new TimelineShapeOverlay(
            canvas,
            { shape: "red", handleFill: "white" },
            vi.fn(),
        );
        overlay.show(BOX, true);
        overlay.setInteractive(false);
        for (const handle of overlay.handleObjects) {
            expect(handle.evented).toBe(false);
            expect(handle.selectable).toBe(false);
        }
    });

    const overlayWith = () => {
        const canvas = makeCanvas();
        const onCommit = vi.fn();
        const overlay = new TimelineShapeOverlay(
            canvas,
            { shape: "red", handleFill: "white" },
            onCommit,
            { milliseconds: 300, distance: 20 },
        );
        return { canvas, overlay, onCommit };
    };
    const at = (x: number, y: number) => ({
        e: new MouseEvent("mousedown", { clientX: x, clientY: y }),
    });

    it("a press shorter and smaller than the drag threshold commits nothing and puts the shape back", () => {
        const { overlay, onCommit } = overlayWith();
        overlay.show(BOX, true);
        const corner = overlay.handleObjects[1]!;
        corner.fire("mousedown", at(0, 0));
        drag(corner, [[93, 63]], false);
        corner.fire("modified", at(3, 3));
        expect(onCommit).not.toHaveBeenCalled();
        expect(overlay.shown).toEqual(BOX);
        expect(corner.left).toBeCloseTo(90 + OFFSET, 9);
    });

    it("a press past the distance threshold is a drag, however quick", () => {
        const { overlay, onCommit } = overlayWith();
        overlay.show(BOX, true);
        const corner = overlay.handleObjects[1]!;
        corner.fire("mousedown", at(0, 0));
        drag(corner, [[110, 80]], false);
        corner.fire("modified", at(40, 0));
        expect(onCommit).toHaveBeenCalledWith(MOVED);
    });

    it("Escape during a drag puts the shape back and commits nothing", () => {
        const { overlay, onCommit } = overlayWith();
        overlay.show(BOX, true);
        const corner = overlay.handleObjects[1]!;
        corner.fire("mousedown", at(0, 0));
        drag(corner, [[110, 80]], false);
        expect(overlay.shown).toEqual(MOVED);
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(overlay.shown).toEqual(BOX);
        // Moves after Escape don't drag the shape again
        drag(corner, [[130, 90]], false);
        expect(overlay.shown).toEqual(BOX);
        corner.fire("modified", at(200, 200));
        corner.fire("mouseup", at(200, 200));
        expect(onCommit).not.toHaveBeenCalled();
        expect(corner.left).toBeCloseTo(90 + OFFSET, 9);
        // The next drag works
        corner.fire("mousedown", at(0, 0));
        drag(corner, [[110, 80]], false);
        corner.fire("modified", at(40, 0));
        expect(onCommit).toHaveBeenCalledWith(MOVED);
    });

    it("on release the dragged handle, too, sits where the committed shape has it", () => {
        const { overlay } = overlayWith();
        overlay.show(BLOCK, true);
        const spacing = overlay.handleObjects[1]!;
        drag(spacing, [[10, 30]]);
        expect(overlay.shown).toEqual({
            kind: "block",
            geometry: { origin: [0, 0], rows: 2, cols: 2, spacing: [10, 30] },
        });
        expect(spacing.top).toBeCloseTo(30 + OFFSET, 9);
    });

    it("draws move handles above the others, so a shape whose handles meet can still be moved", () => {
        const { canvas, overlay } = overlayWith();
        const flat: ShapeRow = {
            kind: "block",
            geometry: { origin: [0, 0], rows: 2, cols: 2, spacing: [0, 0] },
        };
        overlay.show(flat, true);
        const [move, spacing] = overlay.handleObjects;
        expect(move!.timelineShapeHandle.role).toBe("move");
        const objects = canvas.getObjects();
        expect(objects.indexOf(move!)).toBeGreaterThan(
            objects.indexOf(spacing!),
        );
        overlay.bringToFront();
        const after = canvas.getObjects();
        expect(after[after.length - 1]).toBe(move);
    });

    it("redraws in new colors", () => {
        const { canvas, overlay } = overlayWith();
        overlay.show(BOX, true);
        overlay.setColors({ shape: "blue", handleFill: "black" });
        expect(overlay.shown).toEqual(BOX);
        expect(outlineOf(canvas)!.stroke).toBe("blue");
        expect(overlay.handleObjects[0]!.fill).toBe("black");
    });
});

describe("useTimelineShapeCanvas", () => {
    it("draws the picked shape with handles, and nothing in page mode or while playing", () => {
        const canvas = makeCanvas();
        setStore({ target: target(BOX), pending: false, commit: vi.fn() });
        const { rerender } = renderHook(
            (props: { enabled: boolean; isPlaying: boolean }) =>
                useTimelineShapeCanvas({ canvas, ...props }),
            { initialProps: { enabled: false, isPlaying: false } },
        );
        expect(canvas.getObjects()).toHaveLength(0);
        rerender({ enabled: true, isPlaying: false });
        expect(canvas.timelineShapeOverlay?.shown).toEqual(BOX);
        expect(canvas.timelineShapeOverlay?.handleObjects).toHaveLength(3);
        rerender({ enabled: true, isPlaying: true });
        expect(canvas.getObjects()).toHaveLength(0);
        expect(canvas.timelineShapeOverlay).toBeNull();
    });

    it("commits a drag through the editor once, keeps it while pending, then draws the editor's rows", () => {
        const canvas = makeCanvas();
        const commit = vi.fn(() => "started" as const);
        setStore({ target: target(BOX), pending: false, commit });
        renderHook(() =>
            useTimelineShapeCanvas({ canvas, enabled: true, isPlaying: false }),
        );
        const overlay = canvas.timelineShapeOverlay!;
        drag(overlay.handleObjects[1]!, [
            [100, 70],
            [110, 80],
        ]);
        expect(commit).toHaveBeenCalledTimes(1);
        expect(commit).toHaveBeenCalledWith(MOVED);
        // The editor is planning and writing: the dragged shape stays, and takes no drags
        setStore({ pending: true });
        expect(overlay.shown).toEqual(MOVED);
        expect(overlay.handleObjects[0]!.evented).toBe(false);
        // The edit's rows arrive
        setStore({ target: target(MOVED, 2), pending: false });
        expect(overlay.shown).toEqual(MOVED);
        expect(overlay.handleObjects[0]!.evented).not.toBe(false);
    });

    it("a refused drag snaps back to the editor's shape", () => {
        const canvas = makeCanvas();
        setStore({
            target: target(BOX),
            pending: false,
            commit: vi.fn(() => "started" as const),
        });
        renderHook(() =>
            useTimelineShapeCanvas({ canvas, enabled: true, isPlaying: false }),
        );
        const overlay = canvas.timelineShapeOverlay!;
        drag(overlay.handleObjects[1]!, [[0, 0]]);
        setStore({ pending: true });
        // Refused: nothing was written, so the shown rows are the old ones
        setStore({ pending: false });
        expect(overlay.shown).toEqual(BOX);
    });

    it("draws no handles when the shape is first drawn while an edit is pending", () => {
        const canvas = makeCanvas();
        setStore({ target: target(BOX), pending: true, commit: vi.fn() });
        renderHook(() =>
            useTimelineShapeCanvas({ canvas, enabled: true, isPlaying: false }),
        );
        expect(canvas.timelineShapeOverlay!.handleObjects).toHaveLength(0);
        setStore({ pending: false });
        expect(canvas.timelineShapeOverlay!.handleObjects).toHaveLength(3);
    });

    it("a drag that plans no edit snaps back at once (a one-row block dragged in y)", () => {
        const canvas = makeCanvas();
        const row: ShapeRow = {
            kind: "block",
            geometry: { origin: [0, 0], rows: 1, cols: 3, spacing: [10, 10] },
        };
        // A one-row block keeps its y spacing, so the dragged shape is the stored one
        const commit = vi.fn(() => "unchanged" as const);
        setStore({ target: target(row), pending: false, commit });
        renderHook(() =>
            useTimelineShapeCanvas({ canvas, enabled: true, isPlaying: false }),
        );
        const overlay = canvas.timelineShapeOverlay!;
        drag(overlay.handleObjects[1]!, [[20, 25]]);
        expect(commit).toHaveBeenCalledWith(row);
        expect(overlay.shown).toEqual(row);
        expect(overlay.handleObjects[1]!.top).toBeCloseTo(0 + OFFSET, 9);
    });

    it("a drag released while another edit is pending snaps back, and the next drag plans from the saved shape", () => {
        const canvas = makeCanvas();
        const commit = vi.fn(() => "busy" as const);
        setStore({ target: target(BOX), pending: false, commit });
        renderHook(() =>
            useTimelineShapeCanvas({ canvas, enabled: true, isPlaying: false }),
        );
        const overlay = canvas.timelineShapeOverlay!;
        drag(overlay.handleObjects[1]!, [[110, 80]]);
        expect(commit).toHaveBeenCalledTimes(1);
        expect(overlay.shown).toEqual(BOX);
        // Planned from BOX, not from the dropped drag
        drag(overlay.handleObjects[2]!, [[60, 50]]);
        expect(commit).toHaveBeenLastCalledWith({
            kind: "box",
            geometry: { origin: [20, 30], width: 80, height: 40 },
        });
    });

    it("a typed field committing mid-drag: the drag stays drawn, then its dropped release snaps back", () => {
        const canvas = makeCanvas();
        const commit = vi.fn(() => "busy" as const);
        setStore({ target: target(BOX), pending: false, commit });
        renderHook(() =>
            useTimelineShapeCanvas({ canvas, enabled: true, isPlaying: false }),
        );
        const overlay = canvas.timelineShapeOverlay!;
        const corner = overlay.handleObjects[1]!;
        drag(corner, [[110, 80]], false);
        // The field's blur starts its edit while the mouse is still down
        setStore({ pending: true });
        expect(overlay.shown).toEqual(MOVED);
        corner.fire("modified", {});
        expect(commit).toHaveBeenCalledTimes(1);
        expect(overlay.shown).toEqual(BOX);
        // The typed edit's rows arrive and are drawn
        const typed: ShapeRow = {
            kind: "box",
            geometry: { origin: [10, 20], width: 80, height: 50 },
        };
        setStore({ target: target(typed, 2), pending: false });
        expect(overlay.shown).toEqual(typed);
    });

    it("redraws in the new theme's colors", () => {
        const canvas = makeCanvas();
        setStore({ target: target(BOX), pending: false, commit: vi.fn() });
        const { rerender } = renderHook(
            (props: { theme: typeof DEFAULT_FIELD_THEME }) =>
                useTimelineShapeCanvas({
                    canvas,
                    enabled: true,
                    isPlaying: false,
                    ...props,
                }),
            { initialProps: { theme: DEFAULT_FIELD_THEME } },
        );
        rerender({
            theme: {
                ...DEFAULT_FIELD_THEME,
                shape: { r: 1, g: 2, b: 3, a: 1 },
            },
        });
        expect(outlineOf(canvas)!.stroke).toBe(
            rgbaToString({ r: 1, g: 2, b: 3, a: 1 }),
        );
        expect(canvas.timelineShapeOverlay?.shown).toEqual(BOX);
    });

    it("clears when the editor has no shape picked", () => {
        const canvas = makeCanvas();
        setStore({ target: target(BOX), pending: false, commit: vi.fn() });
        renderHook(() =>
            useTimelineShapeCanvas({ canvas, enabled: true, isPlaying: false }),
        );
        expect(canvas.getObjects().length).toBeGreaterThan(0);
        setStore({ target: null, commit: null });
        expect(canvas.getObjects()).toHaveLength(0);
    });
});
