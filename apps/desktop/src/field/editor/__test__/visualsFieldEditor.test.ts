import { afterEach, describe, expect, it, vi } from "vitest";
import {
    FieldEditor,
    type DropResult,
    type FieldEditorPorts,
    type FieldPoint,
    type FieldPointer,
} from "../fieldEditor";
import type { MarcherPosition } from "../moveGesture";
import { VisualsFieldEditor } from "../visualsFieldEditor";
import { cancelFieldPoint, requestFieldPoint } from "../../fieldPointPick";
import { useGestureChipStore } from "@/input/gestureChipStore";
import { watchKeyListeners } from "@/shapes/__test__/keyListeners";

/**
 * Marchers 1 to 4 in a row 100 field units apart, at zoom 2 (2 CSS px per
 * field unit), as in fieldEditor.test.ts.
 */
function setup({
    selected = [] as number[],
    takePress = undefined as (() => boolean) | undefined,
} = {}) {
    const clock = { now: 1000 };
    const state = {
        selected: [...selected] as readonly number[],
        shown: null as ReadonlyMap<number, FieldPoint> | null,
        drops: [] as {
            positions: readonly MarcherPosition[];
            answer: (result: DropResult) => void;
        }[],
    };
    const ports: FieldEditorPorts = {
        selection: {
            get: () => state.selected,
            set: vi.fn((ids: readonly number[]) => {
                state.selected = ids;
            }),
        },
        marchers: () => ({
            ids: [1, 2, 3, 4],
            positions: Float64Array.from([
                100, 100, 200, 100, 300, 100, 400, 100,
            ]),
            hidden: Uint8Array.from([0, 0, 0, 0]),
        }),
        zoom: () => 2,
        canSelect: () => true,
        takePress,
        selectionBoxPadding: () => 10,
        showPositions: vi.fn((positions) => {
            state.shown = positions;
        }),
        drop: vi.fn(
            (positions) =>
                new Promise<DropResult>((answer) => {
                    state.drops.push({ positions, answer });
                }),
        ),
    };
    const editor = new VisualsFieldEditor(ports, { now: () => clock.now });
    return { editor, state, ports, clock };
}

const at = (
    x: number,
    y: number,
    modifiers: Partial<Omit<FieldPointer, "field" | "screen">> = {},
): FieldPointer => ({
    field: { x, y },
    screen: { x: x * 2, y: y * 2 },
    button: 0,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    ...modifiers,
});

const click = (
    editor: VisualsFieldEditor,
    x: number,
    y: number,
    modifiers?: Parameters<typeof at>[2],
) => {
    editor.pointerDown(at(x, y, modifiers));
    editor.pointerUp(at(x, y, modifiers));
};

const drag = (
    editor: VisualsFieldEditor,
    from: { x: number; y: number },
    to: { x: number; y: number },
) => {
    editor.pointerDown(at(from.x, from.y));
    editor.pointerMove(at((from.x + to.x) / 2, (from.y + to.y) / 2));
    editor.pointerMove(at(to.x, to.y));
    editor.pointerUp(at(to.x, to.y));
};

/** A click, then a double-click-and-drag around marchers 2 and 3. */
const lassoAround2And3 = (editor: VisualsFieldEditor) => {
    const points = [
        [150, 50],
        [350, 50],
        [350, 150],
        [150, 150],
        [150, 60],
    ] as const;
    click(editor, 150, 50);
    editor.pointerDown(at(150, 50));
    for (const [x, y] of points) editor.pointerMove(at(x, y));
    editor.pointerUp(at(150, 60));
};

