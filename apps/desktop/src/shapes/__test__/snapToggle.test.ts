import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup } from "@testing-library/react";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { FieldModePress, FieldPointer } from "@/field/editor/fieldEditor";
import { NO_KEYS } from "@/input/modifierRoles";
import * as platform from "@/shortcuts/platform";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { getRoundCoordinates2 } from "@/utilities/CoordinateActions";
import type { BoxParams } from "../box/boxGeometry";
import { boxTool } from "../box/boxTool";
import { setShapeField } from "../field/shapeField";
import { shapeContextFor } from "../field/shapeFieldContext";
import { rotationDegrees } from "../frame/frame";
import { frameControls } from "../frame/gestures";
import { shapeToolMode } from "../tool/shapeToolMode";
import {
    closeShapeTool,
    openShapeTool,
    useShapeToolStore,
} from "../tool/shapeToolStore";
import { nudgeEnvFor, toolEnvFor } from "../tool/toolEnv";
import type { AnyToolKind } from "../tool/toolKind";
import { openTool, pointerMove, press, release } from "../tool/toolMachine";
import type { XY } from "../types";
import { rowTool, type RowParams } from "./fakeRowKind";

/**
 * The Snap toggle (modifier roles, version A) covers shape drags on the field: off, nothing lands
 * on half steps, nothing is pulled onto the field's lines, and a turn is free of its 15° steps.
 * Every env the tool works a pointer event out with reads the toggle then, so a change mid-drag
 * applies on the next move. On, the drags are as they were.
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const N = 12;
/** Away from the field's lines */
const FROM = { x: 30 * STEP + 1, y: 20 * STEP + 1 };

/** What the field editor tells a mode of a press, off a Mac */
const OFF_MAC: FieldModePress = { reachesInside: () => false, isMac: false };

const pointer = (field: XY): FieldPointer => ({
    field,
    screen: field,
    button: 0,
    ...NO_KEYS,
});

const field = () => ({
    fieldProperties,
    zoom: () => 1,
    marchers: () => [],
    drawn: () => new Map(),
});

const setSnap = (on: boolean) => {
    act(() => {
        useUiSettingsStore.getState().setSnap(on);
    });
};

beforeEach(() => {
    vi.spyOn(platform, "isMacPlatform").mockReturnValue(false);
    setShapeField({
        fieldProperties: () => fieldProperties,
        zoom: () => 1,
        marchers: () => [],
        drawn: () => new Map(),
    });
});

afterEach(() => {
    cleanup();
    shapeToolMode.cancel();
    closeShapeTool();
    setShapeField(null);
    setSnap(true);
    vi.restoreAllMocks();
});

const marchers = Array.from({ length: N }, (_, i) => ({
    id: i + 1,
    at: { x: 300 + i * 7, y: 300 },
    drillRank: i,
}));

/** `kind` drawn from {@link FROM} to `to` and opened, with snapping on */
function openDrawn<P>(kind: AnyToolKind, to: XY): P {
    const env = toolEnvFor(field());
    let t = openTool(kind, marchers);
    t = press(t, FROM, env);
    t = pointerMove(t, to, env);
    t = release(t, shapeContextFor(field()));
    openShapeTool(t, null, null);
    return t.params as P;
}

const openParams = <P = BoxParams>() =>
    useShapeToolStore.getState().tool!.params as P;
const degreesOf = (p: RowParams) =>
    rotationDegrees(rowTool.frameOf(p, N).rotation);

/** `p` turned `degrees` around `around` */
const turned = (p: XY, around: XY, degrees: number): XY => {
    const r = (degrees * Math.PI) / 180;
    const dx = p.x - around.x;
    const dy = p.y - around.y;
    return {
        x: around.x + dx * Math.cos(r) - dy * Math.sin(r),
        y: around.y + dx * Math.sin(r) + dy * Math.cos(r),
    };
};

/** An open row's knob, pressed */
function pressKnob() {
    const row = openDrawn<RowParams>(rowTool, {
        x: FROM.x + 22 * STEP,
        y: FROM.y,
    });
    const { knob, center } = frameControls(
        rowTool,
        row,
        N,
        toolEnvFor(field()),
    );
    shapeToolMode.press(pointer(knob), OFF_MAC);
    return { knob, center };
}

