import { describe, expect, it, vi } from "vitest";
import {
    FieldEditor,
    type FieldEditorPorts,
    type FieldPointer,
} from "../fieldEditor";
import {
    lineOrder,
    lineUp,
    orderAlongLine,
    roundToStep,
    spacedAlong,
    type FieldLine,
} from "../lineTool";
import type { MarcherPosition } from "../moveGesture";

const line = (x1: number, y1: number, x2: number, y2: number): FieldLine => ({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
});

describe("lineOrder", () => {
    it("orders a shallow line by x, in the direction it was drawn", () => {
        expect(lineOrder(line(0, 0, 100, 30))).toBe("leftToRight");
        expect(lineOrder(line(100, 30, 0, 0))).toBe("rightToLeft");
        expect(lineOrder(line(0, 0, 100, -100))).toBe("leftToRight");
    });

    it("orders a steep line by y, in the direction it was drawn", () => {
        expect(lineOrder(line(0, 0, 30, 100))).toBe("topToBottom");
        expect(lineOrder(line(30, 100, 0, 0))).toBe("bottomToTop");
    });

    it("orders a vertical line by y, and a zero-length one bottom to top", () => {
        expect(lineOrder(line(5, 0, 5, 10))).toBe("topToBottom");
        expect(lineOrder(line(5, 10, 5, 0))).toBe("bottomToTop");
        expect(lineOrder(line(5, 5, 5, 5))).toBe("bottomToTop");
    });
});

describe("orderAlongLine", () => {
    const marchers = [
        { id: 1, x: 10, y: 40 },
        { id: 2, x: 30, y: 10 },
        { id: 3, x: 20, y: 30 },
    ];
    const ids = (ordered: { id: number }[]) => ordered.map((m) => m.id);

    it("sorts by the line's order, without changing its input", () => {
        expect(ids(orderAlongLine(marchers, line(0, 0, 100, 0)))).toEqual([
            1, 3, 2,
        ]);
        expect(ids(orderAlongLine(marchers, line(100, 0, 0, 0)))).toEqual([
            2, 3, 1,
        ]);
        expect(ids(orderAlongLine(marchers, line(0, 0, 0, 100)))).toEqual([
            2, 3, 1,
        ]);
        expect(ids(orderAlongLine(marchers, line(0, 100, 0, 0)))).toEqual([
            1, 3, 2,
        ]);
        expect(ids(marchers)).toEqual([1, 2, 3]);
    });

    it("keeps marchers level with each other in their given order", () => {
        const level = [
            { id: 7, x: 5, y: 0 },
            { id: 3, x: 5, y: 9 },
        ];
        expect(ids(orderAlongLine(level, line(0, 0, 100, 0)))).toEqual([7, 3]);
    });
});

describe("spacedAlong", () => {
    it("spaces points evenly from the start to the end", () => {
        expect(spacedAlong(line(0, 0, 90, -30), 4)).toEqual([
            { x: 0, y: 0 },
            { x: 30, y: -10 },
            { x: 60, y: -20 },
            { x: 90, y: -30 },
        ]);
    });

    it("puts two at the ends, and one at the start", () => {
        expect(spacedAlong(line(1, 2, 3, 4), 2)).toEqual([
            { x: 1, y: 2 },
            { x: 3, y: 4 },
        ]);
        expect(spacedAlong(line(1, 2, 3, 4), 1)).toEqual([{ x: 1, y: 2 }]);
    });
});

describe("lineUp", () => {
    it("gives each marcher its spot by its order along the line", () => {
        const marchers = [
            { id: 1, x: 503, y: 304 },
            { id: 2, x: 603, y: 354 },
            { id: 3, x: 703, y: 284 },
        ];
        // Drawn right to left: the rightmost marcher goes to the start
        expect(lineUp(marchers, line(300, 0, 100, 0))).toEqual([
            { id: 3, x: 300, y: 0 },
            { id: 2, x: 200, y: 0 },
            { id: 1, x: 100, y: 0 },
        ]);
    });
});

describe("roundToStep", () => {
    const grid = {
        centerFrontPoint: { xPixels: 800, yPixels: 600 },
        pixelsPerStep: 12,
    };

    it("rounds to the nearest whole step from center front", () => {
        expect(roundToStep({ x: 805, y: 593.9 }, grid)).toEqual({
            x: 800,
            y: 588,
        });
        expect(roundToStep({ x: 807, y: 611 }, grid)).toEqual({
            x: 812,
            y: 612,
        });
    });
});

