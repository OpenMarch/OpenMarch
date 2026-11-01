import { afterEach, describe, expect, it, vi } from "vitest";
import {
    CLICK_SLOP,
    DOUBLE_CLICK_MS,
    FieldEditor,
    type DropResult,
    type FieldEditorPorts,
    type FieldMode,
    type FieldPoint,
    type FieldPointer,
} from "../fieldEditor";
import type { MarcherPosition, MoveTransform } from "../moveGesture";
import { ruledMove, type MoveRules } from "../moveRules";
import { watchKeyListeners } from "@/shapes/__test__/keyListeners";

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
    pressSelection = undefined as FieldEditorPorts["pressSelection"],
    doubleClickMarcher = undefined as FieldEditorPorts["doubleClickMarcher"],
    reachesInside = undefined as FieldEditorPorts["reachesInside"],
    positions = [100, 100, 200, 100, 300, 100, 400, 100],
    ratioLocked = undefined as (() => boolean) | undefined,
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
            positions: Float64Array.from(positions),
            hidden: Uint8Array.from([1, 2, 3, 4], (id) =>
                hidden.includes(id) ? 1 : 0,
            ),
        }),
        zoom: () => 2,
        canSelect: (id) => !dimmed.includes(id),
        takePress,
        pressSelection,
        doubleClickMarcher,
        reachesInside,
        selectionBoxPadding: () => 10,
        openMenu: vi.fn(),
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
        ratioLocked,
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
        // A right-click selects what it's on for the menu (#315), but the press is navigation's
        expect(editor.pointerDown(at(100, 100, { button: 2 }))).toBe(false);
        editor.pointerUp(at(100, 105, { button: 2 }));
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

