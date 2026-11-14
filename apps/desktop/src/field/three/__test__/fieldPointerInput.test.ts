import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GESTURE_TIMING } from "@/components/canvas/touch/touchGestures";
import { FieldEditor, type FieldEditorPorts } from "@/field/editor/fieldEditor";
import type { FieldPoint } from "@/field/editor/view";
import {
    attachFieldPointerInput,
    type FieldPointerInputOptions,
} from "../fieldPointerInput";
import { useFieldViewStore } from "../fieldView";

/**
 * The renderer's side of a lost pointer (#208): losing the pointer capture
 * the editor's press took (an OS dialog, switching windows mid-drag) cancels
 * that press, and nothing the drag drew stays. A real editor over two
 * marchers; the view is 1 CSS px per field unit from the element's corner.
 */
function setup(options?: FieldPointerInputOptions) {
    useFieldViewStore.setState({
        width: 800,
        height: 600,
        zoom: 1,
        panX: 0,
        panY: 0,
        field: { width: 1e6, height: 1e6 },
    });
    const state = {
        selected: [] as readonly number[],
        shown: null as ReadonlyMap<number, FieldPoint> | null,
        drops: 0,
        menus: 0,
    };
    const ports: FieldEditorPorts = {
        selection: {
            get: () => state.selected,
            set: (ids) => {
                state.selected = ids;
            },
        },
        marchers: () => ({
            ids: [1, 2],
            positions: Float64Array.from([100, 100, 200, 100]),
            hidden: Uint8Array.from([0, 0]),
        }),
        zoom: () => 1,
        canSelect: () => true,
        selectionBoxPadding: () => 10,
        showPositions: (positions) => {
            state.shown = positions;
        },
        drop: () => {
            state.drops++;
            return new Promise(() => {});
        },
        openMenu: () => {
            state.menus++;
        },
    };
    const editor = new FieldEditor(ports);
    const element = document.createElement("div");
    const captures = new Set<number>();
    element.setPointerCapture = (id) => void captures.add(id);
    element.releasePointerCapture = (id) => void captures.delete(id);
    element.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    // The field's root, where navigation captures right presses (#194)
    const root = document.createElement("div");
    root.append(element);
    document.body.append(root);
    const detach = attachFieldPointerInput(element, editor, options);
    const fire = (
        type: string,
        {
            x = 0,
            y = 0,
            pointerId = 1,
            button = 0,
            buttons = 0,
            target = element as HTMLElement,
            pointerType = "mouse",
        } = {},
    ) => {
        const event = new MouseEvent(type, {
            clientX: x,
            clientY: y,
            button,
            buttons,
            bubbles: true,
        });
        Object.assign(event, { pointerId, pointerType });
        target.dispatchEvent(event);
    };
    return { editor, state, captures, fire, detach, root };
}

describe("attachFieldPointerInput, a lost pointer (#208)", () => {
    it("cancels the drag when the press's capture is lost, and the drag's release does nothing", () => {
        const { editor, state, captures, fire } = setup();
        fire("pointerdown", { x: 100, y: 100 });
        expect(captures.has(1)).toBe(true);
        fire("pointermove", { x: 100, y: 160 });
        expect(editor.activeGesture()).toBe("move");
        expect(state.shown).not.toBeNull();

        fire("lostpointercapture");
        expect(editor.activeGesture()).toBeNull();
        expect(state.shown).toBeNull();
        fire("pointermove", { x: 100, y: 200 });
        fire("pointerup", { x: 100, y: 200 });
        expect(state.shown).toBeNull();
        expect(state.drops).toBe(0);

        // The next press is a press like any other
        fire("pointerdown", { x: 200, y: 100 });
        fire("pointerup", { x: 200, y: 100 });
        expect(state.selected).toEqual([2]);
    });

    it("leaves the press alone when another pointer's capture is lost", () => {
        const { editor, fire } = setup();
        fire("pointerdown", { x: 100, y: 100 });
        fire("pointermove", { x: 100, y: 160 });
        fire("lostpointercapture", { pointerId: 7 });
        expect(editor.activeGesture()).toBe("move");
    });
});

