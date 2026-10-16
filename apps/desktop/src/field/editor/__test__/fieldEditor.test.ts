import { describe, expect, it, vi } from "vitest";
import {
    CLICK_SLOP,
    DOUBLE_CLICK_MS,
    FieldEditor,
    type DropResult,
    type FieldEditorPorts,
    type FieldPoint,
    type FieldPointer,
} from "../fieldEditor";
import type { MarcherPosition, MoveTransform } from "../moveGesture";

/**
 * Marchers 1 to 4 in a row 100 field units apart, at zoom 2 (2 CSS px per
 * field unit, so 4 screen px is 2 field units).
 */
function setup({
    selected = [] as number[],
    dimmed = [] as number[],
    hidden = [] as number[],
    isMac = false,
    takePress = undefined as (() => boolean) | undefined,
    moveTransform = undefined as MoveTransform | undefined,
} = {}) {
    const clock = { now: 1000 };
    const state = {
        selected: [...selected] as readonly number[],
        /** What the field draws instead of the show, as the editor last said */
        shown: null as ReadonlyMap<number, FieldPoint> | null,
        /** Each drop handed to the timeline, with the answer to give it */
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
            hidden: Uint8Array.from([1, 2, 3, 4], (id) =>
                hidden.includes(id) ? 1 : 0,
            ),
        }),
        zoom: () => 2,
        canSelect: (id) => !dimmed.includes(id),
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
    const editor = new FieldEditor(ports, {
        isMac,
        moveTransform,
        now: () => clock.now,
    });
    return { editor, state, ports, clock };
}

const ZOOM = 2;

/** A pointer at field point (x, y), with the screen point the view puts it at. */
const at = (
    x: number,
    y: number,
    modifiers: Partial<Omit<FieldPointer, "field" | "screen">> = {},
): FieldPointer => ({
    field: { x, y },
    screen: { x: x * ZOOM, y: y * ZOOM },
    button: 0,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    ...modifiers,
});

const click = (
    editor: FieldEditor,
    x: number,
    y: number,
    modifiers?: Parameters<typeof at>[2],
) => {
    editor.pointerDown(at(x, y, modifiers));
    editor.pointerUp(at(x, y, modifiers));
};

const EMPTY = { x: 250, y: 300 };

describe("FieldEditor click selection", () => {
    it("selects only the marcher clicked", () => {
        const { editor, state } = setup({ selected: [2] });
        click(editor, 100, 101);
        expect(state.selected).toEqual([1]);
    });

    it("adds a marcher with Shift+click, and removes a selected one", () => {
        const { editor, state } = setup({ selected: [1] });
        click(editor, 300, 100, { shift: true });
        expect(state.selected).toEqual([1, 3]);
        click(editor, 100, 100, { shift: true });
        expect(state.selected).toEqual([3]);
    });

    it("clears the selection on a click on empty field", () => {
        const { editor, state } = setup({ selected: [1, 2] });
        click(editor, EMPTY.x, EMPTY.y);
        expect(state.selected).toEqual([]);
    });

    it("keeps the selection on a Shift+click on empty field", () => {
        const { editor, state, ports } = setup({ selected: [1, 2] });
        click(editor, EMPTY.x, EMPTY.y, { shift: true });
        expect(state.selected).toEqual([1, 2]);
        expect(ports.selection.set).not.toHaveBeenCalled();
    });

    it("narrows a selection to the selected marcher clicked (user story 23)", () => {
        const { editor, state } = setup({ selected: [1, 2, 3] });
        click(editor, 200, 100);
        expect(state.selected).toEqual([2]);
    });

    it("doesn't write a selection that hasn't changed", () => {
        const { editor, ports } = setup({ selected: [1] });
        click(editor, 100, 100);
        click(editor, EMPTY.x, EMPTY.y, { shift: true });
        expect(ports.selection.set).not.toHaveBeenCalled();
    });

    it("can't select a dimmed marcher: a click on one is a click on empty field", () => {
        const { editor, state } = setup({ selected: [1], dimmed: [2] });
        click(editor, 200, 100, { shift: true });
        expect(state.selected).toEqual([1]);
        click(editor, 200, 100);
        expect(state.selected).toEqual([]);
    });

    it("selects at release, not at press", () => {
        const { editor, state } = setup();
        editor.pointerDown(at(100, 100));
        expect(state.selected).toEqual([]);
        editor.pointerUp(at(100, 100));
        expect(state.selected).toEqual([1]);
    });
});

describe("FieldEditor click vs drag", () => {
    const slop = CLICK_SLOP / ZOOM;

    it("counts a press that moves under 4 screen px as a click, however long it takes", () => {
        const { editor, state } = setup();
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(100 + slop * 0.6, 100 + slop * 0.6));
        editor.pointerUp(at(100 + slop * 0.6, 100 + slop * 0.6));
        expect(state.selected).toEqual([1]);
    });

    it("doesn't click once a press has moved 4 screen px, even if it comes back", () => {
        // A click on 1 would narrow the selection to it (user story 23)
        const { editor, state, ports } = setup({ selected: [1, 2] });
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(100 + slop, 100));
        editor.pointerMove(at(100, 100));
        editor.pointerUp(at(100, 100));
        expect(state.selected).toEqual([1, 2]);
        expect(ports.selection.set).not.toHaveBeenCalled();
    });

    it("moves nothing on a press on a marcher that moves under 4 screen px", () => {
        const { editor, state, ports } = setup();
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(100 + slop * 0.9, 100));
        expect(editor.activeGesture()).toBeNull();
        editor.pointerUp(at(100 + slop * 0.9, 100));
        expect(ports.showPositions).not.toHaveBeenCalled();
        expect(state.drops).toEqual([]);
        expect(state.selected).toEqual([1]);
    });

    it("starts a move once a press on a marcher moves 4 screen px, however quickly", () => {
        const { editor, state } = setup();
        editor.pointerDown(at(100, 100));
        editor.pointerUp(at(100 + slop, 100));
        expect(state.drops.map((d) => d.positions)).toEqual([
            [{ id: 1, x: 100 + slop, y: 100 }],
        ]);
    });

    it("leaves the cursor alone while a drag is held", () => {
        const { editor } = setup();
        // From a marcher: a move (#196)
        editor.pointerDown(at(400, 100));
        editor.pointerMove(at(400 + slop, 100));
        editor.pointerMove(at(100, 100));
        expect(editor.cursor()).toBe("default");
        editor.pointerUp(at(100, 100));
        editor.pointerMove(at(100, 101));
        expect(editor.cursor()).toBe("pointer");
    });

    it("drops a press that's cancelled", () => {
        const { editor, state } = setup();
        editor.pointerDown(at(100, 100));
        editor.pointerCancel();
        editor.pointerUp(at(100, 100));
        expect(state.selected).toEqual([]);
    });

    it("has no gesture in progress during a click", () => {
        const { editor } = setup();
        editor.pointerDown(at(100, 100));
        expect(editor.activeGesture()).toBeNull();
        editor.pointerUp(at(100, 100));
        expect(editor.activeGesture()).toBeNull();
    });
});