describe("FieldEditor right-click menu (#315)", () => {
    const rightDown = (editor: FieldEditor, x: number, y: number) =>
        editor.pointerDown(at(x, y, { button: 2 }));
    const rightUp = (editor: FieldEditor, x: number, y: number) =>
        editor.pointerUp(at(x, y, { button: 2 }));

    it("opens the menu at a right-click that stays under the slop, and still leaves the press to navigation", () => {
        const { editor, ports } = setup({ selected: [1] });
        expect(rightDown(editor, EMPTY.x, EMPTY.y)).toBe(false);
        expect(ports.openMenu).not.toHaveBeenCalled();
        rightUp(editor, EMPTY.x + 1, EMPTY.y);
        expect(ports.openMenu).toHaveBeenCalledTimes(1);
        expect(ports.openMenu).toHaveBeenCalledWith(
            expect.objectContaining({
                screen: { x: (EMPTY.x + 1) * ZOOM, y: EMPTY.y * ZOOM },
            }),
        );
    });

    it("opens no menu after a right-drag, which panned", () => {
        const { editor, ports, state } = setup({ selected: [1] });
        rightDown(editor, EMPTY.x, EMPTY.y);
        rightUp(editor, EMPTY.x + CLICK_SLOP / ZOOM, EMPTY.y);
        expect(ports.openMenu).not.toHaveBeenCalled();
        expect(state.selected).toEqual([1]);
    });

    it("opens no menu after a right-drag that came back to where it started", () => {
        const { editor, ports } = setup();
        rightDown(editor, EMPTY.x, EMPTY.y);
        editor.pointerMove(at(EMPTY.x + 40, EMPTY.y, { button: 2 }));
        rightUp(editor, EMPTY.x, EMPTY.y);
        expect(ports.openMenu).not.toHaveBeenCalled();
        // The next right-click opens it again
        rightDown(editor, EMPTY.x, EMPTY.y);
        rightUp(editor, EMPTY.x, EMPTY.y);
        expect(ports.openMenu).toHaveBeenCalledTimes(1);
    });

    it("selects an unselected marcher right-clicked before opening the menu", () => {
        const { editor, ports, state } = setup({ selected: [1, 2] });
        let selectedWhenOpened: readonly number[] | null = null;
        vi.mocked(ports.openMenu!).mockImplementation(() => {
            selectedWhenOpened = state.selected;
        });
        rightDown(editor, 300, 100);
        rightUp(editor, 300, 100);
        expect(state.selected).toEqual([3]);
        expect(selectedWhenOpened).toEqual([3]);
    });

    it("keeps the selection on a right-click on a selected marcher or on empty field", () => {
        const { editor, ports, state } = setup({ selected: [1, 2] });
        rightDown(editor, 200, 100);
        rightUp(editor, 200, 100);
        rightDown(editor, EMPTY.x, EMPTY.y);
        rightUp(editor, EMPTY.x, EMPTY.y);
        expect(state.selected).toEqual([1, 2]);
        expect(ports.selection.set).not.toHaveBeenCalled();
        expect(ports.openMenu).toHaveBeenCalledTimes(2);
    });

    it("treats a dimmed marcher as empty field: the selection stays", () => {
        const { editor, ports, state } = setup({ selected: [1], dimmed: [3] });
        rightDown(editor, 300, 100);
        rightUp(editor, 300, 100);
        expect(state.selected).toEqual([1]);
        expect(ports.openMenu).toHaveBeenCalledTimes(1);
    });

    it("opens no menu on a Mac's Ctrl-click, which pans (#194)", () => {
        const { editor, ports, state } = setup({ isMac: true });
        expect(
            editor.pointerDown(at(100, 100, { ctrl: true, button: 0 })),
        ).toBe(false);
        editor.pointerUp(at(100, 100, { ctrl: true, button: 0 }));
        expect(ports.openMenu).not.toHaveBeenCalled();
        expect(state.selected).toEqual([]);
    });

    it("opens no menu on a middle-click", () => {
        const { editor, ports } = setup();
        editor.pointerDown(at(EMPTY.x, EMPTY.y, { button: 1 }));
        editor.pointerUp(at(EMPTY.x, EMPTY.y, { button: 1 }));
        expect(ports.openMenu).not.toHaveBeenCalled();
    });

    it("opens no menu while the open shape is being edited", () => {
        const { editor, ports, state } = setup({ selected: [1] });
        editor.setMode({ ...fakeMode().mode, blocksFieldMenu: true });
        rightDown(editor, 300, 100);
        rightUp(editor, 300, 100);
        expect(ports.openMenu).not.toHaveBeenCalled();
        expect(state.selected).toEqual([1]);
    });

    it("opens the menu for a selected placed box's marchers, keeping the selection", () => {
        const { editor, ports, state } = setup({ selected: [1, 2] });
        editor.setMode(fakeMode().mode);
        rightDown(editor, 200, 100);
        rightUp(editor, 200, 100);
        expect(ports.openMenu).toHaveBeenCalledTimes(1);
        expect(state.selected).toEqual([1, 2]);
    });

    it("clears a paused preview first, then selects by where the marchers stand at the playhead (story 60)", () => {
        // The preview holds marcher 3 at (300, 100); at the playhead it stands on EMPTY
        let held = true;
        const takePress = vi.fn(() => {
            const was = held;
            held = false;
            return was;
        });
        const { editor, ports, state } = setup({ selected: [1], takePress });
        ports.marchers = () => ({
            ids: [1, 2, 3, 4],
            positions: Float64Array.from([
                100,
                100,
                200,
                100,
                ...(held ? [300, 100] : [EMPTY.x, EMPTY.y]),
                400,
                100,
            ]),
            hidden: Uint8Array.from([0, 0, 0, 0]),
        });
        // A right-drag pans and leaves the preview alone
        rightDown(editor, 300, 100);
        rightUp(editor, 310, 100);
        expect(takePress).not.toHaveBeenCalled();
        // On its held spot, marcher 3 isn't there any more: empty field
        rightDown(editor, 300, 100);
        rightUp(editor, 300, 100);
        expect(takePress).toHaveBeenCalledTimes(1);
        expect(state.selected).toEqual([1]);
        expect(ports.openMenu).toHaveBeenCalledTimes(1);
        // Where it stands at the playhead, it's selected
        held = true;
        rightDown(editor, EMPTY.x, EMPTY.y);
        rightUp(editor, EMPTY.x, EMPTY.y);
        expect(state.selected).toEqual([3]);
        expect(ports.openMenu).toHaveBeenCalledTimes(2);
    });

    it("treats a handle as empty field, even over an unselected marcher: the selection stays", () => {
        const { editor, ports, state } = setup({ selected: [1, 3] });
        // Marcher 2 sits under the top middle handle of the box around 1 and 3
        ports.marchers = () => ({
            ids: [1, 2, 3, 4],
            positions: Float64Array.from([
                100, 100, 200, 90, 300, 100, 400, 100,
            ]),
            hidden: Uint8Array.from([0, 0, 0, 0]),
        });
        // A left press there takes the handle, not the marcher
        editor.pointerDown(at(200, 90));
        editor.pointerUp(at(200, 90));
        expect(state.selected).toEqual([1, 3]);
        rightDown(editor, 200, 90);
        rightUp(editor, 200, 90);
        expect(state.selected).toEqual([1, 3]);
        expect(ports.openMenu).toHaveBeenCalledTimes(1);
    });

    it("opens no menu on a right-click during a left drag", () => {
        const { editor, ports } = setup();
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(100, 150));
        rightDown(editor, 100, 150);
        rightUp(editor, 100, 150);
        expect(ports.openMenu).not.toHaveBeenCalled();
        expect(editor.activeGesture()).toBe("move");
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

    it("hands the pointer delta and the held roles to the move transform (#197's seam)", () => {
        // Whole tens across, and no movement down
        const moveTransform = vi.fn<MoveTransform>((delta, _roles, starts) =>
            starts.map((s) => ({
                id: s.id,
                x: s.x + Math.round(delta.x / 10) * 10,
                y: s.y,
            })),
        );
        const { editor, state } = setup({ moveTransform });
        drag(editor, { x: 100, y: 100 }, { x: 137, y: 120 }, { ctrl: true });
        expect(moveTransform).toHaveBeenLastCalledWith(
            { x: 37, y: 20 },
            { fine: false, constrain: true, fromCenter: false },
            [{ id: 1, x: 100, y: 100 }],
        );
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 140, y: 100 }]);
    });

    it("moves at a quarter of the pointer's speed with fine (Shift; user story 39)", () => {
        const { editor, state } = setup({ selected: [1] });
        drag(editor, { x: 100, y: 100 }, { x: 180, y: 140 }, { shift: true });
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 120, y: 110 }]);
    });

    it("doesn't slow down with Alt any more", () => {
        const { editor, state } = setup({ selected: [1] });
        drag(editor, { x: 100, y: 100 }, { x: 180, y: 140 }, { alt: true });
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 180, y: 140 }]);
    });

    // Snaps to tens, except with fine
    const snapToTens: MoveTransform = (delta, roles, starts) =>
        starts.map((s) => ({
            id: s.id,
            x: roles.fine ? s.x + delta.x : s.x + Math.round(delta.x / 10) * 10,
            y: s.y + delta.y,
        }));

    it("drops where the marcher is drawn when fine comes off before a release that doesn't move", () => {
        const { editor, state } = setup({
            selected: [1],
            moveTransform: snapToTens,
        });
        editor.pointerDown(at(100, 100, { shift: true }));
        editor.pointerMove(at(112, 100, { shift: true }));
        expect(shown(state)).toEqual({ 1: { x: 103, y: 100 } });
        // No keyboard event came; the release reports Shift up
        editor.pointerUp(at(112, 100));
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 103, y: 100 }]);
    });

    it("drops where the marcher is drawn when fine goes on before a release that doesn't move", () => {
        const { editor, state } = setup({ moveTransform: snapToTens });
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(137, 100));
        expect(shown(state)).toEqual({ 1: { x: 140, y: 100 } });
        editor.pointerUp(at(137, 100, { shift: true }));
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 140, y: 100 }]);
    });

    it("drops by the release's roles when the release moved the pointer", () => {
        const { editor, state } = setup({ moveTransform: snapToTens });
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(137, 100));
        // Fine on at the release: from the 140 drawn, a quarter of 1 more
        editor.pointerUp(at(138, 100, { shift: true }));
        expect(state.drops[0].positions).toEqual([
            { id: 1, x: 140.25, y: 100 },
        ]);
    });

    it("goes on slowly from the snapped spot when fine turns on during a snapped drag", () => {
        const { editor, state } = setup({ moveTransform: snapToTens });
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(137, 100));
        expect(shown(state)).toEqual({ 1: { x: 140, y: 100 } });
        editor.pointerMove(at(137, 100, { shift: true }));
        expect(shown(state)).toEqual({ 1: { x: 140, y: 100 } });
        editor.pointerUp(at(157, 100, { shift: true }));
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 145, y: 100 }]);
    });

    it("carries on from where the marchers are when fine turns on or off mid-drag", () => {
        const { editor, state } = setup();
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(140, 100));
        expect(shown(state)).toEqual({ 1: { x: 140, y: 100 } });
        // Shift down: the next 40 units count as 10, with no jump
        editor.pointerMove(at(140, 100, { shift: true }));
        expect(shown(state)).toEqual({ 1: { x: 140, y: 100 } });
        editor.pointerMove(at(180, 100, { shift: true }));
        expect(shown(state)).toEqual({ 1: { x: 150, y: 100 } });
        // Shift up: full speed again, still trailing the pointer by 30
        editor.pointerMove(at(180, 100));
        expect(shown(state)).toEqual({ 1: { x: 150, y: 100 } });
        editor.pointerUp(at(200, 120));
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 170, y: 120 }]);
    });
});

