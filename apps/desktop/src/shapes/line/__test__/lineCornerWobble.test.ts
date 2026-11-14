import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { FieldModePress, FieldPointer } from "@/field/editor/fieldEditor";
import { NO_KEYS } from "@/input/modifierRoles";
import * as platform from "@/shortcuts/platform";
import { setShapeField } from "../../field/shapeField";
import { shapeContextFor } from "../../field/shapeFieldContext";
import { moveLive, openLive, pressLive } from "../../placed/liveBox";
import type { PlacedBox } from "../../placed/placedBox";
import { shapeToolMode } from "../../tool/shapeToolMode";
import {
    closeShapeTool,
    openShapeTool,
    updateTool,
    useShapeToolStore,
} from "../../tool/shapeToolStore";
import { toolEnvFor } from "../../tool/toolEnv";
import {
    edit,
    openTool,
    slotsOf,
    type ToolState,
} from "../../tool/toolMachine";
import type { XY } from "../../types";
import { CORNER_STICK, type LineParams } from "../lineGeometry";
import { lineTool } from "../lineTool";

/**
 * A corner dragged front to back under ↔ (owner feedback on #596): "the split was exactly on a
 * marcher so I was expecting to, after setting the interval to 2 steps, be able to easily drag
 * that marcher up and down. But it was very limited." Side to side, the corner's spots where both
 * stretches' intervals are whole are one interval apart, and it took the one nearest the pointer
 * on every move, so a hand drifting an interval's half sideways flipped it a spot and handed its
 * marcher to the other stretch. It keeps its spot until the pointer is {@link CORNER_STICK} of the
 * way to another. Driven as the field drives the tool: its env, the college field, snap on.
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;
const OFF_MAC: FieldModePress = { reachesInside: () => false, isMac: false };
const field = () => ({
    fieldProperties,
    zoom: () => 1,
    marchers: () => [],
    drawn: () => new Map(),
});
const env = () => toolEnvFor(field(), undefined, { snapOn: true });
const ctx = () => shapeContextFor(field());
const pointer = (at: XY): FieldPointer => ({
    field: at,
    screen: at,
    button: 0,
    kind: "mouse",
    ...NO_KEYS,
});

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
    shapeToolMode.cancel();
    closeShapeTool();
    setShapeField(null);
    vi.restoreAllMocks();
});

const marchers = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    at: { x: 300 + i * 7, y: 300 },
    drillRank: i,
}));
const tool = () => useShapeToolStore.getState().tool!;
const paramsOf = (t: ToolState) => t.params as LineParams;
const params = () => paramsOf(tool());
const measured = lineTool.choices!.find((c) => c.key === "measured")!;
const interval = lineTool.params.find((p) => p.key === "interval")!;
const handle = (key: string) =>
    lineTool.handles(params(), tool().spots).find((h) => h.key === key)!.at;
const spots = () => slotsOf(tool(), ctx()).map(({ x, y }) => ({ x, y }));

const press = (at: XY) => shapeToolMode.press(pointer(at), OFF_MAC);
const move = (at: XY) => shapeToolMode.move(pointer(at));
const release = (at: XY, click: { double: boolean } | null = null) =>
    shapeToolMode.release(pointer(at), click as never);

/** Measured `axis`, as picked in the Measured menu */
const measuredBy = (axis: "x" | "y") =>
    updateTool((t) =>
        edit(t, measured.pick(t.params, t.spots, axis, env()), ctx()),
    );
/** The interval typed */
const typed = (text: string) =>
    updateTool((t) =>
        edit(t, interval.type(t.params, t.spots, text, env())!, ctx()),
    );
const locked = () =>
    updateTool((t) =>
        lineTool.lock!.locked(t.params, t.spots)
            ? t
            : edit(t, lineTool.lock!.toggle(t.params, t.spots, env()), ctx()),
    );

/**
 * 8 marchers on a line dragged 14 steps side to side (or front to back, `axis` "y"), measured that
 * way with 2 typed: the owner's line before the split
 */
function drawn(axis: "x" | "y"): XY {
    openShapeTool(openTool(lineTool, marchers), null, null);
    const from = env().gridSnap({ x: 30 * STEP, y: 20 * STEP });
    const to =
        axis === "x"
            ? { x: from.x + 14 * STEP, y: from.y }
            : { x: from.x, y: from.y + 14 * STEP };
    press(from);
    move(to);
    release(to);
    measuredBy(axis);
    typed("2");
    return from;
}

/** The segment's midpoint clicked: the line split on a marcher's spot */
function split() {
    const at = handle("m0");
    press(at);
    release(at, { double: false });
    expect(params().points).toHaveLength(3);
}

/**
 * Corner 1 dragged from `start` a quarter step at a time `steps` times along `way` (front to back
 * under ↔), drifting across it by up to `drift` steps as a hand does; the corner at each step
 */