describe("FieldEditor buttons", () => {
    it("leaves the right and middle buttons to navigation", () => {
        const { editor, state } = setup();
        expect(editor.pointerDown(at(100, 100, { button: 2 }))).toBe(false);
        editor.pointerUp(at(100, 100, { button: 2 }));
        expect(editor.pointerDown(at(100, 100, { button: 1 }))).toBe(false);
        editor.pointerUp(at(100, 100, { button: 1 }));
        expect(state.selected).toEqual([]);
    });

    it("leaves Ctrl+press on a Mac to navigation (it pans)", () => {
        const mac = setup({ isMac: true });
        expect(mac.editor.pointerDown(at(100, 100, { ctrl: true }))).toBe(
            false,
        );
        mac.editor.pointerUp(at(100, 100, { ctrl: true }));
        expect(mac.state.selected).toEqual([]);

        const pc = setup();
        expect(pc.editor.pointerDown(at(100, 100, { ctrl: true }))).toBe(true);
        pc.editor.pointerUp(at(100, 100, { ctrl: true }));
        expect(pc.state.selected).toEqual([1]);
    });
});

describe("FieldEditor hover", () => {
    it("shows the pointer cursor over a marcher it can select", () => {
        const { editor } = setup({ dimmed: [2] });
        expect(editor.cursor()).toBe("default");
        editor.pointerMove(at(100, 103));
        expect(editor.cursor()).toBe("pointer");
        editor.pointerMove(at(200, 100));
        expect(editor.cursor()).toBe("default");
        editor.pointerMove(at(300, 100));
        editor.pointerLeave();
        expect(editor.cursor()).toBe("default");
    });

    it("tells subscribers when the cursor changes, and only then", () => {
        const { editor } = setup();
        const listener = vi.fn();
        const unsubscribe = editor.subscribe(listener);
        editor.pointerMove(at(100, 100));
        editor.pointerMove(at(101, 100));
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        editor.pointerMove(at(EMPTY.x, EMPTY.y));
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe("FieldEditor select all", () => {
    it("selects every marcher it can select", () => {
        const { editor, state } = setup({ dimmed: [3], hidden: [1] });
        editor.selectAll();
        expect(state.selected).toEqual([2, 4]);
    });
});

describe("FieldEditor presses the app takes (#202)", () => {
    /** Takes the first `count` presses, as the app does the first press after a paused preview. */
    const takeFirst = (count: number) => vi.fn(() => count-- > 0);

    it("selects nothing on a press the app takes, and the next press clicks as usual", () => {
        const takePress = takeFirst(1);
        const { editor, state } = setup({ selected: [2], takePress });
        expect(editor.pointerDown(at(100, 100))).toBe(true);
        editor.pointerUp(at(100, 100));
        expect(state.selected).toEqual([2]);
        click(editor, 100, 100);
        expect(state.selected).toEqual([1]);
        expect(takePress).toHaveBeenCalledTimes(2);
    });

    it("starts no drag from a press the app takes", () => {
        const startDrag = vi.fn();
        class Recording extends FieldEditor {
            protected startDrag() {
                startDrag();
                return null;
            }
        }
        const { ports } = setup({ takePress: takeFirst(1) });
        const editor = new Recording(ports);
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(150, 100));
        expect(editor.cursor()).toBe("default");
        editor.pointerUp(at(150, 100));
        expect(startDrag).not.toHaveBeenCalled();
        expect(editor.activeGesture()).toBeNull();

        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(150, 100));
        expect(startDrag).toHaveBeenCalledTimes(1);
    });

    it("doesn't count a press it takes as half of a double-click: no lasso starts", () => {
        let take = false;
        const { editor } = setup({ takePress: () => take });
        click(editor, 150, 50);
        take = true;
        click(editor, 150, 50);
        take = false;
        editor.pointerDown(at(150, 50));
        editor.pointerMove(at(250, 50));
        expect(editor.activeGesture()).toBe("marquee");
    });

    it("starts no lasso from a double-click-and-drag whose drag the app takes", () => {
        let take = false;
        const { editor } = setup({ takePress: () => take });
        click(editor, 150, 50);
        take = true;
        editor.pointerDown(at(150, 50));
        editor.pointerMove(at(250, 50));
        expect(editor.activeGesture()).toBeNull();
    });

    it("doesn't ask about presses that are navigation's", () => {
        const takePress = vi.fn(() => true);
        const { editor } = setup({ takePress });
        expect(editor.pointerDown(at(100, 100, { button: 2 }))).toBe(false);
        expect(editor.pointerDown(at(100, 100, { button: 1 }))).toBe(false);
        expect(takePress).not.toHaveBeenCalled();
    });
});

/** Presses at `from`, drags to `to` in two moves and releases there. */
const drag = (
    editor: FieldEditor,
    from: { x: number; y: number },
    to: { x: number; y: number },
    modifiers?: Parameters<typeof at>[2],
) => {
    editor.pointerDown(at(from.x, from.y, modifiers));
    editor.pointerMove(at((from.x + to.x) / 2, (from.y + to.y) / 2, modifiers));
    editor.pointerMove(at(to.x, to.y, modifiers));
    editor.pointerUp(at(to.x, to.y, modifiers));
};

const shown = (state: ReturnType<typeof setup>["state"]) =>
    state.shown && Object.fromEntries(state.shown);

describe("FieldEditor moving marchers", () => {
    it("drags a marcher with the pointer and drops it where it's released", () => {
        const { editor, state } = setup();
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(130, 110));
        expect(editor.activeGesture()).toBe("move");
        expect(shown(state)).toEqual({ 1: { x: 130, y: 110 } });
        editor.pointerUp(at(150, 140));
        expect(editor.activeGesture()).toBeNull();
        expect(state.drops.map((d) => d.positions)).toEqual([
            [{ id: 1, x: 150, y: 140 }],
        ]);
    });

    it("keeps the offset from the dot to where it was pressed", () => {
        const { editor, state } = setup();
        drag(editor, { x: 103, y: 98 }, { x: 203, y: 298 });
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 200, y: 300 }]);
    });

    it("selects the marcher dragged when it isn't selected", () => {
        const { editor, state } = setup({ selected: [2, 3] });
        drag(editor, { x: 100, y: 100 }, { x: 100, y: 150 });
        expect(state.selected).toEqual([1]);
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 100, y: 150 }]);
    });

    it("adds the marcher dragged with Shift, and moves the whole selection", () => {
        const { editor, state } = setup({ selected: [2] });
        drag(editor, { x: 100, y: 100 }, { x: 100, y: 150 }, { shift: true });
        expect(state.selected).toEqual([2, 1]);
        expect(state.drops[0].positions).toEqual([
            { id: 1, x: 100, y: 150 },
            { id: 2, x: 200, y: 150 },
        ]);
    });

    it("moves the whole selection from one of its marchers, without narrowing it", () => {
        const { editor, state, ports } = setup({ selected: [1, 3] });
        drag(editor, { x: 300, y: 100 }, { x: 320, y: 90 });
        expect(ports.selection.set).not.toHaveBeenCalled();
        expect(state.selected).toEqual([1, 3]);
        expect(state.drops[0].positions).toEqual([
            { id: 1, x: 120, y: 90 },
            { id: 3, x: 320, y: 90 },
        ]);
    });

    it("moves a multi-selection from empty field inside its box (owner decision, #196)", () => {
        const { editor, state, ports } = setup({ selected: [1, 3] });
        // Between marchers 1 and 3, on the box's padding below them
        drag(editor, { x: 250, y: 108 }, { x: 250, y: 158 });
        expect(ports.selection.set).not.toHaveBeenCalled();
        expect(state.drops[0].positions).toEqual([
            { id: 1, x: 100, y: 150 },
            { id: 3, x: 300, y: 150 },
        ]);
    });

    it("moves nothing from empty field outside the box, or around a single marcher", () => {
        const outside = setup({ selected: [1, 3] });
        drag(outside.editor, { x: 250, y: 115 }, { x: 250, y: 165 });
        drag(outside.editor, { x: 350, y: 100 }, { x: 350, y: 150 });
        expect(outside.state.drops).toEqual([]);
        expect(outside.editor.activeGesture()).toBeNull();

        const single = setup({ selected: [1] });
        drag(single.editor, { x: 105, y: 108 }, { x: 105, y: 158 });
        expect(single.state.drops).toEqual([]);
    });

    it("can't drag a dimmed marcher", () => {
        const { editor, state } = setup({ dimmed: [2] });
        drag(editor, { x: 200, y: 100 }, { x: 200, y: 150 });
        expect(state.drops).toEqual([]);
        expect(state.selected).toEqual([]);
    });

    it("leaves hidden selected marchers where they are", () => {
        const { editor, state } = setup({ selected: [1, 2], hidden: [2] });
        drag(editor, { x: 100, y: 100 }, { x: 100, y: 150 });
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 100, y: 150 }]);
    });

    it("drops nothing when the pointer comes back to where it started", () => {
        const { editor, state } = setup();
        drag(editor, { x: 100, y: 100 }, { x: 100, y: 100 });
        expect(state.drops).toEqual([]);
        expect(state.shown).toBeNull();
    });

    it("puts the marchers back when the drag is cancelled", () => {
        const { editor, state } = setup();
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(100, 150));
        expect(shown(state)).toEqual({ 1: { x: 100, y: 150 } });
        editor.pointerCancel();
        expect(editor.activeGesture()).toBeNull();
        expect(state.shown).toBeNull();
        editor.pointerUp(at(100, 150));
        expect(state.drops).toEqual([]);
    });

    it("leaves the right button to navigation mid-drag", () => {
        const { editor, state } = setup();
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(100, 150));
        editor.pointerUp(at(100, 150, { button: 2 }));
        expect(editor.activeGesture()).toBe("move");
        editor.pointerUp(at(100, 160));
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 100, y: 160 }]);
    });

    it("hands the pointer delta to the move transform (#197's seam)", () => {
        // Whole tens across, and no movement down
        const moveTransform = vi.fn<MoveTransform>((delta, _pointer, starts) =>
            starts.map((s) => ({
                id: s.id,
                x: s.x + Math.round(delta.x / 10) * 10,
                y: s.y,
            })),
        );
        const { editor, state } = setup({ moveTransform });
        drag(editor, { x: 100, y: 100 }, { x: 137, y: 120 }, { shift: true });
        expect(moveTransform).toHaveBeenLastCalledWith(
            { x: 37, y: 20 },
            expect.objectContaining({ shift: true }),
            [{ id: 1, x: 100, y: 100 }],
        );
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 140, y: 100 }]);
    });

    it("moves at a quarter of the pointer's speed while Alt is down (user story 39)", () => {
        const { editor, state } = setup();
        drag(editor, { x: 100, y: 100 }, { x: 180, y: 140 }, { alt: true });
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 120, y: 110 }]);
    });

    // Snaps to tens, except with Shift or Alt
    const snapToTens: MoveTransform = (delta, pointer, starts) =>
        starts.map((s) => ({
            id: s.id,
            x:
                pointer.alt || pointer.shift
                    ? s.x + delta.x
                    : s.x + Math.round(delta.x / 10) * 10,
            y: s.y + delta.y,
        }));

    it("drops where the marcher is drawn when Alt comes up before a release that doesn't move", () => {
        const { editor, state } = setup({ moveTransform: snapToTens });
        editor.pointerDown(at(100, 100, { alt: true }));
        editor.pointerMove(at(112, 100, { alt: true }));
        expect(shown(state)).toEqual({ 1: { x: 103, y: 100 } });
        // Alt up fires no pointer event; the release reports it up
        editor.pointerUp(at(112, 100));
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 103, y: 100 }]);
    });

    it("drops where the marcher is drawn when Shift goes down before a release that doesn't move", () => {
        const { editor, state } = setup({ moveTransform: snapToTens });
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(137, 100));
        expect(shown(state)).toEqual({ 1: { x: 140, y: 100 } });
        editor.pointerUp(at(137, 100, { shift: true }));
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 140, y: 100 }]);
    });

    it("drops by the release's modifiers when the release moved the pointer", () => {
        const { editor, state } = setup({ moveTransform: snapToTens });
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(137, 100));
        editor.pointerUp(at(138, 100, { shift: true }));
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 138, y: 100 }]);
    });

    it("goes on slowly from the snapped spot when Alt is pressed during a snapped drag", () => {
        // Snaps to tens, except with Alt
        const moveTransform: MoveTransform = (delta, pointer, starts) =>
            starts.map((s) => ({
                id: s.id,
                x: pointer.alt
                    ? s.x + delta.x
                    : s.x + Math.round(delta.x / 10) * 10,
                y: s.y + delta.y,
            }));
        const { editor, state } = setup({ moveTransform });
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(137, 100));
        expect(shown(state)).toEqual({ 1: { x: 140, y: 100 } });
        editor.pointerMove(at(137, 100, { alt: true }));
        expect(shown(state)).toEqual({ 1: { x: 140, y: 100 } });
        editor.pointerUp(at(157, 100, { alt: true }));
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 145, y: 100 }]);
    });

    it("carries on from where the marchers are when Alt is pressed or released mid-drag", () => {
        const { editor, state } = setup();
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(140, 100));
        expect(shown(state)).toEqual({ 1: { x: 140, y: 100 } });
        // Alt down: the next 40 units count as 10, with no jump
        editor.pointerMove(at(140, 100, { alt: true }));
        expect(shown(state)).toEqual({ 1: { x: 140, y: 100 } });
        editor.pointerMove(at(180, 100, { alt: true }));
        expect(shown(state)).toEqual({ 1: { x: 150, y: 100 } });
        // Alt up: full speed again, still trailing the pointer by 30
        editor.pointerMove(at(180, 100));
        expect(shown(state)).toEqual({ 1: { x: 150, y: 100 } });
        editor.pointerUp(at(200, 120));
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 170, y: 120 }]);
    });
});