// The editor with the line tool: marchers 1 to 4 in a row, zoom 1, a
// 10-unit step grid from (0, 0).
function setup({ takePress = () => false } = {}) {
    let selected: readonly number[] = [];
    const positions = Float64Array.from([
        100, 100, 200, 120, 300, 100, 400, 140,
    ]);
    const previews = vi.fn<(positions: readonly MarcherPosition[]) => void>();
    const ports: FieldEditorPorts = {
        selection: {
            get: () => selected,
            set: vi.fn((ids: readonly number[]) => {
                selected = ids;
            }),
        },
        marchers: () => ({
            ids: [1, 2, 3, 4],
            positions,
        }),
        zoom: () => 1,
        canSelect: () => true,
        takePress,
        showPositions: vi.fn(),
        drop: vi.fn(),
        lineFinished: previews,
        stepGrid: () => ({
            centerFrontPoint: { xPixels: 0, yPixels: 0 },
            pixelsPerStep: 10,
        }),
    };
    const editor = new FieldEditor(ports);
    return { editor, ports, previews, positions, selection: () => selected };
}

const at = (
    x: number,
    y: number,
    modifiers: Partial<Omit<FieldPointer, "field" | "screen">> = {},
): FieldPointer => ({
    field: { x, y },
    screen: { x, y },
    button: 0,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    ...modifiers,
});

/** Presses and releases at (x, y). */
const click = (
    editor: FieldEditor,
    x: number,
    y: number,
    modifiers?: Partial<FieldPointer>,
) => {
    const taken = editor.pointerDown(at(x, y, modifiers));
    editor.pointerUp(at(x, y, modifiers));
    return taken;
};

