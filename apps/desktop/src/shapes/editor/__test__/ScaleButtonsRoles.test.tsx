import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { Roles } from "@/input/modifierRoles";
import * as platform from "@/shortcuts/platform";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import type { ShapeField } from "../../field/shapeField";
import { toolEnvFor } from "../../tool/toolEnv";
import { boxTool } from "../../box/boxTool";
import type { BoxParams } from "../../box/boxGeometry";
import { watchKeyListeners } from "../../__test__/keyListeners";
import type { ShapeEditTarget } from "../editTargets";
import { ScaleButtons } from "../ScaleButtons";
import { stubPointerCapture } from "./pointerEvents";

/**
 * Dragging Expand or Shrink scrubs the shape bigger or smaller (#489), reading held roles
 * (version A): with Shift (fine) a spacing goes in hundredths of a step. A role key pressed or
 * released mid-drag scrubs again where the pointer is, and the keyboard stops being followed when
 * the press ends. With the Snap toggle off it scrubs freely. Off a Mac here, so $mod is Ctrl.
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const field = {
    fieldProperties,
    zoom: () => 1,
    marchers: () => [],
    drawn: () => new Map(),
} as unknown as ShapeField;

let restorePointerCapture: () => void;

beforeEach(() => {
    vi.spyOn(platform, "isMacPlatform").mockReturnValue(false);
    restorePointerCapture = stubPointerCapture();
});

afterEach(() => {
    cleanup();
    act(() => {
        useUiSettingsStore.getState().setSnap(true);
    });
    restorePointerCapture();
    vi.restoreAllMocks();
});

/** A 2 × 2 box, 2 steps apart, behind the buttons; `preview` hears every scrub */
function shown() {
    const params: BoxParams = {
        center: { x: 300, y: 300 },
        rotation: 0,
        files: 2,
        across: 2 * STEP,
        deep: 2 * STEP,
    };
    const preview = vi.fn<(params: unknown) => void>();
    const target = {
        kind: boxTool,
        params,
        spots: 4,
        empty: 0,
        drawnOn: null,
        begin: () => {},
        preview,
        end: () => {},
        apply: () => {},
        update: () => {},
        recalculate: null,
    } as unknown as ShapeEditTarget;
    const { unmount } = render(
        <ScaleButtons
            live={target}
            envFor={(roles?: Roles) => toolEnvFor(field, roles)}
            canShrink
            canExpand
        />,
    );
    const gap = () =>
        (preview.mock.calls.at(-1)![0] as BoxParams).across / STEP;
    return {
        button: screen.getByTestId("shape-editor-expand"),
        preview,
        gap,
        unmount,
    };
}

describe("dragging Expand", () => {
    it("scrubs again where it is when Shift goes down or up mid-drag", () => {
        const { button, preview, gap } = shown();
        fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(button, { clientX: 20, clientY: 0 });
        const stepped = gap();
        expect(stepped).toBeGreaterThan(2);
        expect(Math.round(stepped * 2)).toBeCloseTo(stepped * 2, 9);

        const calls = preview.mock.calls.length;
        fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
        expect(preview.mock.calls.length).toBe(calls + 1);
        const fine = gap();
        expect(fine).toBeGreaterThan(2);
        expect(fine).not.toBeCloseTo(stepped, 6);

        fireEvent.keyUp(window, { key: "Shift" });
        expect(gap()).toBeCloseTo(stepped, 9);
    });

    it("a key before the drag passes the slop scrubs nothing", () => {
        const { button, preview } = shown();
        fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(button, { clientX: 1, clientY: 0 });
        fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
        expect(preview).not.toHaveBeenCalled();
        fireEvent.pointerCancel(button);
    });
});

describe("dragging Expand with the Snap toggle", () => {
    it("off, scrubs freely: half a step per 8 px, not whole steps of the rule", () => {
        act(() => {
            useUiSettingsStore.getState().setSnap(false);
        });
        const { button, gap } = shown();
        fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(button, { clientX: 20, clientY: 0 });
        expect(gap()).toBeCloseTo(3.25, 9);
        fireEvent.pointerUp(button);
    });

    it("on, goes in half steps", () => {
        const { button, gap } = shown();
        fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(button, { clientX: 20, clientY: 0 });
        expect(gap()).toBe(3);
        fireEvent.pointerUp(button);
    });

    it("turned off mid-drag, scrubs freely from the next move", () => {
        const { button, gap } = shown();
        fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(button, { clientX: 20, clientY: 0 });
        expect(gap()).toBe(3);
        act(() => {
            useUiSettingsStore.getState().setSnap(false);
        });
        fireEvent.pointerMove(button, { clientX: 21, clientY: 0 });
        // A spacing keeps 600ths of a step
        expect(gap()).toBeCloseTo(2 + (21 * 0.5) / 8, 2);
        fireEvent.pointerUp(button);
    });
});

describe("an Expand press stops following the keys", () => {
    it.each([
        ["released", (button: HTMLElement) => fireEvent.pointerUp(button)],
        ["cancelled", (button: HTMLElement) => fireEvent.pointerCancel(button)],
        [
            "when it loses the pointer",
            (button: HTMLElement) => fireEvent.lostPointerCapture(button),
        ],
        [
            "when it's unmounted mid-drag",
            (_: HTMLElement, unmount: () => void) => unmount(),
        ],
    ])("%s", (_, end) => {
        const keyListeners = watchKeyListeners();
        const { button, preview, unmount } = shown();
        fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(button, { clientX: 20, clientY: 0 });
        expect(keyListeners()).toBeGreaterThan(0);
        end(button, unmount);
        expect(keyListeners()).toBe(0);
        const calls = preview.mock.calls.length;
        fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
        expect(preview.mock.calls.length).toBe(calls);
    });
});
