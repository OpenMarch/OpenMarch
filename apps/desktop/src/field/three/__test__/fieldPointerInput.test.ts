import { describe, expect, it } from "vitest";
import { FieldEditor, type FieldEditorPorts } from "@/field/editor/fieldEditor";
import type { FieldPoint } from "@/field/editor/view";
import { attachFieldPointerInput } from "../fieldPointerInput";
import { useFieldViewStore } from "../fieldView";

/**
 * The renderer's side of a lost pointer (#208): losing the pointer capture
 * the editor's press took (an OS dialog, switching windows mid-drag) cancels
 * that press, and nothing the drag drew stays. A real editor over two
 * marchers; the view is 1 CSS px per field unit from the element's corner.
 */
function setup() {
    useFieldViewStore.setState({ zoom: 1, panX: 0, panY: 0 });
    const state = {
        selected: [] as readonly number[],
        shown: null as ReadonlyMap<number, FieldPoint> | null,
        drops: 0,
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
    };
    const editor = new FieldEditor(ports);
    const element = document.createElement("div");
    const captures = new Set<number>();
    element.setPointerCapture = (id) => void captures.add(id);
    element.releasePointerCapture = (id) => void captures.delete(id);
    element.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    document.body.append(element);
    const detach = attachFieldPointerInput(element, editor);
    const fire = (
        type: string,
        { x = 0, y = 0, pointerId = 1, button = 0 } = {},
    ) => {
        const event = new MouseEvent(type, {
            clientX: x,
            clientY: y,
            button,
            bubbles: true,
        });
        Object.assign(event, { pointerId, pointerType: "mouse" });
        element.dispatchEvent(event);
    };
    return { editor, state, captures, fire, detach };
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