describe("FieldEditor drops waiting to be saved", () => {
    it("keeps the marchers where they were dropped until the save settles (user story 42)", async () => {
        const { editor, state } = setup();
        drag(editor, { x: 100, y: 100 }, { x: 100, y: 150 });
        expect(shown(state)).toEqual({ 1: { x: 100, y: 150 } });
        state.drops[0].answer("saved");
        await Promise.resolve();
        expect(state.shown).toBeNull();
    });

    it("snaps the marchers back when the drop is refused", async () => {
        const { editor, state } = setup();
        drag(editor, { x: 100, y: 100 }, { x: 100, y: 150 });
        state.drops[0].answer("refused");
        await Promise.resolve();
        expect(state.shown).toBeNull();
    });

    it("keeps an earlier drop drawn while a later one is dragged, until it's saved", async () => {
        const { editor, state } = setup();
        drag(editor, { x: 100, y: 100 }, { x: 100, y: 150 });
        editor.pointerDown(at(200, 100));
        editor.pointerMove(at(200, 130));
        expect(shown(state)).toEqual({
            1: { x: 100, y: 150 },
            2: { x: 200, y: 130 },
        });
        // The first drop is saved mid-drag: the field draws it from the show,
        // and the marcher dragged stays under the pointer
        state.drops[0].answer("saved");
        await Promise.resolve();
        expect(shown(state)).toEqual({ 2: { x: 200, y: 130 } });
        editor.pointerUp(at(200, 140));
        expect(shown(state)).toEqual({ 2: { x: 200, y: 140 } });
        state.drops[1].answer("saved");
        await Promise.resolve();
        expect(state.shown).toBeNull();
    });

    it("draws an earlier drop still saving when a later drag is cancelled", () => {
        const { editor, state } = setup();
        drag(editor, { x: 100, y: 100 }, { x: 100, y: 150 });
        editor.pointerDown(at(200, 100));
        editor.pointerMove(at(200, 130));
        editor.pointerCancel();
        expect(shown(state)).toEqual({ 1: { x: 100, y: 150 } });
    });

    it("logs a drop that hasn't settled after 30 s, and keeps it drawn", () => {
        vi.useFakeTimers();
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            const { editor, state } = setup();
            drag(editor, { x: 100, y: 100 }, { x: 100, y: 150 });
            vi.advanceTimersByTime(29_000);
            expect(error).not.toHaveBeenCalled();
            vi.advanceTimersByTime(2_000);
            expect(error).toHaveBeenCalledTimes(1);
            expect(shown(state)).toEqual({ 1: { x: 100, y: 150 } });
        } finally {
            error.mockRestore();
            vi.useRealTimers();
        }
    });
});

