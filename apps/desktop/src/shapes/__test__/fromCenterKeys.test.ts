import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { FieldModePress, FieldPointer } from "@/field/editor/fieldEditor";
import { NO_KEYS, type HeldKeys } from "@/input/modifierRoles";
import * as platform from "@/shortcuts/platform";
import { boxShape } from "../box/boxShape";
import { boxHandlePoint, drawBox, type BoxParams } from "../box/boxGeometry";
import { boxTool } from "../box/boxTool";
import { setShapeField } from "../field/shapeField";
import { shapeContextFor } from "../field/shapeFieldContext";
import { LiveBoxMode } from "../placed/liveBoxMode";
import type { PlacedBox } from "../placed/placedBox";
import { shapeToolMode } from "../tool/shapeToolMode";
import {
    closeShapeTool,
    openShapeTool,
    useShapeToolStore,
} from "../tool/shapeToolStore";
import { toolEnvFor } from "../tool/toolEnv";
import { openTool } from "../tool/toolMachine";
import type { XY } from "../types";

/**
 * Alt (`fromCenter`, version A) through the shape tool and a placed box: held at the press, or
 * pressed and released mid-drag, it re-runs the drag without a pointer move. Off a Mac here.
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;

const pointer = (field: XY, keys: Partial<HeldKeys> = {}): FieldPointer => ({
    field,
    screen: field,
    button: 0,
    ...NO_KEYS,
    ...keys,
});

/** A modifier key going down or up on the window, as the browser reports it */
const key = (type: "keydown" | "keyup", held: Partial<HeldKeys>) =>
    window.dispatchEvent(
        new KeyboardEvent(type, {
            shiftKey: held.shift ?? false,
            altKey: held.alt ?? false,
            ctrlKey: held.ctrl ?? false,
            metaKey: held.meta ?? false,
        }),
    );

const field = () => ({
    fieldProperties,
    zoom: () => 1,
    marchers: () => [],
    drawn: () => new Map(),
});

/** What the field editor tells a mode of a press, off a Mac */
const OFF_MAC: FieldModePress = { reachesInside: () => false, isMac: false };

/** On the grid and away from the field's lines */
const FROM = toolEnvFor(field()).gridSnap({ x: 30 * STEP, y: 20 * STEP });

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
    vi.restoreAllMocks();
});

const N = 9;
const marchers = Array.from({ length: N }, (_, i) => ({
    id: i + 1,
    at: { x: 300 + i * 7, y: 300 },
    drillRank: i,
}));

const openParams = () => useShapeToolStore.getState().tool!.params as BoxParams;
const xs = (outline: readonly XY[]) => outline.map((p) => p.x);
const ys = (outline: readonly XY[]) => outline.map((p) => p.y);
/** The middle of an outline's extent each way */
const middleOf = (outline: readonly XY[]): XY => ({
    x: (Math.min(...xs(outline)) + Math.max(...xs(outline))) / 2,
    y: (Math.min(...ys(outline)) + Math.max(...ys(outline))) / 2,
});
const boxCenter = (p: BoxParams) => boxTool.frameOf(p, N).center;

describe("drawing a box with Alt", () => {
    /** 3 by 3 steps out from {@link FROM} */
    const TO = { x: FROM.x + 6 * STEP, y: FROM.y + 6 * STEP };

    it("held from the press, grows the box about the press", () => {
        openShapeTool(openTool(boxTool, marchers), null, null);
        shapeToolMode.press(pointer(FROM, { alt: true }), OFF_MAC);
        shapeToolMode.move(pointer(TO, { alt: true }));
        const c = boxCenter(openParams());
        expect(c.x).toBeCloseTo(FROM.x, 6);
        expect(c.y).toBeCloseTo(FROM.y, 6);
    });

    it("pressed and released mid-drag, switches between corner to corner and from the center without a pointer move", () => {
        openShapeTool(openTool(boxTool, marchers), null, null);
        shapeToolMode.press(pointer(FROM), OFF_MAC);
        shapeToolMode.move(pointer(TO));
        const corner = openParams();
        const middle = boxCenter(corner);
        expect(middle.x).toBeCloseTo((FROM.x + TO.x) / 2, 6);

        key("keydown", { alt: true });
        const centered = boxCenter(openParams());
        expect(centered.x).toBeCloseTo(FROM.x, 6);
        expect(centered.y).toBeCloseTo(FROM.y, 6);

        key("keyup", {});
        expect(openParams()).toEqual(corner);
    });
});