describe("FieldEditor line tool", () => {
    it("is the gesture while it's on, with a crosshair, and nothing before the first click", () => {
        const { editor } = setup();
        editor.setLineTool([1, 2, 3]);
        expect(editor.activeGesture()).toBe("line");
        expect(editor.cursor()).toBe("crosshair");
        expect(editor.lineToolShape()).toEqual({
            marchers: [1, 2, 3],
            line: null,
            previews: [],
        });
        editor.setLineTool(null);
        expect(editor.activeGesture()).toBeNull();
        expect(editor.cursor()).toBe("default");
        expect(editor.lineToolShape()).toBeNull();
    });

    it("starts a line on a click, rounded to whole steps, and its end follows the pointer", () => {
        const { editor } = setup();
        editor.setLineTool([1, 2, 3]);
        expect(click(editor, 104, 46)).toBe(true);
        expect(editor.lineToolShape()!.line).toEqual({
            start: { x: 100, y: 50 },
            end: { x: 100, y: 50 },
            drawing: true,
        });
        editor.pointerMove(at(333, 77));
        expect(editor.lineToolShape()!.line!.end).toEqual({ x: 330, y: 80 });
    });

    it("finishes on the second click with the marchers lined up, and publishes them", () => {
        const { editor, previews, selection } = setup();
        editor.setLineTool([1, 2, 3]);
        click(editor, 300, 0);
        editor.pointerMove(at(150, 0));
        click(editor, 100, 0);
        const shape = editor.lineToolShape()!;
        expect(shape.line).toEqual({
            start: { x: 300, y: 0 },
            end: { x: 100, y: 0 },
            drawing: false,
        });
        // Right to left: marcher 3 (rightmost) at the start
        const expected = [
            { id: 3, x: 300, y: 0 },
            { id: 2, x: 200, y: 0 },
            { id: 1, x: 100, y: 0 },
        ];
        expect(previews).toHaveBeenCalledExactlyOnceWith(expected);
        expect(shape.previews).toEqual([
            { id: 3, from: { x: 300, y: 100 }, to: { x: 300, y: 0 } },
            { id: 2, from: { x: 200, y: 120 }, to: { x: 200, y: 0 } },
            { id: 1, from: { x: 100, y: 100 }, to: { x: 100, y: 0 } },
        ]);
        // Moves no longer change a finished line, and nothing was selected
        editor.pointerMove(at(500, 500));
        expect(editor.lineToolShape()!.line!.end).toEqual({ x: 100, y: 0 });
        expect(selection()).toEqual([]);
    });

    it("keeps the pointer's points with Shift", () => {
        const { editor } = setup();
        editor.setLineTool([1, 2]);
        click(editor, 104, 46, { shift: true });
        editor.pointerMove(at(333, 77, { shift: true }));
        expect(editor.lineToolShape()!.line).toMatchObject({
            start: { x: 104, y: 46 },
            end: { x: 333, y: 77 },
        });
    });

    it("never selects a marcher, not even a click right on one, before or after the line", () => {
        const { editor, ports } = setup();
        editor.setLineTool([1, 2]);
        click(editor, 400, 140);
        click(editor, 200, 120);
        click(editor, 300, 100);
        // A drag after the line draws no marquee
        editor.pointerDown(at(0, 0));
        editor.pointerMove(at(450, 200));
        editor.pointerUp(at(450, 200));
        expect(ports.selection.set).not.toHaveBeenCalled();
        expect(editor.activeGesture()).toBe("line");
    });

    it("clears the line on a right-click, which navigation still gets, and the next click starts a new one", () => {
        const { editor, previews } = setup();
        editor.setLineTool([1, 2]);
        click(editor, 0, 0);
        click(editor, 100, 0);
        expect(editor.pointerDown(at(50, 50, { button: 2 }))).toBe(false);
        // Cleared on the release, not the press
        expect(editor.lineToolShape()!.line).not.toBeNull();
        editor.pointerUp(at(51, 50, { button: 2 }));
        // The finished line's previews stay until the next is finished
        expect(editor.lineToolShape()).toMatchObject({
            line: null,
            previews: [{ id: 1 }, { id: 2 }],
        });
        click(editor, 0, 200);
        expect(editor.lineToolShape()!.line).toMatchObject({
            start: { x: 0, y: 200 },
            drawing: true,
        });
        click(editor, 100, 200);
        expect(previews).toHaveBeenCalledTimes(2);
    });

    it("keeps the line through a right-drag, which pans (story 5)", () => {
        const { editor } = setup();
        editor.setLineTool([1, 2]);
        click(editor, 0, 0);
        editor.pointerMove(at(100, 0));
        // The release lands 4 screen px or more from the press: a pan, not a click
        editor.pointerDown(at(50, 50, { button: 2 }));
        editor.pointerUp(at(54, 50, { button: 2 }));
        expect(editor.lineToolShape()!.line).toMatchObject({
            start: { x: 0, y: 0 },
            drawing: true,
        });
        editor.pointerMove(at(200, 0));
        expect(editor.lineToolShape()!.line!.end).toEqual({ x: 200, y: 0 });
    });

    it("leaves the line alone on a Ctrl/Cmd+click", () => {
        const { editor, ports } = setup();
        editor.setLineTool([1, 2]);
        click(editor, 0, 0, { ctrl: true });
        click(editor, 0, 0, { meta: true });
        expect(editor.lineToolShape()!.line).toBeNull();
        click(editor, 0, 0);
        click(editor, 100, 0, { ctrl: true });
        expect(editor.lineToolShape()!.line!.drawing).toBe(true);
        expect(ports.selection.set).not.toHaveBeenCalled();
    });

    it("leaves a press the app takes (a held preview) to the app", () => {
        let take = true;
        const { editor } = setup({ takePress: () => take });
        editor.setLineTool([1, 2]);
        expect(click(editor, 0, 0)).toBe(true);
        expect(editor.lineToolShape()!.line).toBeNull();
        take = false;
        click(editor, 0, 0);
        expect(editor.lineToolShape()!.line).not.toBeNull();
    });

    it("starts over when turned on again, and ends a gesture in progress", () => {
        const { editor } = setup();
        // A marquee in progress
        editor.pointerDown(at(0, 0));
        editor.pointerMove(at(50, 50));
        expect(editor.activeGesture()).toBe("marquee");
        editor.setLineTool([1, 2]);
        expect(editor.activeGesture()).toBe("line");
        click(editor, 0, 0);
        editor.setLineTool([1, 2, 3]);
        expect(editor.lineToolShape()!.line).toBeNull();
    });

    it("lines the marchers up again from where they're drawn now, as on a page change", () => {
        const { editor, previews, positions } = setup();
        editor.setLineTool([1, 2, 3]);
        click(editor, 0, 0);
        click(editor, 200, 0);
        editor.refreshLineTool();
        expect(previews).toHaveBeenCalledTimes(1);
        // Marcher 1 now stands right of marcher 3: the order changes
        positions[0] = 350;
        editor.refreshLineTool();
        expect(previews).toHaveBeenLastCalledWith([
            { id: 2, x: 0, y: 0 },
            { id: 3, x: 100, y: 0 },
            { id: 1, x: 200, y: 0 },
        ]);
        expect(editor.lineToolShape()!.previews[2].from).toEqual({
            x: 350,
            y: 100,
        });
    });

    it("doesn't line up again while the line is drawn, or once it's cleared", () => {
        const { editor, previews } = setup();
        editor.setLineTool([1, 2]);
        click(editor, 0, 0);
        editor.refreshLineTool();
        expect(previews).not.toHaveBeenCalled();
        click(editor, 100, 0);
        click(editor, 0, 0, { button: 2 });
        editor.refreshLineTool();
        expect(previews).toHaveBeenCalledTimes(1);
    });

    it("tells its listeners about each change", () => {
        const { editor } = setup();
        const listener = vi.fn();
        editor.subscribe(listener);
        editor.setLineTool([1, 2]);
        click(editor, 0, 0);
        editor.pointerMove(at(40, 0));
        expect(listener).toHaveBeenCalledTimes(3);
    });
});
