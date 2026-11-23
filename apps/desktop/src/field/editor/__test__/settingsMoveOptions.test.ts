import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
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
    kind: "mouse",
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

describe("landing on the field's lines (#585), with the field ThreeField gives", () => {
    const FIELD =
        FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
    const FIFTY = FIELD.centerFrontPoint.xPixels;
    // Off every line front to back: 10.37 steps behind the front sideline
    const Y = FIELD.centerFrontPoint.yPixels - 10.37 * FIELD.pixelsPerStep;

    /** Two marchers 20 units apart, right of them the 50 yard line 10 units away, at zoom 2. */
    function setupOnField() {
        const drops: (readonly MarcherPosition[])[] = [];
        const ports: FieldEditorPorts = {
            selection: { get: () => [1, 2], set: vi.fn() },
            marchers: () => ({
                ids: [1, 2],
                positions: Float64Array.from([FIFTY - 30, Y, FIFTY - 10, Y]),
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
            settingsMoveOptions(
                () => FIELD,
                () => ({ properties: FIELD, zoom: ZOOM }),
            ),
        );
        return { editor, drops };
    }

    const dragBy = (dx: number) => {
        const { editor, drops } = setupOnField();
        editor.pointerDown(at(FIFTY - 10, Y));
        editor.pointerMove(at(FIFTY - 10 + dx, Y));
        const guides = editor.modeDrawing()?.guides ?? [];
        editor.pointerUp(at(FIFTY - 10 + dx, Y));
        return { dropped: drops[0]!.map((p) => p.x), guides, editor };
    };

    beforeEach(() => {
        // No rounding: only the lines pull
        useUiSettingsStore.setState({
            uiSettings: {
                ...useUiSettingsStore.getState().uiSettings,
                coordinateRounding: { nearestXSteps: 0, nearestYSteps: 0 },
            },
        });
    });

    it("lands the group's edge on the 50 within 6 px, with a guide named for it while dragged", () => {
        // 8 units right puts the right edge 2 units (4 px at zoom 2) short of the 50
        const { dropped, guides, editor } = dragBy(8);
        expect(dropped).toEqual([FIFTY - 20, FIFTY]);
        expect(guides).toHaveLength(1);
        expect(guides[0]!.from.x).toBe(FIFTY);
        // The guide clears on the release
        expect(editor.modeDrawing()).toBeNull();
    });

    it("moves freely farther than 6 px from a line", () => {
        // 4 short of the 50 is 8 px at zoom 2
        const { dropped, guides } = dragBy(6);
        expect(dropped).toEqual([FIFTY - 24, FIFTY - 4]);
        expect(guides).toEqual([]);
    });

    it("lands on nothing with the Snap toggle off", () => {
        setSnap(false);
        expect(dragBy(8).dropped).toEqual([FIFTY - 22, FIFTY - 2]);
    });

    it("leaves an axis with coordinate rounding to the grid", () => {
        useUiSettingsStore.setState({
            uiSettings: {
                ...useUiSettingsStore.getState().uiSettings,
                coordinateRounding: { nearestXSteps: 1, nearestYSteps: 0 },
            },
        });
        // The group moves in whole steps across, not onto the 50
        const { dropped } = dragBy(8);
        const step = FIELD.pixelsPerStep;
        expect(dropped).toEqual([
            FIFTY - 30 + Math.round(8 / step) * step,
            FIFTY - 10 + Math.round(8 / step) * step,
        ]);
    });
});