/** Whether `p` stands on a half step from the center front point, to the thousandths saved */
const onHalfSteps = (p: XY) => {
    const r = getRoundCoordinates2({
        coordinate: { xPixels: p.x, yPixels: p.y },
        fieldProperties,
        uiSettings: {
            coordinateRounding: { nearestXSteps: 0.5, nearestYSteps: 0.5 },
        },
    });
    return Math.abs(r.xPixels - p.x) < 0.01 && Math.abs(r.yPixels - p.y) < 0.01;
};

const spotsOf = (box: BoxParams) =>
    boxTool.shape.generate(box, N, shapeContextFor(field()));

describe("turning an open shape by its knob", () => {
    it("is free of its 15° steps with Snap off", () => {
        setSnap(false);
        const { knob, center } = pressKnob();
        shapeToolMode.move(pointer(turned(knob, center, 33.4)));
        expect(degreesOf(openParams())).toBeCloseTo(33.4, 1);
    });

    it("goes in 15° steps with Snap on", () => {
        const { knob, center } = pressKnob();
        shapeToolMode.move(pointer(turned(knob, center, 33.4)));
        expect(degreesOf(openParams())).toBe(30);
    });

    it("follows the toggle changed mid-drag on the next move", () => {
        const { knob, center } = pressKnob();
        shapeToolMode.move(pointer(turned(knob, center, 33.4)));
        expect(degreesOf(openParams())).toBe(30);
        setSnap(false);
        shapeToolMode.move(pointer(turned(knob, center, 33.5)));
        expect(degreesOf(openParams())).toBeCloseTo(33.5, 1);
    });
});

describe("moving an open box", () => {
    /** An open 4 × 3 box, pressed inside clear of its handles and center dot, and dragged `by` */
    function moved(by: XY) {
        const box = openDrawn<BoxParams>(boxTool, {
            x: FROM.x + 12 * STEP,
            y: FROM.y + 6 * STEP,
        });
        const before = spotsOf(box);
        const grab = { x: box.center.x + 2 * STEP, y: box.center.y + STEP };
        shapeToolMode.press(pointer(grab), OFF_MAC);
        expect(useShapeToolStore.getState().tool!.gesture?.type).toBe("move");
        shapeToolMode.move(pointer({ x: grab.x + by.x, y: grab.y + by.y }));
        return { before, after: spotsOf(openParams()) };
    }

    const by = { x: 0.3 * STEP, y: 0.2 * STEP };

    it("follows the pointer exactly with Snap off: off the half steps, pulled onto nothing", () => {
        setSnap(false);
        const { before, after } = moved(by);
        after.forEach((spot, i) => {
            expect(spot.x - before[i]!.x).toBeCloseTo(by.x, 6);
            expect(spot.y - before[i]!.y).toBeCloseTo(by.y, 6);
        });
        expect(after.some((spot) => !onHalfSteps(spot))).toBe(true);
    });

    it("lands on half steps with Snap on", () => {
        const { after } = moved(by);
        expect(after.every(onHalfSteps)).toBe(true);
    });
});

describe("the env a shape is worked out with", () => {
    it("reads the toggle when it's made: no ladder, no pull, with Snap off", () => {
        setSnap(false);
        const env = toolEnvFor(field());
        expect(env.snap).toBe(false);
        expect(env.pull).toBe(false);
        const p = { x: FROM.x + 0.3 * STEP, y: FROM.y };
        expect(env.gridSnap(p)).toEqual(p);
    });

    it("snaps and pulls with Snap on", () => {
        const env = toolEnvFor(field());
        expect(env.snap).toBe(true);
        expect(env.pull).toBe(true);
    });

    it("a plain arrow nudge doesn't snap with Snap off", () => {
        setSnap(false);
        const env = nudgeEnvFor(field(), { step: "grid", snap: true });
        expect(env.snap).toBe(false);
        expect(env.pull).toBe(false);
    });

    it("a fine arrow nudge isn't pulled with Snap off", () => {
        setSnap(false);
        const env = nudgeEnvFor(field(), { step: "quarter", snap: false });
        expect(env.fine).toBe(true);
        expect(env.pull).toBe(false);
    });

    it("a plain arrow nudge snaps with Snap on", () => {
        const env = nudgeEnvFor(field(), { step: "grid", snap: true });
        expect(env.snap).toBe(true);
        expect(env.pull).toBe(true);
    });
});
