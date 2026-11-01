import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { defaultSettings, useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    FieldEditor,
    type DropResult,
    type FieldEditorPorts,
    type FieldPointer,
} from "../fieldEditor";
import type { MarcherPosition } from "../moveGesture";
import { settingsMoveOptions } from "../settingsMoveOptions";

/**
 * The field's marcher drags and rotate handles read the app's settings through
 * `settingsMoveOptions`, which `ThreeField` gives its editor: the Snap toggle (modifier roles,
 * version A) as it is on each pointer event, with coordinate rounding and Lock X / Lock Y. Marchers
 * 1 and 2 stand 100 field units apart at zoom 2 on a grid of 10 units a step, rounded to whole
 * steps; the selection box's rotate handle is 20 units above it.
 */

const ZOOM = 2;
const GRID = {
    centerFrontPoint: { xPixels: 0, yPixels: 0 },
    pixelsPerStep: 10,
};
const ROTATE_HANDLE = { x: 150, y: 70 };

function setup() {
    const drops: (readonly MarcherPosition[])[] = [];
    const ports: FieldEditorPorts = {
        selection: { get: () => [1, 2], set: vi.fn() },
        marchers: () => ({
            ids: [1, 2],
            positions: Float64Array.from([100, 100, 200, 100]),
            hidden: new Uint8Array(2),
        }),
        zoom: () => ZOOM,
        canSelect: () => true,
        selectionBoxPadding: () => 10,
        openMenu: vi.fn(),
        showPositions: vi.fn(),
        drop: vi.fn((positions) => {
            drops.push(positions);
            return new Promise<DropResult>(() => {});
        }),
    };
    const editor = new FieldEditor(
        ports,
        settingsMoveOptions(() => GRID),
    );
    return { editor, drops };
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

/** The pointer turned `degrees` clockwise about the box's center (150, 100), 30 units out */
const turnedTo = (degrees: number) => {
    const radians = ((degrees - 90) * Math.PI) / 180;
    return at(150 + 30 * Math.cos(radians), 100 + 30 * Math.sin(radians));
};

const setSnap = (on: boolean) =>
    act(() => {
        useUiSettingsStore.getState().setSnap(on);
    });

beforeEach(() => {
    useUiSettingsStore.setState({
        uiSettings: {
            ...useUiSettingsStore.getState().uiSettings,
            coordinateRounding: { nearestXSteps: 1, nearestYSteps: 1 },
        },
    });
});

afterEach(() => {
    useUiSettingsStore.setState({ uiSettings: { ...defaultSettings } });
    localStorage.clear();
});

describe("a marcher drag, with the settings ThreeField reads", () => {
    const dragged = () => {
        const { editor, drops } = setup();
        editor.pointerDown(at(200, 100));
        editor.pointerMove(at(213, 104));
        editor.pointerUp(at(213, 104));
        return drops[0]![1];
    };

    it("moves in whole rounding steps with the Snap toggle on", () => {
        expect(dragged()).toEqual({ id: 2, x: 210, y: 100 });
    });

    it("isn't rounded with the Snap toggle off", () => {
        setSnap(false);
        expect(dragged()).toEqual({ id: 2, x: 213, y: 104 });
    });

    it("keeps Lock Y", () => {
        useUiSettingsStore.setState({
            uiSettings: {
                ...useUiSettingsStore.getState().uiSettings,
                lockY: true,
            },
        });
        setSnap(false);
        expect(dragged()).toEqual({ id: 2, x: 213, y: 100 });
    });
});

describe("the selection's rotate handle, with the settings ThreeField reads", () => {
    it("turns in 15° steps with the Snap toggle on, and freely from the next move once it's off", () => {
        const { editor } = setup();
        editor.pointerDown(at(ROTATE_HANDLE.x, ROTATE_HANDLE.y));
        editor.pointerMove(turnedTo(37));
        expect(editor.rotationFrame()?.angle).toBe(30);
        setSnap(false);
        editor.pointerMove(turnedTo(38));
        expect(editor.rotationFrame()?.angle).toBeCloseTo(38, 6);
        editor.pointerCancel();
    });
});