/** Presses at the first point, moves through the rest and releases at the last, with the press's modifiers. */
const dragThrough = (
    editor: FieldEditor,
    points: readonly (readonly [number, number])[],
    modifiers?: Parameters<typeof at>[2],
) => {
    const [first, ...rest] = points;
    editor.pointerDown(at(first[0], first[1], modifiers));
    for (const [x, y] of rest.slice(0, -1))
        editor.pointerMove(at(x, y, modifiers));
    const [x, y] = rest[rest.length - 1];
    editor.pointerMove(at(x, y, modifiers));
    editor.pointerUp(at(x, y, modifiers));
};

describe("FieldEditor marquee", () => {
    it("replaces the selection with the marchers it covers", () => {
        const { editor, state } = setup({ selected: [4] });
        dragThrough(editor, [
            [150, 50],
            [250, 150],
        ]);
        expect(state.selected).toEqual([2]);
    });

    it("adds to the selection with Shift", () => {
        const { editor, state } = setup({ selected: [1] });
        dragThrough(
            editor,
            [
                [250, 50],
                [350, 150],
            ],
            { shift: true },
        );
        expect(state.selected).toEqual([1, 3]);
    });

    it("takes a marcher whose dot it touches", () => {
        // The dot reaches 6 field units at zoom 2 (its click target)
        const touching = setup();
        dragThrough(touching.editor, [
            [250, 50],
            [295, 150],
        ]);
        expect(touching.state.selected).toEqual([3]);
        const clear = setup();
        dragThrough(clear.editor, [
            [250, 50],
            [293, 150],
        ]);
        expect(clear.state.selected).toEqual([]);
    });

    it("never takes a hidden or dimmed marcher", () => {
        const { editor, state } = setup({ hidden: [1], dimmed: [3] });
        dragThrough(editor, [
            [50, 50],
            [450, 150],
        ]);
        expect(state.selected).toEqual([2, 4]);
    });

    it("clears the selection when it covers nothing, and keeps it with Shift", () => {
        const plain = setup({ selected: [1] });
        dragThrough(plain.editor, [
            [150, 200],
            [250, 300],
        ]);
        expect(plain.state.selected).toEqual([]);
        const shift = setup({ selected: [1] });
        dragThrough(
            shift.editor,
            [
                [150, 200],
                [250, 300],
            ],
            { shift: true },
        );
        expect(shift.state.selected).toEqual([1]);
    });

    it("is the gesture in progress, with its rectangle, until released", () => {
        const { editor, state } = setup();
        const listener = vi.fn();
        editor.subscribe(listener);
        editor.pointerDown(at(150, 50));
        editor.pointerMove(at(200, 120));
        expect(editor.activeGesture()).toBe("marquee");
        editor.pointerMove(at(250, 150));
        expect(editor.areaShape()).toEqual({
            kind: "marquee",
            rect: { left: 150, top: 50, right: 250, bottom: 150 },
        });
        // Selects only on release
        expect(state.selected).toEqual([]);
        // The gesture starting, its first point, and the move
        expect(listener).toHaveBeenCalledTimes(3);
        editor.pointerUp(at(250, 150));
        expect(editor.activeGesture()).toBeNull();
        expect(editor.areaShape()).toBeNull();
        expect(state.selected).toEqual([2]);
    });

    it("selects nothing when the pointer is lost", () => {
        const { editor, state } = setup({ selected: [4] });
        editor.pointerDown(at(150, 50));
        editor.pointerMove(at(250, 150));
        editor.pointerCancel();
        editor.pointerUp(at(250, 150));
        expect(editor.activeGesture()).toBeNull();
        expect(state.selected).toEqual([4]);
    });

    it("doesn't start inside a multi-selection's box: that drag moves the selection (#196)", () => {
        const { editor, state, ports } = setup({ selected: [1, 3] });
        // On empty field between 2 and 3, inside the box from 1 to 3
        editor.pointerDown(at(250, 100));
        editor.pointerMove(at(250, 200));
        expect(editor.activeGesture()).toBe("move");
        editor.pointerUp(at(250, 200));
        expect(state.selected).toEqual([1, 3]);
        expect(ports.selection.set).not.toHaveBeenCalled();
    });

    it("starts outside a multi-selection's box", () => {
        const { editor, state } = setup({ selected: [1, 3] });
        dragThrough(editor, [
            [350, 50],
            [450, 150],
        ]);
        expect(state.selected).toEqual([4]);
    });

    it("selects at once on a quick flick released past the slop with no move in between", () => {
        const { editor, state } = setup({ selected: [4] });
        editor.pointerDown(at(150, 50));
        editor.pointerUp(at(250, 150));
        expect(state.selected).toEqual([2]);
        expect(editor.activeGesture()).toBeNull();
        expect(editor.areaShape()).toBeNull();
    });

    it("is a marquee, not a lasso, with Shift held (rules table: Shift)", () => {
        const { editor } = setup();
        editor.pointerDown(at(150, 50, { shift: true }));
        editor.pointerMove(at(250, 150, { shift: true }));
        expect(editor.activeGesture()).toBe("marquee");
    });
});