describe("VisualsFieldEditor read-only (Visuals mode)", () => {
    const ALL = [1, 2, 3, 4];

    it("still selects by click, marquee and lasso", () => {
        const { editor, state, clock } = setup({ selected: [4] });
        editor.setReadOnly(true);
        click(editor, 100, 100);
        expect(state.selected).toEqual([1]);
        click(editor, 300, 100, { shift: true });
        expect(state.selected).toEqual([1, 3]);
        clock.now += 1000;
        // a marquee from empty field around 2 and 3
        drag(editor, { x: 150, y: 50 }, { x: 350, y: 150 });
        expect(state.selected).toEqual([2, 3]);
        clock.now += 1000;
        click(editor, 100, 300);
        lassoAround2And3(editor);
        expect(state.selected).toEqual([2, 3]);
    });

    it("moves nothing: a drag from a marcher or inside the selection box drops nothing", async () => {
        const { editor, state, ports } = setup({ selected: [1, 2] });
        editor.setReadOnly(true);
        drag(editor, { x: 100, y: 100 }, { x: 160, y: 140 });
        drag(editor, { x: 150, y: 104 }, { x: 150, y: 164 });
        await Promise.resolve();
        expect(ports.drop).not.toHaveBeenCalled();
        expect(state.drops).toEqual([]);
        expect(state.shown).toBeNull();
    });

    it("shows no chip and follows no keys on a drag: nothing moves, so no role is honored", () => {
        const keyListeners = watchKeyListeners();
        const { editor, state } = setup({ selected: [1, 2] });
        editor.setReadOnly(true);
        // Shift from an unselected marcher (which it still adds), then $mod inside the selection box
        for (const [x, y, keys] of [
            [300, 100, { shift: true }],
            [250, 104, { ctrl: true }],
        ] as const) {
            editor.pointerDown(at(x, y, keys));
            editor.pointerMove(at(x + 60, y + 40, keys));
            expect(useGestureChipStore.getState().active).toBe(false);
            expect(keyListeners()).toBe(0);
            editor.pointerUp(at(x + 60, y + 40, keys));
        }
        expect(state.selected).toEqual([1, 2, 3]);
        expect(state.drops).toEqual([]);
        vi.restoreAllMocks();
    });

    it("has no scale or rotation, and refuses a typed rotation", () => {
        const { editor, state, ports } = setup({ selected: ALL });
        editor.setReadOnly(true);
        expect(editor.canTransform()).toBe(false);
        // the right-hand scale handle, then the rotate handle
        drag(editor, { x: 410, y: 100 }, { x: 560, y: 160 });
        drag(editor, { x: 250, y: 70 }, { x: 280, y: 100 });
        editor.rotateSelection(45);
        editor.endRotation();
        expect(ports.drop).not.toHaveBeenCalled();
        expect(state.shown).toBeNull();
    });

    it("ends a drag and a typed rotation in progress, saving neither", () => {
        const { editor, state } = setup({ selected: ALL });
        editor.rotateSelection(30);
        editor.setReadOnly(true);
        expect(editor.typedRotation()).toBe(0);

        editor.setReadOnly(false);
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(150, 150));
        expect(editor.activeGesture()).toBe("move");
        editor.setReadOnly(true);
        expect(editor.activeGesture()).toBeNull();
        editor.pointerUp(at(150, 150));
        expect(state.drops).toEqual([]);
    });

    it("moves again once read-only is off", () => {
        const { editor, state } = setup({ selected: [1] });
        editor.setReadOnly(true);
        editor.setReadOnly(false);
        expect(editor.isReadOnly()).toBe(false);
        expect(editor.canTransform()).toBe(false);
        drag(editor, { x: 100, y: 100 }, { x: 160, y: 140 });
        expect(state.drops).toHaveLength(1);
    });
});

describe("VisualsFieldEditor picking a field point", () => {
    afterEach(() => cancelFieldPoint());

    it("gives the press to the asker: it selects and moves nothing", () => {
        const { editor, state } = setup({ selected: [2] });
        const onPoint = vi.fn();
        requestFieldPoint(onPoint);
        click(editor, 100, 100);
        expect(onPoint).toHaveBeenCalledWith({ x: 100, y: 100 });
        expect(state.selected).toEqual([2]);
        // the next press is the editor's again
        click(editor, 100, 100);
        expect(state.selected).toEqual([1]);
    });

    it("leaves other presses to the app's own takePress", () => {
        const takePress = vi.fn(() => true);
        const { editor, state } = setup({ takePress });
        click(editor, 100, 100);
        expect(takePress).toHaveBeenCalledOnce();
        expect(state.selected).toEqual([]);
    });
});

// Field modes (the shape tool, a selected placed box) come with #181's `FieldEditor.setMode`;
// stood in for here, so the hold works whichever lands first
describe("VisualsFieldEditor and field modes", () => {
    const proto = FieldEditor.prototype as { setMode?(mode: unknown): void };
    afterEach(() => {
        delete proto.setMode;
    });

    it("turns a mode off while read-only, and back on after", () => {
        const applied: unknown[] = [];
        proto.setMode = function (mode: unknown) {
            applied.push(mode);
        };
        const { editor } = setup();
        const modes = editor as unknown as { setMode(mode: unknown): void };
        const tool = { name: "shape tool" };
        modes.setMode(tool);
        expect(applied).toEqual([tool]);

        editor.setReadOnly(true);
        expect(applied.at(-1)).toBeNull();
        // one asked for while read-only waits
        const box = { name: "placed box" };
        modes.setMode(box);
        expect(applied.at(-1)).toBeNull();

        editor.setReadOnly(false);
        expect(applied.at(-1)).toBe(box);
    });
});