describe("attachFieldPointerInput, the pointer's kind (tablet 0.1)", () => {
    // Marcher 1 is at (100, 100); at zoom 1 a mouse reaches 6 units from it, a pen 8
    it("tells the editor a pen press is a pen's, so it reaches a little further", () => {
        const { state, fire } = setup();
        fire("pointerdown", { x: 107, y: 100, pointerType: "pen" });
        fire("pointerup", { x: 107, y: 100, pointerType: "pen" });
        expect(state.selected).toEqual([1]);
    });

    it("leaves finger presses to the gesture adapter: the editor hears none", () => {
        const { fire, state, captures } = setup();
        fire("pointerdown", { x: 100, y: 100, pointerType: "touch" });
        fire("pointermove", { x: 160, y: 100, pointerType: "touch" });
        fire("pointerup", { x: 160, y: 100, pointerType: "touch" });
        expect(captures.size).toBe(0);
        expect(state.selected).toEqual([]);
        expect(state.shown).toBeNull();
    });

    it("tells the editor a mouse press is a mouse's", () => {
        const { state, fire } = setup();
        fire("pointerdown", { x: 107, y: 100 });
        fire("pointerup", { x: 107, y: 100 });
        expect(state.selected).toEqual([]);
    });
});

describe("attachFieldPointerInput, the right-click menu (#315)", () => {
    it("opens the menu on a right-click whose release navigation captured", () => {
        const { state, fire, root } = setup();
        fire("pointerdown", { x: 300, y: 300, button: 2, buttons: 2 });
        fire("pointerup", { x: 300, y: 300, button: 2, target: root });
        expect(state.menus).toBe(1);
    });

    it("opens no menu after a right-drag that came back, its moves captured by navigation", () => {
        const { state, fire, root } = setup();
        fire("pointerdown", { x: 300, y: 300, button: 2, buttons: 2 });
        fire("pointermove", { x: 360, y: 300, buttons: 2, target: root });
        fire("pointermove", { x: 300, y: 300, buttons: 2, target: root });
        fire("pointerup", { x: 300, y: 300, button: 2, target: root });
        expect(state.menus).toBe(0);
    });
});

describe("attachFieldPointerInput, right presses that start off the field (#315 review)", () => {
    /** The field points of the moves the editor is sent. */
    const watchMoves = (editor: FieldEditor) => {
        const moves: FieldPoint[] = [];
        const move = editor.pointerMove.bind(editor);
        editor.pointerMove = (pointer) => {
            moves.push(pointer.field);
            move(pointer);
        };
        return moves;
    };

    it("doesn't forward a right-drag that started elsewhere (the timeline)", () => {
        const { editor, fire, root } = setup();
        const moves = watchMoves(editor);
        // A right-drag that began outside the field, moving over its root
        const outside = document.createElement("div");
        document.body.append(outside);
        fire("pointermove", { x: 400, y: 500, buttons: 2, target: outside });
        fire("pointermove", { x: 420, y: 520, buttons: 2, target: root });
        expect(moves).toEqual([]);
        outside.remove();
    });

    it("still forwards the moves of a right press that started on the field", () => {
        const { editor, fire, root } = setup();
        const moves = watchMoves(editor);
        fire("pointerdown", { x: 150, y: 300, button: 2, buttons: 2 });
        fire("pointermove", { x: 420, y: 520, buttons: 2, target: root });
        expect(moves).toEqual([{ x: 420, y: 520 }]);
        fire("pointerup", { x: 420, y: 520, button: 2, target: root });
        // Over: later right-button moves from elsewhere aren't the field's
        fire("pointermove", { x: 50, y: 50, buttons: 2, target: root });
        expect(moves).toEqual([{ x: 420, y: 520 }]);
    });
});

describe("attachFieldPointerInput, the pen and the drag modes (tablet 1.3)", () => {
    const pen = { pointerType: "pen" } as const;

    it("pans with a pen press the mode says pans, one to one once past the pen's slop", () => {
        const { state, captures, fire } = setup({ penDrag: () => "pan" });
        fire("pointerdown", { x: 400, y: 300, buttons: 1, ...pen });
        expect(captures.has(1)).toBe(true);
        fire("pointermove", { x: 403, y: 300, buttons: 1, ...pen });
        expect(useFieldViewStore.getState().panX).toBe(0);
        fire("pointermove", { x: 440, y: 310, buttons: 1, ...pen });
        expect(useFieldViewStore.getState()).toMatchObject({
            panX: 40,
            panY: 10,
        });
        fire("pointerup", { x: 440, y: 310, ...pen });
        expect(useFieldViewStore.getState().panning).toBe(false);
        expect(state.selected).toEqual([]);
    });

    it("clicks with a pen press there that never left its slop: the selection clears, as a tap's", () => {
        const { state, fire } = setup({ penDrag: () => "pan" });
        state.selected = [1];
        fire("pointerdown", { x: 400, y: 300, buttons: 1, ...pen });
        fire("pointerup", { x: 402, y: 300, ...pen });
        expect(state.selected).toEqual([]);
        expect(useFieldViewStore.getState().panX).toBe(0);
    });

    it("draws a lasso with a pen press the mode says lassos", () => {
        const { editor, fire } = setup({ penDrag: () => "lasso" });
        fire("pointerdown", { x: 300, y: 300, buttons: 1, ...pen });
        fire("pointermove", { x: 340, y: 300, buttons: 1, ...pen });
        expect(editor.activeGesture()).toBe("lasso");
    });

    it("asks only about a pen's primary press: a mouse's press never changes", () => {
        const asked: string[] = [];
        const { editor, fire } = setup({
            penDrag: (press) => {
                asked.push(press.kind);
                return "pan";
            },
        });
        fire("pointerdown", { x: 300, y: 300, buttons: 1 });
        fire("pointermove", { x: 340, y: 300, buttons: 1 });
        expect(asked).toEqual([]);
        expect(editor.activeGesture()).toBe("marquee");
        expect(useFieldViewStore.getState().panX).toBe(0);
    });
});