/** A lasso square around marchers 2 and 3, from (150, 50), back to 10 field units (20 screen px) from its start. */
const AROUND_2_AND_3 = [
    [150, 50],
    [350, 50],
    [350, 150],
    [150, 150],
    [150, 60],
] as const;

/** A click and then a double-click-and-drag through `points`. */
const lasso = (
    editor: FieldEditor,
    points: readonly (readonly [number, number])[],
    modifiers?: Parameters<typeof at>[2],
) => {
    click(editor, points[0][0], points[0][1], modifiers);
    dragThrough(editor, points, modifiers);
};

describe("FieldEditor lasso", () => {
    it("starts on a double-click-and-drag on empty field", () => {
        const { editor } = setup();
        click(editor, 150, 50);
        editor.pointerDown(at(150, 50));
        editor.pointerMove(at(250, 50));
        expect(editor.activeGesture()).toBe("lasso");
    });

    it("starts after a click the renderer cancelled once released (lost pointer capture)", () => {
        const { editor } = setup();
        click(editor, 150, 50);
        editor.pointerCancel();
        editor.pointerDown(at(150, 50));
        editor.pointerMove(at(250, 50));
        expect(editor.activeGesture()).toBe("lasso");
    });

    it("replaces the selection with the marchers inside it", () => {
        const { editor, state } = setup({ selected: [4] });
        lasso(editor, AROUND_2_AND_3);
        expect(state.selected).toEqual([2, 3]);
    });

    it("adds to the selection with Shift", () => {
        const { editor, state } = setup({ selected: [1] });
        lasso(editor, AROUND_2_AND_3, { shift: true });
        expect(state.selected).toEqual([1, 2, 3]);
    });

    it("never takes a hidden or dimmed marcher", () => {
        const { editor, state } = setup({ hidden: [2], dimmed: [3] });
        lasso(editor, [
            [50, 50],
            [450, 50],
            [450, 150],
            [50, 150],
            [50, 60],
        ]);
        expect(state.selected).toEqual([1, 4]);
    });

    it("selects nothing, and keeps the selection, when released 50 screen px or more from its start", () => {
        const { editor, state, ports } = setup({ selected: [4] });
        // 25 field units is 50 screen px at zoom 2. With Shift, so the
        // double-click's first click keeps the selection too
        lasso(editor, [...AROUND_2_AND_3.slice(0, -1), [150, 75]], {
            shift: true,
        });
        expect(state.selected).toEqual([4]);
        expect(ports.selection.set).not.toHaveBeenCalled();
    });

    it("says when releasing would close it (the green cue)", () => {
        const { editor } = setup();
        click(editor, 150, 50);
        editor.pointerDown(at(150, 50));
        editor.pointerMove(at(160, 50));
        // Still near the start
        expect(editor.areaShape()).toMatchObject({
            kind: "lasso",
            closes: true,
        });
        editor.pointerMove(at(350, 50));
        expect(editor.areaShape()).toMatchObject({ closes: false });
        editor.pointerMove(at(150, 74));
        expect(editor.areaShape()).toMatchObject({ closes: true });
        expect(editor.areaShape()).toMatchObject({
            points: [
                { x: 150, y: 50 },
                { x: 160, y: 50 },
                { x: 350, y: 50 },
                { x: 150, y: 74 },
            ],
        });
    });

    it("is a marquee when the second press comes too late or too far from the click", () => {
        const late = setup();
        click(late.editor, 150, 50);
        late.clock.now += DOUBLE_CLICK_MS + 1;
        late.editor.pointerDown(at(150, 50));
        late.editor.pointerMove(at(250, 50));
        expect(late.editor.activeGesture()).toBe("marquee");

        const far = setup();
        click(far.editor, 150, 50);
        // 10 field units is 20 screen px
        far.editor.pointerDown(at(160, 50));
        far.editor.pointerMove(at(260, 50));
        expect(far.editor.activeGesture()).toBe("marquee");
    });

    it("is a marquee after a click on a marcher, and after a double-click", () => {
        const afterMarcher = setup();
        click(afterMarcher.editor, 100, 100);
        afterMarcher.editor.pointerDown(at(100, 110));
        afterMarcher.editor.pointerMove(at(100, 150));
        expect(afterMarcher.editor.activeGesture()).toBe("marquee");

        const triple = setup();
        click(triple.editor, 150, 50);
        click(triple.editor, 150, 50);
        triple.editor.pointerDown(at(150, 50));
        triple.editor.pointerMove(at(250, 50));
        expect(triple.editor.activeGesture()).toBe("marquee");
    });

    it("doesn't start inside a multi-selection's box", () => {
        const { editor } = setup({ selected: [1, 3] });
        click(editor, 250, 100, { shift: true });
        editor.pointerDown(at(250, 100, { shift: true }));
        editor.pointerMove(at(250, 200, { shift: true }));
        expect(editor.activeGesture()).toBe("move");
    });
});