function wobbled(start: XY, way: "x" | "y", steps: number, drift: number) {
    const seen: XY[] = [];
    for (let k = 1; k <= steps; k++) {
        const along = -k * STEP * 0.25;
        const side = drift * STEP * Math.sin(k * 1.7);
        move(
            way === "y"
                ? { x: start.x + side, y: start.y + along }
                : { x: start.x + along, y: start.y + side },
        );
        const { x, y } = params().points[1]!;
        seen.push({ x, y });
    }
    return seen;
}

/** Wobbles more than half the 2-step interval sideways: past halfway, short of three quarters */
const DRIFT = 1.2;

describe("a split corner dragged front to back under ↔", () => {
    for (const lock of [false, true]) {
        const how = lock ? "locked" : "unlocked";

        it(`keeps its spot side to side through a hand's wobble, ${how}`, () => {
            drawn("x");
            split();
            if (lock) locked();
            const corner = { ...params().points[1]! };
            const before = spots().map((s) => s.x);
            press(corner);
            const seen = wobbled(corner, "y", 40, DRIFT);
            // Side to side: where it was, on the marcher's spot
            for (const at of seen) expect(at.x).toBeCloseTo(corner.x, 6);
            // Front to back: it went all the way, 10 steps
            expect(corner.y - seen.at(-1)!.y).toBeCloseTo(10 * STEP, 6);
            // The other stretches' marchers don't move side to side, each 2 apart
            expect(spots().map((s) => s.x)).toEqual(
                before.map((x) => expect.closeTo(x, 6)),
            );
            expect(spots()[3]).toEqual({
                x: expect.closeTo(corner.x, 6),
                y: expect.closeTo(seen.at(-1)!.y, 6),
            });
            release(seen.at(-1)!);
        });

        it(`keeps its spot when the midpoint is press-dragged, ${how}`, () => {
            drawn("x");
            if (lock) locked();
            const at = handle("m0");
            press(at);
            const seen = wobbled(at, "y", 24, 0.4);
            const x = seen[0]!.x;
            for (const q of seen) expect(q.x).toBeCloseTo(x, 6);
            // The split put the corner on a marcher's spot, a step from the midpoint
            expect(Math.abs(x - at.x)).toBeCloseTo(STEP, 6);
            expect(at.y - seen.at(-1)!.y).toBeCloseTo(6 * STEP, 6);
        });

        it(`moves a spot side to side once dragged most of the way there, ${how}`, () => {
            drawn("x");
            split();
            if (lock) locked();
            const corner = { ...params().points[1]! };
            press(corner);
            const up = corner.y - 4 * STEP;
            move({ x: corner.x + 1.2 * STEP, y: up });
            expect(params().points[1]!.x).toBeCloseTo(corner.x, 6);
            move({ x: corner.x + 2 * CORNER_STICK * STEP + 0.1, y: up });
            expect(params().points[1]!.x).toBeCloseTo(corner.x + 2 * STEP, 6);
        });

        it(`split first, then ↔ and 2 typed, keeps its spot too, ${how}`, () => {
            openShapeTool(openTool(lineTool, marchers), null, null);
            const from = env().gridSnap({ x: 30 * STEP, y: 20 * STEP });
            press(from);
            move({ x: from.x + 14 * STEP, y: from.y });
            release({ x: from.x + 14 * STEP, y: from.y });
            split();
            measuredBy("x");
            typed("2");
            if (lock) locked();
            const corner = { ...params().points[1]! };
            press(corner);
            for (const at of wobbled(corner, "y", 40, DRIFT))
                expect(at.x).toBeCloseTo(corner.x, 6);
        });

        it(`placed, keeps its spot side to side, ${how}`, () => {
            drawn("x");
            split();
            if (lock) locked();
            const placed = structuredClone(params());
            const corner = placed.points[1]!;
            const box = {
                recipe: { id: 1 },
                kind: lineTool,
                params: placed,
                spots: 8,
                endBeat: 0,
            } as unknown as PlacedBox;
            let live = pressLive(openLive(box), corner, env())!;
            expect(live.gesture).toMatchObject({ type: "handle", key: "p1" });
            for (let k = 1; k <= 40; k++) {
                live = moveLive(
                    live,
                    {
                        x: corner.x + DRIFT * STEP * Math.sin(k * 1.7),
                        y: corner.y - k * STEP * 0.25,
                    },
                    env(),
                );
                expect((live.params as LineParams).points[1]!.x).toBeCloseTo(
                    corner.x,
                    6,
                );
            }
        });
    }
});

describe("a split corner dragged side to side under ↕", () => {
    for (const lock of [false, true])
        it(`keeps its spot front to back through a hand's wobble, ${lock ? "locked" : "unlocked"}`, () => {
            drawn("y");
            split();
            if (lock) locked();
            const corner = { ...params().points[1]! };
            const before = spots().map((s) => s.y);
            press(corner);
            const seen = wobbled(corner, "x", 40, DRIFT);
            for (const at of seen) expect(at.y).toBeCloseTo(corner.y, 6);
            expect(corner.x - seen.at(-1)!.x).toBeCloseTo(10 * STEP, 6);
            expect(spots().map((s) => s.y)).toEqual(
                before.map((y) => expect.closeTo(y, 6)),
            );
        });
});