describe("the open box's handle with Alt mid-drag", () => {
    it("resizes about the center, and letting go puts the opposite side back", () => {
        openShapeTool(openTool(boxTool, marchers), null, null);
        shapeToolMode.press(pointer(FROM), OFF_MAC);
        shapeToolMode.move(
            pointer({ x: FROM.x + 8 * STEP, y: FROM.y + 8 * STEP }),
        );
        shapeToolMode.release(pointer(FROM), null);
        const box = openParams();
        const before = boxTool.frameOf(box, N);
        const handle = boxHandlePoint(box, N, "e");

        shapeToolMode.press(pointer(handle), OFF_MAC);
        shapeToolMode.move(pointer({ x: handle.x + 2 * STEP, y: handle.y }));
        const fixed = openParams();
        // #439: the west side stays
        expect(boxHandlePoint(fixed, N, "w").x).toBeCloseTo(
            boxHandlePoint(box, N, "w").x,
            6,
        );

        key("keydown", { alt: true });
        const centered = boxTool.frameOf(openParams(), N);
        expect(centered.center.x).toBeCloseTo(before.center.x, 6);
        expect(centered.halfWidth).toBeGreaterThan(before.halfWidth);

        key("keyup", {});
        expect(openParams()).toEqual(fixed);
    });
});

/** A placed 3 × 3 box, 4 steps apart, around {@link FROM}; marchers 1..9 */
function placed(): PlacedBox<BoxParams> {
    const env = toolEnvFor(field());
    const params = drawBox(
        { x: FROM.x - 8 * STEP, y: FROM.y - 8 * STEP },
        { x: FROM.x + 8 * STEP, y: FROM.y + 8 * STEP },
        N,
        env,
    )!;
    const slots = boxShape.generate(params, N, shapeContextFor(field()));
    return {
        recipe: {
            id: 7,
            timelineId: 3,
            kind: "block",
            kindVersion: 1,
            params: { ...params, spots: N },
            orderMode: "nearest",
            reverse: false,
            members: slots.map((s, i) => ({
                marcherId: i + 1,
                slot: i,
                x: s.x,
                y: s.y,
            })),
        },
        kind: boxTool,
        params,
        spots: N,
        endBeat: 8,
    };
}

// Each case cancels before letting go, so nothing is saved: the drawn outline is the result
describe("a placed box's handles with Alt", () => {
    it.each(["e", "se"] as const)(
        "the %s handle resizes about the center, held or pressed mid-drag, and #439 without it",
        (at) => {
            const box = placed();
            const mode = new LiveBoxMode(box, new QueryClient());
            const handle = boxHandlePoint(box.params, N, at);
            const shown = () => mode.drawing()!.outline!;
            const center = boxCenter(box.params);
            mode.press(pointer(handle), OFF_MAC);
            const to = {
                x: handle.x + 2 * STEP,
                y: handle.y + (at === "se" ? 2 * STEP : 0),
            };
            mode.move(pointer(to));
            const fixed = shown();
            // The opposite side stays
            expect(Math.min(...xs(fixed))).toBeCloseTo(FROM.x - 8 * STEP, 6);

            key("keydown", { alt: true });
            const centered = shown();
            expect(middleOf(centered).x).toBeCloseTo(center.x, 6);
            expect(middleOf(centered).y).toBeCloseTo(center.y, 6);
            expect(Math.min(...xs(centered))).toBeLessThan(FROM.x - 8 * STEP);

            key("keyup", {});
            expect(shown()).toEqual(fixed);

            mode.move(pointer(to, { alt: true }));
            expect(middleOf(shown()).x).toBeCloseTo(center.x, 6);
            mode.cancel();
        },
    );
});