describe("FieldEditor scale and rotate handles (#198)", () => {
    // Marchers 1 to 4 selected: the box runs from (100, 100) to (400, 100),
    // 10 units out, and the rotate handle is 40 screen px (20 units) above it
    const ALL = [1, 2, 3, 4];
    const HANDLE = {
        e: { x: 410, y: 100 },
        se: { x: 410, y: 110 },
        rot: { x: 250, y: 70 },
    };

    it("scales one axis from the opposite side with a middle handle, as a scale gesture", () => {
        const { editor, state } = setup({ selected: ALL });
        editor.pointerDown(at(HANDLE.e.x, HANDLE.e.y));
        editor.pointerMove(at(485, 130));
        expect(editor.activeGesture()).toBe("scale");
        editor.pointerMove(at(560, 160));
        editor.pointerUp(at(560, 160));
        expect(editor.activeGesture()).toBeNull();
        expect(state.drops[0].positions).toEqual([
            { id: 1, x: 100, y: 100 },
            { id: 2, x: 250, y: 100 },
            { id: 3, x: 400, y: 100 },
            { id: 4, x: 550, y: 100 },
        ]);
    });

    it("ignores Shift on a middle handle", () => {
        const plain = setup({ selected: ALL });
        drag(plain.editor, HANDLE.e, { x: 560, y: 160 });
        const shifted = setup({ selected: ALL });
        drag(shifted.editor, HANDLE.e, { x: 560, y: 160 }, { shift: true });
        expect(shifted.state.drops[0].positions).toEqual(
            plain.state.drops[0].positions,
        );
    });

    it("scales from the opposite corner with a corner handle", () => {
        const { editor, state } = setup({ selected: ALL });
        drag(editor, HANDLE.se, { x: 560, y: 180 });
        expect(state.drops[0].positions.map((p) => p.x)).toEqual([
            100, 250, 400, 550,
        ]);
    });

    it("rotates about the box's center with the rotate handle", () => {
        const { editor, state } = setup({ selected: ALL });
        editor.pointerDown(at(HANDLE.rot.x, HANDLE.rot.y));
        editor.pointerMove(at(270, 75));
        expect(editor.activeGesture()).toBe("rotate");
        // A quarter turn clockwise about (250, 100)
        editor.pointerMove(at(280, 100));
        expect(editor.rotationFrame()).toEqual({
            box: { left: 100, top: 100, right: 400, bottom: 100 },
            angle: 90,
        });
        editor.pointerUp(at(280, 100));
        expect(editor.rotationFrame()).toBeNull();
        expect(state.drops[0].positions).toEqual([
            { id: 1, x: 250, y: -50 },
            { id: 2, x: 250, y: 50 },
            { id: 3, x: 250, y: 150 },
            { id: 4, x: 250, y: 250 },
        ]);
    });

    it("leaves the locks and the move rules out of handles (rules table: Lock X / Lock Y)", () => {
        const moveTransform = vi.fn<MoveTransform>();
        const { editor, state } = setup({ selected: ALL, moveTransform });
        drag(editor, HANDLE.e, { x: 560, y: 100 });
        expect(moveTransform).not.toHaveBeenCalled();
        expect(state.drops).toHaveLength(1);
    });

    it("does nothing on a click on a handle: the selection stays", () => {
        const { editor, state, ports } = setup({ selected: ALL });
        editor.pointerDown(at(HANDLE.se.x, HANDLE.se.y));
        editor.pointerMove(at(HANDLE.se.x + 1, HANDLE.se.y));
        editor.pointerUp(at(HANDLE.se.x + 1, HANDLE.se.y));
        click(editor, HANDLE.rot.x, HANDLE.rot.y);
        expect(ports.selection.set).not.toHaveBeenCalled();
        expect(state.drops).toEqual([]);
        expect(state.selected).toEqual(ALL);
    });

    it("does nothing with its handles while the line tool is on (#203)", () => {
        const { editor, state } = setup({ selected: ALL });
        editor.setLineTool(ALL);
        editor.pointerMove(at(HANDLE.e.x, HANDLE.e.y));
        expect(editor.cursor()).not.toBe("ew-resize");
        drag(editor, HANDLE.e, { x: 560, y: 100 });
        expect(editor.activeGesture()).toBe("line");
        expect(state.drops).toEqual([]);
    });

    it("has no handles around a single marcher", () => {
        const { editor, state } = setup({ selected: [1] });
        editor.pointerDown(at(90, 90));
        editor.pointerMove(at(60, 60));
        expect(editor.activeGesture()).toBe("marquee");
        editor.pointerUp(at(60, 60));
        expect(state.drops).toEqual([]);
    });

    it("shows each handle's cursor on hover", () => {
        const { editor } = setup({ selected: ALL });
        editor.pointerMove(at(HANDLE.e.x, HANDLE.e.y));
        expect(editor.cursor()).toBe("ew-resize");
        editor.pointerMove(at(HANDLE.se.x, HANDLE.se.y));
        expect(editor.cursor()).toBe("nwse-resize");
        editor.pointerMove(at(HANDLE.rot.x, HANDLE.rot.y));
        expect(editor.cursor()).toBe("crosshair");
        editor.pointerMove(at(250, 300));
        expect(editor.cursor()).toBe("default");
    });

    it("drops a handle drag through the same pending save as a move", async () => {
        const { editor, state } = setup({ selected: ALL });
        drag(editor, HANDLE.e, { x: 560, y: 100 });
        expect(shown(state)?.[4]).toEqual({ x: 550, y: 100 });
        state.drops[0].answer("refused");
        await Promise.resolve();
        await Promise.resolve();
        expect(state.shown).toBeNull();
    });
});