describe("attachFieldPointerInput, a pen held still (tablet 1.5)", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["performance"] });
    });
    afterEach(() => vi.useRealTimers());
    /** Past the long press time */
    const hold = () => vi.advanceTimersByTime(GESTURE_TIMING.longPressMs + 50);
    const pen = { pointerType: "pen" };

    it("held, then lifted without moving: selects the marcher under it and opens the field's menu, and the lift does nothing more", () => {
        const { editor, state, fire } = setup();
        fire("pointerdown", { x: 100, y: 100, buttons: 1, ...pen });
        fire("pointermove", { x: 103, y: 101, buttons: 1, ...pen });
        hold();
        // Armed only: the press is still the editor's
        expect(state.menus).toBe(0);
        fire("pointerup", { x: 103, y: 101, ...pen });
        expect(state.menus).toBe(1);
        expect(state.selected).toEqual([1]);
        expect(editor.activeGesture()).toBeNull();
        expect(state.shown).toBeNull();
        expect(state.drops).toBe(0);
        // The next pen press is a press like any other
        fire("pointerdown", { x: 200, y: 100, ...pen });
        fire("pointerup", { x: 200, y: 100, ...pen });
        expect(state.selected).toEqual([2]);
        expect(state.menus).toBe(1);
    });

    it("held, then moved on: drags the marcher, and no menu opens", () => {
        const { editor, state, fire } = setup();
        fire("pointerdown", { x: 100, y: 100, buttons: 1, ...pen });
        hold();
        fire("pointermove", { x: 100, y: 130, buttons: 1, ...pen });
        expect(editor.activeGesture()).toBe("move");
        fire("pointerup", { x: 100, y: 130, ...pen });
        expect(state.menus).toBe(0);
        expect(state.drops).toBe(1);
    });

    it("opens no menu for a quick pen tap, nor for a mouse held still", () => {
        const { state, fire } = setup();
        fire("pointerdown", { x: 100, y: 100, ...pen });
        fire("pointerup", { x: 100, y: 100, ...pen });
        fire("pointerdown", { x: 200, y: 100, buttons: 1 });
        hold();
        fire("pointerup", { x: 200, y: 100 });
        expect(state.menus).toBe(0);
        expect(state.selected).toEqual([2]);
    });
});

describe("attachFieldPointerInput, a pen held still in Pan (tablet 1.3 with 1.5)", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["performance"] });
    });
    afterEach(() => vi.useRealTimers());
    const hold = () => vi.advanceTimersByTime(GESTURE_TIMING.longPressMs + 50);
    const pen = { pointerType: "pen" } as const;

    it("held on empty field and lifted unmoved: opens the field's menu, and doesn't click (the selection stays)", () => {
        const { state, fire } = setup({ penDrag: () => "pan" });
        state.selected = [1];
        fire("pointerdown", { x: 400, y: 300, buttons: 1, ...pen });
        hold();
        fire("pointerup", { x: 402, y: 300, ...pen });
        expect(state.menus).toBe(1);
        expect(state.selected).toEqual([1]);
        expect(useFieldViewStore.getState().panX).toBe(0);
    });

    it("held, then moved on: pans, and no menu opens", () => {
        const { state, fire } = setup({ penDrag: () => "pan" });
        fire("pointerdown", { x: 400, y: 300, buttons: 1, ...pen });
        hold();
        fire("pointermove", { x: 407, y: 300, buttons: 1, ...pen });
        fire("pointerup", { x: 407, y: 300, ...pen });
        expect(useFieldViewStore.getState().panX).toBe(7);
        expect(state.menus).toBe(0);
    });

    it("held in Lasso and lifted unmoved: opens the menu, draws nothing", () => {
        const { editor, state, fire } = setup({ penDrag: () => "lasso" });
        fire("pointerdown", { x: 400, y: 300, buttons: 1, ...pen });
        hold();
        fire("pointerup", { x: 401, y: 300, ...pen });
        expect(state.menus).toBe(1);
        expect(editor.activeGesture()).toBeNull();
    });
});