/** The move rules ThreeField gives the editor, on a grid of tens from (0, 0). */
const rulesOn = (overrides: Partial<MoveRules> = {}) =>
    ruledMove(() => ({
        rounding: { nearestXSteps: 1, nearestYSteps: 1 },
        lockX: false,
        lockY: false,
        grid: {
            pixelsPerStep: 10,
            centerFrontPoint: { xPixels: 0, yPixels: 0 },
        },
        ...overrides,
    }));

const key = (type: "keydown" | "keyup", init: KeyboardEventInit) =>
    window.dispatchEvent(new KeyboardEvent(type, init));

describe("FieldEditor modifier roles (version A)", () => {
    // A gesture left running keeps listening for keys; end each one
    let running: FieldEditor | undefined;
    afterEach(() => running?.pointerCancel());

    it("doesn't turn snapping off for Shift as such: only fine does, at a quarter speed", () => {
        const plain = setup({ moveTransform: rulesOn() });
        drag(plain.editor, { x: 100, y: 100 }, { x: 137, y: 121 });
        expect(plain.state.drops[0].positions).toEqual([
            { id: 1, x: 140, y: 120 },
        ]);
        // A Shift-press that adds the marcher uses Shift: snapped, full speed
        const added = setup({ selected: [2], moveTransform: rulesOn() });
        drag(
            added.editor,
            { x: 100, y: 100 },
            { x: 137, y: 121 },
            {
                shift: true,
            },
        );
        expect(added.state.drops[0].positions).toEqual([
            { id: 1, x: 140, y: 120 },
            { id: 2, x: 240, y: 120 },
        ]);
        // Marcher 1 is selected, so the Shift-press adds nothing and Shift is fine
        const fine = setup({ selected: [1], moveTransform: rulesOn() });
        drag(
            fine.editor,
            { x: 100, y: 100 },
            { x: 137, y: 121 },
            {
                shift: true,
            },
        );
        expect(fine.state.drops[0].positions).toEqual([
            { id: 1, x: 109.25, y: 105.25 },
        ]);
        // Alt (from center) doesn't move marchers differently
        const alt = setup({ moveTransform: rulesOn() });
        drag(alt.editor, { x: 100, y: 100 }, { x: 137, y: 121 }, { alt: true });
        expect(alt.state.drops[0].positions).toEqual([
            { id: 1, x: 140, y: 120 },
        ]);
    });

    it("keeps a drag to one axis with constrain ($mod), whichever it has gone further along", () => {
        const across = setup({
            moveTransform: rulesOn({ rounding: undefined }),
        });
        drag(
            across.editor,
            { x: 100, y: 100 },
            { x: 137, y: 121 },
            {
                ctrl: true,
            },
        );
        expect(across.state.drops[0].positions).toEqual([
            { id: 1, x: 137, y: 100 },
        ]);
        const down = setup({
            isMac: true,
            moveTransform: rulesOn({ rounding: undefined }),
        });
        drag(
            down.editor,
            { x: 100, y: 100 },
            { x: 121, y: 137 },
            {
                meta: true,
            },
        );
        expect(down.state.drops[0].positions).toEqual([
            { id: 1, x: 100, y: 137 },
        ]);
    });

    it("never reads Mac Ctrl as constrain: a Ctrl-press pans, and Ctrl held mid-drag does nothing", () => {
        const press = setup({
            isMac: true,
            moveTransform: rulesOn({ rounding: undefined }),
        });
        expect(press.editor.pointerDown(at(100, 100, { ctrl: true }))).toBe(
            false,
        );
        press.editor.pointerMove(at(137, 121, { ctrl: true }));
        press.editor.pointerUp(at(137, 121, { ctrl: true }));
        expect(press.state.drops).toEqual([]);
        expect(press.state.selected).toEqual([]);

        const held = setup({
            isMac: true,
            moveTransform: rulesOn({ rounding: undefined }),
        });
        held.editor.pointerDown(at(100, 100));
        held.editor.pointerMove(at(137, 121, { ctrl: true }));
        held.editor.pointerUp(at(137, 121, { ctrl: true }));
        expect(held.state.drops[0].positions).toEqual([
            { id: 1, x: 137, y: 121 },
        ]);
    });

    it("re-runs the last move when a role key changes mid-drag, with no pointer move", () => {
        const { editor, state } = setup({
            moveTransform: rulesOn({ rounding: undefined }),
        });
        running = editor;
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(137, 121));
        expect(shown(state)).toEqual({ 1: { x: 137, y: 121 } });
        key("keydown", { key: "Control", ctrlKey: true });
        expect(shown(state)).toEqual({ 1: { x: 137, y: 100 } });
        key("keyup", { key: "Control" });
        expect(shown(state)).toEqual({ 1: { x: 137, y: 121 } });
        // The release where the pointer was drops what's drawn
        editor.pointerUp(at(137, 121));
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 137, y: 121 }]);
    });

    it("re-anchors on the snapped spot when fine turns on from a keydown, with no pointer move", () => {
        const { editor, state } = setup({ moveTransform: rulesOn() });
        running = editor;
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(137, 100));
        expect(shown(state)).toEqual({ 1: { x: 140, y: 100 } });
        key("keydown", { key: "Shift", shiftKey: true });
        // Off the grid now, but still drawn where it was: no jump back to 137
        expect(shown(state)).toEqual({ 1: { x: 140, y: 100 } });
        editor.pointerMove(at(157, 100, { shift: true }));
        expect(shown(state)).toEqual({ 1: { x: 145, y: 100 } });
        // Shift up: back on the grid where it's drawn
        key("keyup", { key: "Shift" });
        expect(shown(state)).toEqual({ 1: { x: 150, y: 100 } });
    });

    it("follows a key that went down between the press and the drag start: Ctrl up with no move frees the axis", () => {
        const { editor, state } = setup({
            moveTransform: rulesOn({ rounding: undefined }),
        });
        running = editor;
        editor.pointerDown(at(100, 100));
        // Ctrl goes down inside the click slop, before any gesture listens
        key("keydown", { key: "Control", ctrlKey: true });
        editor.pointerMove(at(101, 100, { ctrl: true }));
        editor.pointerMove(at(137, 121, { ctrl: true }));
        expect(shown(state)).toEqual({ 1: { x: 137, y: 100 } });
        key("keyup", { key: "Control" });
        expect(shown(state)).toEqual({ 1: { x: 137, y: 121 } });
        editor.pointerUp(at(137, 121));
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 137, y: 121 }]);
    });

    it("frees the press's Shift released inside the click slop: pressed again mid-drag, it's fine", () => {
        const { editor, state } = setup({ selected: [2] });
        running = editor;
        editor.pointerDown(at(100, 100, { shift: true }));
        // Shift comes up before the drag starts; no gesture listens yet
        key("keyup", { key: "Shift" });
        editor.pointerMove(at(100, 140));
        expect(state.selected).toEqual([2, 1]);
        expect(shown(state)).toEqual({
            1: { x: 100, y: 140 },
            2: { x: 200, y: 140 },
        });
        key("keydown", { key: "Shift", shiftKey: true });
        expect(shown(state)).toEqual({
            1: { x: 100, y: 140 },
            2: { x: 200, y: 140 },
        });
        editor.pointerMove(at(100, 180, { shift: true }));
        expect(shown(state)).toEqual({
            1: { x: 100, y: 150 },
            2: { x: 200, y: 150 },
        });
    });

    it("applies constrain after fine, as a filter: releasing $mod leaves no lasting offset", () => {
        const { editor, state } = setup({
            isMac: true,
            moveTransform: rulesOn({ rounding: undefined }),
        });
        running = editor;
        editor.pointerDown(at(100, 100, { meta: true }));
        editor.pointerMove(at(180, 120, { meta: true }));
        expect(shown(state)).toEqual({ 1: { x: 180, y: 100 } });
        // Fine on while constrain keeps y: no jump
        key("keydown", { key: "Shift", shiftKey: true, metaKey: true });
        expect(shown(state)).toEqual({ 1: { x: 180, y: 100 } });
        // A quarter of (40, 20) on the free drag, then y kept
        editor.pointerMove(at(220, 140, { meta: true, shift: true }));
        expect(shown(state)).toEqual({ 1: { x: 190, y: 100 } });
        // Cmd up: the free fine spot, y included
        key("keyup", { key: "Meta", shiftKey: true });
        expect(shown(state)).toEqual({ 1: { x: 190, y: 125 } });
        // On at a quarter speed on both axes, with no extra offset
        editor.pointerMove(at(260, 160, { shift: true }));
        expect(shown(state)).toEqual({ 1: { x: 200, y: 130 } });
        editor.pointerUp(at(260, 160, { shift: true }));
        expect(state.drops[0].positions).toEqual([{ id: 1, x: 200, y: 130 }]);
    });

    it("adds an unselected marcher on a Shift-press and drags it at full speed until Shift is pressed again (the press rule)", () => {
        const { editor, state } = setup({ selected: [2] });
        running = editor;
        editor.pointerDown(at(100, 100, { shift: true }));
        editor.pointerMove(at(100, 140, { shift: true }));
        expect(state.selected).toEqual([2, 1]);
        expect(shown(state)).toEqual({
            1: { x: 100, y: 140 },
            2: { x: 200, y: 140 },
        });
        // Released: still full speed
        key("keyup", { key: "Shift" });
        editor.pointerMove(at(100, 180));
        expect(shown(state)).toEqual({
            1: { x: 100, y: 180 },
            2: { x: 200, y: 180 },
        });
        // Pressed again: fine, at a quarter speed from where they are
        key("keydown", { key: "Shift", shiftKey: true });
        editor.pointerMove(at(100, 220, { shift: true }));
        expect(shown(state)).toEqual({
            1: { x: 100, y: 190 },
            2: { x: 200, y: 190 },
        });
        editor.pointerUp(at(100, 220, { shift: true }));
        expect(state.drops[0].positions).toEqual([
            { id: 1, x: 100, y: 190 },
            { id: 2, x: 200, y: 190 },
        ]);
    });

    it("reads the press rule from pointer events too, with no keyboard events", () => {
        const { editor, state } = setup({ selected: [2] });
        editor.pointerDown(at(100, 100, { shift: true }));
        editor.pointerMove(at(100, 140, { shift: true }));
        editor.pointerMove(at(100, 140));
        editor.pointerMove(at(100, 180, { shift: true }));
        editor.pointerUp(at(100, 180, { shift: true }));
        expect(state.drops[0].positions).toEqual([
            { id: 1, x: 100, y: 150 },
            { id: 2, x: 200, y: 150 },
        ]);
    });

    it.each([
        ["cancelled", (editor: FieldEditor) => editor.pointerCancel()],
        ["released", (editor: FieldEditor) => editor.pointerUp(at(137, 121))],
    ])("stops following the keys once %s", (_, end) => {
        const keyListeners = watchKeyListeners();
        const { editor, ports } = setup({ moveTransform: rulesOn() });
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(137, 121));
        expect(keyListeners()).toBeGreaterThan(0);
        end(editor);
        expect(keyListeners()).toBe(0);
        const drawn = vi.mocked(ports.showPositions).mock.calls.length;
        key("keydown", { key: "Shift", shiftKey: true });
        key("keyup", { key: "Shift" });
        expect(ports.showPositions).toHaveBeenCalledTimes(drawn);
        vi.restoreAllMocks();
    });

    it("drags fine from a Shift-press on a selected marcher: it changed no selection", () => {
        const onSelected = setup({ selected: [1, 2] });
        drag(
            onSelected.editor,
            { x: 100, y: 100 },
            { x: 100, y: 140 },
            {
                shift: true,
            },
        );
        expect(onSelected.state.selected).toEqual([1, 2]);
        expect(onSelected.state.drops[0].positions).toEqual([
            { id: 1, x: 100, y: 110 },
            { id: 2, x: 200, y: 110 },
        ]);
    });

    it("drags at full speed from a Shift-press that adds the rest of a partly selected box: the press used Shift", () => {
        // Marchers 1 and 2 are a placed box; 1 is selected, so Shift adds 2
        const { editor, state } = setup({
            selected: [1],
            moveTransform: rulesOn(),
            pressSelection: (hit, shift) => (hit <= 2 && shift ? [1, 2] : null),
        });
        running = editor;
        drag(editor, { x: 100, y: 100 }, { x: 137, y: 121 }, { shift: true });
        expect(state.selected).toEqual([1, 2]);
        expect(state.drops[0].positions).toEqual([
            { id: 1, x: 140, y: 120 },
            { id: 2, x: 240, y: 120 },
        ]);
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
            subtract: false,
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

    it("starts inside a multi-selection's box with Shift or Alt: adding or subtracting (owner decision, 2026-10-30)", () => {
        // A block of 1 to 3 selected; the press is on empty field between 2 and 3
        const subtract = setup({ selected: [1, 2, 3] });
        subtract.editor.pointerDown(at(250, 100, { alt: true }));
        subtract.editor.pointerMove(at(150, 150, { alt: true }));
        expect(subtract.editor.activeGesture()).toBe("marquee");
        subtract.editor.pointerUp(at(150, 150, { alt: true }));
        expect(subtract.state.selected).toEqual([1, 3]);
        expect(subtract.state.drops).toEqual([]);

        const add = setup({ selected: [1, 3] });
        add.editor.pointerDown(at(250, 100, { shift: true }));
        add.editor.pointerMove(at(450, 150, { shift: true }));
        expect(add.editor.activeGesture()).toBe("marquee");
        add.editor.pointerUp(at(450, 150, { shift: true }));
        expect(add.state.selected).toEqual([1, 3, 4]);
        expect(add.state.drops).toEqual([]);
    });

    it("starts a lasso inside a multi-selection's box with Alt", () => {
        const { editor, state } = setup({ selected: [1, 2, 3] });
        lasso(
            editor,
            [
                [250, 95],
                [150, 50],
                [150, 150],
                [250, 105],
            ],
            { alt: true },
        );
        expect(state.selected).toEqual([1, 3]);
        expect(state.drops).toEqual([]);
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

    it("starts inside a multi-selection's box with Shift, which adds (owner decision, 2026-10-30)", () => {
        const { editor } = setup({ selected: [1, 3] });
        click(editor, 250, 100, { shift: true });
        editor.pointerDown(at(250, 100, { shift: true }));
        editor.pointerMove(at(250, 200, { shift: true }));
        expect(editor.activeGesture()).toBe("lasso");
        editor.pointerCancel();
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

    describe("a formation with height", () => {
        // Marcher 4 is 100 lower: the box runs from (100, 100) to (400, 200), its right-hand
        // handle at (410, 150)
        const TALL = [100, 100, 200, 100, 300, 100, 400, 200];
        const EAST = { x: 410, y: 150 };
        // 150 across is half again, both ways: the left side stays, and the height grows evenly
        // about the center line y = 150
        const BOTH_WAYS = [
            { id: 1, x: 100, y: 75 },
            { id: 2, x: 250, y: 75 },
            { id: 3, x: 400, y: 75 },
            { id: 4, x: 550, y: 225 },
        ];
        const ONE_AXIS = [
            { id: 1, x: 100, y: 100 },
            { id: 2, x: 250, y: 100 },
            { id: 3, x: 400, y: 100 },
            { id: 4, x: 550, y: 200 },
        ];
        const dropped = (
            modifiers: Parameters<typeof at>[2],
            ratioLocked?: () => boolean,
        ) => {
            const { editor, state } = setup({
                selected: ALL,
                positions: TALL,
                ratioLocked,
            });
            drag(editor, EAST, { x: 560, y: 150 }, modifiers);
            return state.drops[0].positions;
        };

        it("scales the other axis too with constrain on a middle handle, about the center line (#545)", () => {
            expect(dropped({})).toEqual(ONE_AXIS);
            expect(dropped({ ctrl: true })).toEqual(BOTH_WAYS);
        });

        it("keeps the ratio with the box's ratio lock on, read at the press, and constrain frees it (#545)", () => {
            expect(dropped({}, () => true)).toEqual(BOTH_WAYS);
            expect(dropped({ ctrl: true }, () => true)).toEqual(ONE_AXIS);
        });
    });

    it("scales at a quarter speed with fine (Shift)", () => {
        const { editor, state } = setup({ selected: ALL });
        // 150 across at a quarter: the box grows from 300 to 337.5
        drag(editor, HANDLE.e, { x: 560, y: 100 }, { shift: true });
        expect(state.drops[0].positions.map((p) => p.x)).toEqual([
            100, 212.5, 325, 437.5,
        ]);
    });

    describe("keys pressed or released mid-drag, with no pointer move", () => {
        let running: FieldEditor | undefined;
        afterEach(() => running?.pointerCancel());

        it("re-runs a rotation: Shift down draws whole degrees where the pointer is, Shift up snaps it to 15° again", () => {
            const { editor, state } = setup({ selected: ALL });
            running = editor;
            editor.pointerDown(at(HANDLE.rot.x, HANDLE.rot.y));
            // 37° clockwise about (250, 100), 30 units out: drawn at 30°
            const radians = ((37 - 90) * Math.PI) / 180;
            const pointer = at(
                250 + 30 * Math.cos(radians),
                100 + 30 * Math.sin(radians),
            );
            editor.pointerMove(pointer);
            expect(editor.rotationFrame()?.angle).toBe(30);
            key("keydown", { key: "Shift", shiftKey: true });
            expect(editor.rotationFrame()?.angle).toBe(37);
            key("keyup", { key: "Shift" });
            expect(editor.rotationFrame()?.angle).toBe(30);
            // Fine at full speed: 40° more turns 40°, in whole degrees
            key("keydown", { key: "Shift", shiftKey: true });
            const further = ((77 - 90) * Math.PI) / 180;
            editor.pointerMove(
                at(250 + 30 * Math.cos(further), 100 + 30 * Math.sin(further), {
                    shift: true,
                }),
            );
            expect(editor.rotationFrame()?.angle).toBe(77);
            // Shift up with no move: 15° steps again
            key("keyup", { key: "Shift" });
            expect(editor.rotationFrame()?.angle).toBe(75);
            editor.pointerUp(
                at(250 + 30 * Math.cos(further), 100 + 30 * Math.sin(further)),
            );
            expect(state.drops).toHaveLength(1);
        });
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

    it("has no handles while a mode with its own is on (#204)", () => {
        const { editor, state } = setup({ selected: ALL });
        editor.setMode(fakeMode({ claims: () => false }).mode);
        editor.pointerMove(at(HANDLE.e.x, HANDLE.e.y));
        expect(editor.cursor()).not.toBe("ew-resize");
        drag(editor, HANDLE.e, { x: 560, y: 100 });
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

    it("refuses while a mode that locks the selection is on", () => {
        const { editor, state } = setup({ selected: ALL });
        editor.setMode(fakeMode().mode);
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

/** A mode that records what it's told; it claims every press unless `claims` says otherwise. */
function fakeMode({
    claims = (() => true) as (pointer: FieldPointer) => boolean,
    cursor = null as ReturnType<FieldMode["cursorAt"]>,
} = {}) {
    const calls: string[] = [];
    const listeners = new Set<() => void>();
    const mode: FieldMode = {
        claims,
        press: (p) => calls.push(`press ${p.field.x},${p.field.y}`),
        move: (p) => calls.push(`move ${p.field.x},${p.field.y}`),
        release: (p, click) =>
            calls.push(
                `release ${p.field.x},${p.field.y} ${
                    click ? (click.double ? "double" : "click") : "drag"
                }`,
            ),
        cancel: () => calls.push("cancel"),
        cursorAt: () => cursor,
        drawing: () => null,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        ownsSelectionBox: true,
        locksSelection: true,
        gesture: { kind: "shape", always: true },
    };
    return {
        mode,
        calls,
        changed: () => listeners.forEach((listener) => listener()),
    };
}

describe("FieldEditor modes (#204)", () => {
    it("gives a claimed press to the mode, which selects and drops nothing", () => {
        const { editor, state, ports } = setup({ selected: [2] });
        const { mode, calls } = fakeMode();
        editor.setMode(mode);
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(150, 120));
        editor.pointerUp(at(150, 120));
        expect(calls).toEqual([
            "press 100,100",
            "move 150,120",
            "release 150,120 drag",
        ]);
        expect(ports.selection.set).not.toHaveBeenCalled();
        expect(state.drops).toEqual([]);
        expect(state.shown).toBeNull();
    });

    it("tells the mode a click, and a double-click", () => {
        const { editor, clock } = setup();
        const { mode, calls } = fakeMode();
        editor.setMode(mode);
        click(editor, 100, 100);
        clock.now += DOUBLE_CLICK_MS - 1;
        click(editor, 101, 100);
        clock.now += 10;
        click(editor, 101, 100);
        expect(calls.filter((c) => c.startsWith("release"))).toEqual([
            "release 100,100 click",
            "release 101,100 double",
            // A double-click's second click starts no third
            "release 101,100 click",
        ]);
    });

    it("leaves a press it doesn't claim to the editor's rules", () => {
        const { editor, state } = setup();
        const { mode, calls } = fakeMode({ claims: (p) => p.field.x > 350 });
        editor.setMode(mode);
        click(editor, 100, 100);
        expect(state.selected).toEqual([1]);
        click(editor, 400, 100);
        expect(state.selected).toEqual([1]);
        expect(calls).toEqual(["press 400,100", "release 400,100 click"]);
    });

    it("takes no press the app took first (story 60)", () => {
        const { editor } = setup({ takePress: () => true });
        const { mode, calls } = fakeMode();
        editor.setMode(mode);
        click(editor, 100, 100);
        expect(calls).toEqual([]);
    });

    it("leaves panning presses to navigation", () => {
        const { editor } = setup();
        const { mode, calls } = fakeMode();
        editor.setMode(mode);
        expect(editor.pointerDown(at(100, 100, { button: 2 }))).toBe(false);
        expect(calls).toEqual([]);
    });

    it("shows the mode's cursor, and the editor's where it has none", () => {
        const { editor } = setup();
        editor.setMode(fakeMode({ cursor: "crosshair" }).mode);
        editor.pointerMove(at(100, 100));
        expect(editor.cursor()).toBe("crosshair");
        editor.setMode(fakeMode().mode);
        editor.pointerMove(at(100, 100));
        expect(editor.cursor()).toBe("pointer");
    });

    it("cancels the mode's press when the pointer is lost, or the mode is replaced", () => {
        const { editor } = setup();
        const first = fakeMode();
        editor.setMode(first.mode);
        editor.pointerDown(at(100, 100));
        editor.pointerCancel();
        editor.pointerDown(at(100, 100));
        editor.setMode(null);
        editor.pointerUp(at(100, 100));
        expect(first.calls).toEqual([
            "press 100,100",
            "cancel",
            "press 100,100",
            "cancel",
        ]);
    });

    it("reports the mode's gesture: always for the shape tool", () => {
        const { editor } = setup();
        expect(editor.activeGesture()).toBeNull();
        editor.setMode(fakeMode().mode);
        expect(editor.activeGesture()).toBe("shape");
    });

    it("tells its listeners when the mode changes what it draws", () => {
        const { editor } = setup();
        const fake = fakeMode();
        editor.setMode(fake.mode);
        const listener = vi.fn();
        editor.subscribe(listener);
        fake.changed();
        expect(listener).toHaveBeenCalledTimes(1);
        editor.setMode(null);
        fake.changed();
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("has no drag from inside the selection box while a mode owns it", () => {
        const { editor, state } = setup({ selected: [1, 2, 3] });
        editor.setMode(fakeMode({ claims: () => false }).mode);
        editor.pointerDown(at(250, 105));
        editor.pointerMove(at(250, 150));
        expect(editor.activeGesture()).toBe("shape");
        editor.pointerUp(at(250, 150));
        expect(state.drops).toEqual([]);
    });
});

describe("FieldEditor groups a press selects (#204)", () => {
    // Marchers 1 and 2 are a placed box
    const group = (hit: number, shift: boolean) =>
        hit <= 2 ? (shift ? [3, 1, 2] : [1, 2]) : null;

    it("selects what the app says a click on a marcher selects", () => {
        const { editor, state } = setup({ pressSelection: group });
        click(editor, 100, 100);
        expect(state.selected).toEqual([1, 2]);
        click(editor, 300, 100);
        expect(state.selected).toEqual([3]);
    });

    it("drags the whole group from a press on one member", () => {
        const { editor, state } = setup({ pressSelection: group });
        editor.pointerDown(at(200, 100));
        editor.pointerMove(at(200, 150));
        editor.pointerUp(at(200, 150));
        expect(state.selected).toEqual([1, 2]);
        expect(state.drops[0].positions.map((p) => p.id)).toEqual([1, 2]);
    });

    it("adds a group with Shift and drags the selection at full speed: Shift was the press's", () => {
        const { editor, state } = setup({
            selected: [3],
            pressSelection: group,
        });
        editor.pointerDown(at(100, 100, { shift: true }));
        editor.pointerMove(at(100, 150, { shift: true }));
        editor.pointerUp(at(100, 150, { shift: true }));
        expect(state.selected).toEqual([3, 1, 2]);
        expect(state.drops[0].positions).toEqual([
            { id: 1, x: 100, y: 150 },
            { id: 2, x: 200, y: 150 },
            { id: 3, x: 300, y: 150 },
        ]);
    });

    it("takes a selected group out with Shift: the press is done, and no marquee adds it back", () => {
        const { editor, state } = setup({
            selected: [3, 1, 2],
            pressSelection: (hit, shift) =>
                hit <= 2 && shift ? [3] : group(hit, shift),
        });
        editor.pointerDown(at(100, 100, { shift: true }));
        editor.pointerMove(at(100, 150, { shift: true }));
        expect(editor.activeGesture()).toBeNull();
        expect(editor.areaShape()).toBeNull();
        editor.pointerMove(at(250, 150, { shift: true }));
        editor.pointerUp(at(250, 150, { shift: true }));
        expect(state.selected).toEqual([3]);
        expect(state.drops).toEqual([]);
    });

    it("tells the app about a double-click on a marcher, after the click", () => {
        const doubleClickMarcher = vi.fn();
        const { editor, state, clock } = setup({
            pressSelection: group,
            doubleClickMarcher,
        });
        click(editor, 100, 100);
        clock.now += 100;
        click(editor, 101, 100);
        expect(doubleClickMarcher).toHaveBeenCalledWith(1);
        expect(state.selected).toEqual([1, 2]);
        // Two clicks on different marchers aren't a double-click
        clock.now += 1000;
        click(editor, 100, 100);
        clock.now += 100;
        click(editor, 200, 100);
        expect(doubleClickMarcher).toHaveBeenCalledTimes(1);
    });
});

describe("FieldEditor subtract (Alt) on a marquee or lasso", () => {
    it("removes the marchers an Alt-marquee covers from the selection", () => {
        const { editor, state } = setup({ selected: [1, 2, 3] });
        dragThrough(
            editor,
            [
                [150, 50],
                [250, 150],
            ],
            { alt: true },
        );
        expect(state.selected).toEqual([1, 3]);
    });

    it("keeps the selection when an Alt-marquee covers nothing selected", () => {
        const { editor, state, ports } = setup({ selected: [1] });
        dragThrough(
            editor,
            [
                [150, 50],
                [250, 150],
            ],
            { alt: true },
        );
        expect(state.selected).toEqual([1]);
        expect(ports.selection.set).not.toHaveBeenCalled();
    });

    it("removes the marchers an Alt-lasso closes around; the double-click's first click keeps the selection", () => {
        const { editor, state } = setup({ selected: [1, 2, 3, 4] });
        lasso(editor, AROUND_2_AND_3, { alt: true });
        expect(state.selected).toEqual([1, 4]);
    });

    it("adds with Shift+Alt: add wins over subtract", () => {
        const marquee = setup({ selected: [1] });
        dragThrough(
            marquee.editor,
            [
                [150, 50],
                [250, 150],
            ],
            { shift: true, alt: true },
        );
        expect(marquee.state.selected).toEqual([1, 2]);
        const loop = setup({ selected: [1] });
        lasso(loop.editor, AROUND_2_AND_3, { shift: true, alt: true });
        expect(loop.state.selected).toEqual([1, 2, 3]);
    });

    it("takes marchers out one by one, never a whole group: a box selected whole keeps the members it misses", () => {
        // Areas don't ask pressSelection: marchers 1 and 2 could be a placed box selected whole
        const { editor, state } = setup({ selected: [1, 2] });
        dragThrough(
            editor,
            [
                [150, 50],
                [250, 150],
            ],
            { alt: true },
        );
        expect(state.selected).toEqual([1]);
    });

    it("tells the overlay the marquee and the lasso subtract", () => {
        const marquee = setup();
        marquee.editor.pointerDown(at(150, 50, { alt: true }));
        marquee.editor.pointerMove(at(250, 150, { alt: true }));
        expect(marquee.editor.areaShape()).toMatchObject({
            kind: "marquee",
            subtract: true,
        });
        marquee.editor.pointerCancel();
        const adding = setup();
        adding.editor.pointerDown(at(150, 50, { alt: true, shift: true }));
        adding.editor.pointerMove(at(250, 150, { alt: true, shift: true }));
        expect(adding.editor.areaShape()).toMatchObject({ subtract: false });
        adding.editor.pointerCancel();
        const loop = setup();
        click(loop.editor, 150, 50, { alt: true });
        loop.editor.pointerDown(at(150, 50, { alt: true }));
        loop.editor.pointerMove(at(250, 50, { alt: true }));
        expect(loop.editor.areaShape()).toMatchObject({
            kind: "lasso",
            subtract: true,
        });
        loop.editor.pointerCancel();
    });
});

describe("FieldEditor reach inside a placed box ($mod)", () => {
    // A gesture left running keeps listening for keys; end each one
    let running: FieldEditor | undefined;
    afterEach(() => running?.pointerCancel());

    /**
     * Marchers 1 and 2 are a placed box (recipe 7) that box selection applies to: a press on a
     * member selects the box, Shift adds or removes it whole, and a press that reaches inside
     * enters it and leaves the selection to the editor's rules.
     */
    function boxed({
        selected = [] as number[],
        isMac = false,
        enabled = true,
    } = {}) {
        const box = { inside: null as number | null };
        const pressSelection = vi.fn(
            (hit: number, shift: boolean, reachInside: boolean) => {
                if (!enabled || hit > 2) return null;
                if (reachInside) {
                    // A press inside the box: Shift takes a selected member out
                    box.inside = 7;
                    return shift && t.state.selected.includes(hit)
                        ? t.state.selected.filter((id) => id !== hit)
                        : null;
                }
                return shift ? [...t.state.selected, 1, 2] : [1, 2];
            },
        );
        const t = setup({
            selected,
            isMac,
            pressSelection,
            reachesInside: (hit) => enabled && hit <= 2,
            moveTransform: rulesOn({ rounding: undefined }),
        });
        running = t.editor;
        return { ...t, box, pressSelection };
    }

    it("selects just the marcher a $mod-click lands on, and enters its box", () => {
        const { editor, state, box } = boxed({ selected: [1, 2] });
        click(editor, 200, 100, { ctrl: true });
        expect(state.selected).toEqual([2]);
        expect(box.inside).toBe(7);
        // Cmd on a Mac
        const mac = boxed({ selected: [1, 2], isMac: true });
        click(mac.editor, 100, 100, { meta: true });
        expect(mac.state.selected).toEqual([1]);
        expect(mac.box.inside).toBe(7);
    });

    it("drags only that marcher from a $mod-press, free on both axes: the press used $mod", () => {
        const { editor, state, box } = boxed({ selected: [1, 2] });
        drag(editor, { x: 200, y: 100 }, { x: 237, y: 121 }, { ctrl: true });
        expect(state.selected).toEqual([2]);
        expect(box.inside).toBe(7);
        expect(state.drops[0].positions).toEqual([{ id: 2, x: 237, y: 121 }]);
    });

    it("constrains the drag once $mod is released and pressed again", () => {
        const { editor, state } = boxed();
        editor.pointerDown(at(200, 100, { ctrl: true }));
        editor.pointerMove(at(237, 121, { ctrl: true }));
        expect(shown(state)).toEqual({ 2: { x: 237, y: 121 } });
        key("keyup", { key: "Control" });
        expect(shown(state)).toEqual({ 2: { x: 237, y: 121 } });
        key("keydown", { key: "Control", ctrlKey: true });
        expect(shown(state)).toEqual({ 2: { x: 237, y: 100 } });
        editor.pointerUp(at(237, 121, { ctrl: true }));
        expect(state.drops[0].positions).toEqual([{ id: 2, x: 237, y: 100 }]);
    });

    it("isn't a press choice on a loose marcher: a $mod-drag stays on one axis", () => {
        const { editor, state, pressSelection } = boxed();
        drag(editor, { x: 300, y: 100 }, { x: 337, y: 121 }, { ctrl: true });
        expect(state.drops[0].positions).toEqual([{ id: 3, x: 337, y: 100 }]);
        expect(pressSelection).toHaveBeenCalledWith(3, false, false);
    });

    it("toggles just the member with Shift+$mod", () => {
        const { editor, state, box } = boxed({ selected: [1, 2] });
        click(editor, 200, 100, { shift: true, ctrl: true });
        expect(state.selected).toEqual([1]);
        expect(box.inside).toBe(7);
        click(editor, 200, 100, { shift: true, ctrl: true });
        expect(state.selected).toEqual([1, 2]);
        const fromOutside = boxed({ selected: [3] });
        click(fromOutside.editor, 100, 100, { shift: true, ctrl: true });
        expect(fromOutside.state.selected).toEqual([3, 1]);
    });

    it("adds the member and drags with Shift+$mod, at full speed and free: both keys are the press's", () => {
        const { editor, state } = boxed({ selected: [3] });
        drag(
            editor,
            { x: 100, y: 100 },
            { x: 137, y: 121 },
            { shift: true, ctrl: true },
        );
        expect(state.selected).toEqual([3, 1]);
        expect(state.drops[0].positions).toEqual([
            { id: 1, x: 137, y: 121 },
            { id: 3, x: 337, y: 121 },
        ]);
    });

    it("takes a selected member out on a Shift+$mod drag: the press is done, and starts no marquee", () => {
        const { editor, state } = boxed({ selected: [1, 2] });
        const keys = { shift: true, ctrl: true };
        editor.pointerDown(at(200, 100, keys));
        editor.pointerMove(at(237, 121, keys));
        expect(editor.activeGesture()).toBeNull();
        editor.pointerUp(at(237, 121, keys));
        expect(state.selected).toEqual([1]);
        expect(state.drops).toEqual([]);
    });

    it("leaves Shift free on a selected loose marcher it doesn't change: Shift is fine and $mod constrain", () => {
        const { editor, state } = boxed({ selected: [3] });
        drag(
            editor,
            { x: 300, y: 100 },
            { x: 337, y: 121 },
            { shift: true, ctrl: true },
        );
        expect(state.selected).toEqual([3]);
        expect(state.drops[0].positions).toEqual([
            { id: 3, x: 309.25, y: 100 },
        ]);
    });

    it("with box selection off, treats $mod on a member as on a loose marcher", () => {
        const { editor, state, pressSelection } = boxed({ enabled: false });
        drag(editor, { x: 200, y: 100 }, { x: 237, y: 121 }, { ctrl: true });
        expect(state.selected).toEqual([2]);
        expect(state.drops[0].positions).toEqual([{ id: 2, x: 237, y: 100 }]);
        expect(pressSelection).toHaveBeenCalledWith(2, false, false);
    });

    it("never reaches inside on a Mac's Ctrl-click: it pans and selects nothing", () => {
        const { editor, state, box, pressSelection } = boxed({
            selected: [3],
            isMac: true,
        });
        expect(editor.pointerDown(at(200, 100, { ctrl: true }))).toBe(false);
        editor.pointerUp(at(200, 100, { ctrl: true }));
        expect(state.selected).toEqual([3]);
        expect(box.inside).toBeNull();
        expect(pressSelection).not.toHaveBeenCalled();
    });
});