describe("FieldEditor rotation typed into the inspector (user story 54)", () => {
    const ALL = [1, 2, 3, 4];

    it("rotates the selection about its box's center while typed, and saves it once", () => {
        const { editor, state } = setup({ selected: ALL });
        expect(editor.canTransform()).toBe(true);
        editor.rotateSelection(9);
        editor.rotateSelection(90);
        expect(editor.typedRotation()).toBe(90);
        expect(shown(state)?.[1]).toEqual({ x: 250, y: -50 });
        expect(state.drops).toEqual([]);
        editor.endRotation();
        expect(editor.typedRotation()).toBe(0);
        expect(state.drops).toHaveLength(1);
        expect(state.drops[0].positions[3]).toEqual({ id: 4, x: 250, y: 250 });
        editor.endRotation();
        expect(state.drops).toHaveLength(1);
    });

    it("saves nothing when left unchanged, or turned back to 0", () => {
        const { editor, state } = setup({ selected: ALL });
        editor.endRotation();
        editor.rotateSelection(0);
        editor.endRotation();
        editor.rotateSelection(45);
        editor.rotateSelection(0);
        editor.endRotation();
        expect(state.drops).toEqual([]);
        expect(state.shown).toBeNull();
    });

    it("can't rotate a single marcher", () => {
        const { editor, state } = setup({ selected: [2] });
        expect(editor.canTransform()).toBe(false);
        editor.rotateSelection(90);
        editor.endRotation();
        expect(state.drops).toEqual([]);
    });

    it("saves a typed rotation before a press on the field, and says it ended", () => {
        const { editor, state } = setup({ selected: ALL });
        const version = editor.rotationVersion();
        editor.rotateSelection(90);
        editor.pointerDown(at(250, 300));
        expect(state.drops).toHaveLength(1);
        expect(editor.typedRotation()).toBe(0);
        // The input starts over even though the blur that follows finds nothing to save
        expect(editor.rotationVersion()).toBe(version + 1);
        editor.endRotation();
        expect(editor.rotationVersion()).toBe(version + 1);
    });

    it("refuses while the line tool is on", () => {
        const { editor, state } = setup({ selected: ALL });
        editor.setLineTool(ALL);
        editor.rotateSelection(90);
        expect(state.shown).toBeNull();
        expect(editor.typedRotation()).toBe(0);
    });

    it("starts over a drop still saving, and is dropped if that drop is refused", async () => {
        const { editor, state } = setup({ selected: ALL });
        editor.rotateSelection(90);
        editor.endRotation();
        editor.rotateSelection(90);
        expect(editor.typedRotation()).toBe(90);
        state.drops[0].answer("refused");
        await Promise.resolve();
        await Promise.resolve();
        expect(editor.typedRotation()).toBe(0);
        expect(state.drops).toHaveLength(1);
    });

    it("drops a typed rotation, unsaved, when the selection changes or it's cancelled", () => {
        const { editor, state } = setup({ selected: ALL });
        editor.rotateSelection(90);
        editor.selectionChanged();
        expect(editor.typedRotation()).toBe(90);
        state.selected = [1, 2];
        editor.selectionChanged();
        expect(editor.typedRotation()).toBe(0);
        expect(state.shown).toBeNull();

        editor.rotateSelection(45);
        const version = editor.rotationVersion();
        editor.cancelRotation();
        expect(editor.rotationVersion()).toBe(version + 1);
        expect(state.shown).toBeNull();
        expect(state.drops).toEqual([]);
    });
});

