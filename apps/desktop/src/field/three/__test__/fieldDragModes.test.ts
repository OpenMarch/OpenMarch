import { afterEach, describe, expect, it } from "vitest";
import type { FieldPointer } from "@/field/editor/fieldEditor";
import {
    FIELD_DRAG_MODE_KEY,
    activeFieldDragMode,
    useFieldDragModeStore,
    type FieldDragMode,
} from "@/components/canvas/touch/fieldDragMode";
import { useInputModeStore } from "@/stores/InputModeStore";
import { fingerRole, holdDragArea, penDrag } from "../fieldDragModes";

/**
 * The pill's drag modes on the field (tablet 1.3): what a finger or pen press
 * on empty field does in each. The editor is faked: `edits` is a press on a
 * marcher, a handle or inside the selection box; `empty` is empty field with
 * no tool or field mode on.
 */
const press = { field: { x: 0, y: 0 } } as FieldPointer;
const editor = (where: "marcher" | "empty" | "tool") => ({
    fingerEdits: () => where === "marcher",
    pressOnEmptyField: () => where === "empty",
});
const MODES: FieldDragMode[] = ["auto", "box", "lasso", "pan"];

afterEach(() => {
    useInputModeStore.setState({ mode: "pointer" });
    useFieldDragModeStore.getState().setMode("auto");
});

describe("one finger", () => {
    it("on empty field: pans in Auto and Pan, draws a box in Box and a lasso in Lasso (finger selects)", () => {
        expect(
            MODES.map((mode) => fingerRole(editor("empty"), press, mode)),
        ).toEqual(["navigate", "marquee", "lasso", "navigate"]);
    });

    it("on a marcher, a handle or inside the selection: edits in every mode", () => {
        for (const mode of MODES)
            expect(fingerRole(editor("marcher"), press, mode)).toBe("edit");
    });

    it("with a tool or field mode on: navigates in every mode (the tool's presses are its own)", () => {
        for (const mode of MODES)
            expect(fingerRole(editor("tool"), press, mode)).toBe("navigate");
    });

    it("held, then dragged on empty field: draws a box where it would pan (Auto, Pan)", () => {
        expect(
            MODES.map((mode) => holdDragArea(editor("empty"), press, mode)),
        ).toEqual(["marquee", null, null, "marquee"]);
        expect(holdDragArea(editor("tool"), press, "auto")).toBeNull();
    });
});

describe("the pen", () => {
    it("on empty field: the editor's, as a mouse's, in Auto and Box; pans in Pan; lassos in Lasso", () => {
        expect(
            MODES.map((mode) => penDrag(editor("empty"), press, mode)),
        ).toEqual([null, null, "lasso", "pan"]);
    });

    it("anywhere else: the editor's in every mode", () => {
        for (const mode of MODES) {
            expect(penDrag(editor("marcher"), press, mode)).toBeNull();
            expect(penDrag(editor("tool"), press, mode)).toBeNull();
        }
    });
});

describe("the mode in force", () => {
    it("is the stored mode in the touch layout, kept on this device", () => {
        useInputModeStore.setState({ mode: "touch" });
        useFieldDragModeStore.getState().setMode("lasso");
        expect(activeFieldDragMode()).toBe("lasso");
        expect(localStorage.getItem(FIELD_DRAG_MODE_KEY)).toBe("lasso");
        expect(fingerRole(editor("empty"), press)).toBe("lasso");
    });

    it("is Auto in the mouse layout, which shows no pill", () => {
        useInputModeStore.setState({ mode: "pointer" });
        useFieldDragModeStore.getState().setMode("pan");
        expect(activeFieldDragMode()).toBe("auto");
        expect(penDrag(editor("empty"), press)).toBeNull();
    });
});