describe("FieldEditor a pointer lost mid-gesture (#208)", () => {
    // The renderer cancels the press when its pointer capture is lost: an OS
    // dialog, a notification or switching windows mid-drag. The field drops
    // the drag and leaves nothing behind.
    const ALL = [1, 2, 3, 4];
    const GESTURES = [
        {
            kind: "move",
            selected: [] as number[],
            start: (editor: FieldEditor) => {
                editor.pointerDown(at(100, 100));
                editor.pointerMove(at(100, 150));
            },
        },
        {
            kind: "marquee",
            selected: [2],
            start: (editor: FieldEditor) => {
                editor.pointerDown(at(EMPTY.x, EMPTY.y));
                editor.pointerMove(at(EMPTY.x + 60, EMPTY.y + 60));
            },
        },
        {
            kind: "lasso",
            selected: [2],
            start: (editor: FieldEditor) => {
                click(editor, EMPTY.x, EMPTY.y, { shift: true });
                editor.pointerDown(at(EMPTY.x, EMPTY.y, { shift: true }));
                editor.pointerMove(
                    at(EMPTY.x + 60, EMPTY.y + 60, { shift: true }),
                );
            },
        },
        {
            kind: "scale",
            selected: ALL,
            start: (editor: FieldEditor) => {
                editor.pointerDown(at(410, 100));
                editor.pointerMove(at(485, 130));
            },
        },
        {
            kind: "rotate",
            selected: ALL,
            start: (editor: FieldEditor) => {
                editor.pointerDown(at(250, 70));
                editor.pointerMove(at(280, 100));
            },
        },
    ];

    it.each(GESTURES)(
        "drops a $kind and leaves no trace: nothing drawn, saved or selected by it, and the next press works",
        ({ kind, selected, start }) => {
            const { editor, state } = setup({ selected });
            start(editor);
            expect(editor.activeGesture()).toBe(kind);
            // The gesture is drawn: the dragged marchers, the area, or the
            // turning box
            if (kind === "marquee" || kind === "lasso")
                expect(editor.areaShape()).not.toBeNull();
            else expect(state.shown).not.toBeNull();
            if (kind === "rotate")
                expect(editor.rotationFrame()).not.toBeNull();
            const selectedBefore = state.selected;

            editor.pointerCancel();
            expect(editor.activeGesture()).toBeNull();
            expect(editor.areaShape()).toBeNull();
            expect(editor.rotationFrame()).toBeNull();
            expect(state.shown).toBeNull();
            // The rest of the drag and its release do nothing
            editor.pointerMove(at(EMPTY.x + 90, EMPTY.y + 90));
            editor.pointerUp(at(EMPTY.x + 90, EMPTY.y + 90));
            expect(editor.activeGesture()).toBeNull();
            expect(state.shown).toBeNull();
            expect(state.drops).toEqual([]);
            expect(state.selected).toEqual(selectedBefore);

            // The next press is a press like any other
            click(editor, 300, 100);
            expect(state.selected).toEqual([3]);
            drag(editor, { x: 300, y: 100 }, { x: 300, y: 160 });
            expect(state.drops.map((d) => d.positions)).toEqual([
                [{ id: 3, x: 300, y: 160 }],
            ]);
        },
    );
});
