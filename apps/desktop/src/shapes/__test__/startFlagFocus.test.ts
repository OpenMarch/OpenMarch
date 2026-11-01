import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    createResolver,
    type Resolver,
    type TimelineSnapshot,
} from "@openmarch/core";
import type Marcher from "@/global/classes/Marcher";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { boxTool } from "../box/boxTool";
import { marchersOnField } from "../field/shapeFieldContext";
import type { ShapeField } from "../field/shapeField";
import {
    openTool,
    pointerMove,
    press,
    release,
    startsOf,
    targetsOf,
    type ToolState,
} from "../tool/toolMachine";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import { rowTool } from "./fakeRowKind";
import type { ShapeContext, XY } from "../types";

/**
 * The open shape is measured from the start flag (#346, spec #344 "Measuring from the start
 * flag"): its hollow rings, its walks and least travel start where each marcher stands at the
 * start flag, not where they stand at the playhead. Expert's start flag is where it is put;
 * Basic's is the start of the page holding the playhead; at home both are beat 0, the home spots.
 * Run with the box and a fake test kind, so the rule is the host's, not one kind's.
 */

/**
 * Marcher 1 walks from (0, 0) to (100, 0) and marcher 2 from (100, 0) to (0, 0), both over
 * beats [1, 17): they pass each other at beat 9, so who is on the left depends on the beat.
 */
const snapshot = (): TimelineSnapshot => ({
    marchers: [
        { id: 1, home: [0, 0] },
        { id: 2, home: [100, 0] },
    ],
    shapes: {},
    transitions: {
        1: move(1, [100, 0]),
        2: move(2, [0, 0]),
    },
    assignments: [1, 2].map((id) => ({
        id,
        marcher: id,
        transition: id,
        slot: 0,
        start: 1,
        end: 17,
        layer: 0,
    })),
});

function move(id: number, to: [number, number]) {
    return {
        id,
        start: 1,
        end: 17,
        dest: null,
        points: [to],
        slots: 1,
        style: "direct" as const,
        order: "slot" as const,
        params: null,
    };
}

/** Pages [1, 7) and [7, 17) */
const BOXES = [
    { start: 1, end: 7 },
    { start: 7, end: 17 },
];
const PLAYHEAD = 13;

const marcher = (id: number) =>
    ({
        id,
        section: "Trumpet",
        drill_prefix: "T",
        drill_order: id,
    }) as unknown as Marcher;

/** The field as the shape tool reads it: every marcher drawn where the resolver has it at P */
const fieldAt = (resolver: Resolver, beat: number): ShapeField =>
    ({
        fieldProperties: { pixelsPerStep: STEP },
        zoom: () => 1,
        marchers: () => [marcher(1), marcher(2)],
        drawn: (ids: readonly number[]) =>
            new Map(
                ids.map((id) => {
                    const [x, y] = resolver.positionAt(id, beat);
                    return [id, { x, y }];
                }),
            ),
    }) as unknown as ShapeField;

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
};
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };

/** Opens `kind` on both marchers and draws it below them, left to right: two spots */
function drawShape(kind: AnyToolKind, field: ShapeField): ToolState {
    let tool = openTool(kind, marchersOnField(field, [1, 2]));
    tool = press(tool, { x: 0, y: 200 }, env);
    tool = pointerMove(tool, { x: 100, y: 210 }, env);
    return release(tool, ctx);
}

const near = (a: XY, b: XY) =>
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);

/** Each marcher's walk to their spot, by id */
const walksById = (tool: ToolState) =>
    new Map(targetsOf(tool, ctx).map((t) => [t.id, t]));

/** Who gets the left spot */
const onTheLeft = (tool: ToolState) => {
    const targets = targetsOf(tool, ctx);
    return [...targets].sort((a, b) => a.to.x - b.to.x)[0]!.id;
};

const selection = () => useTimelineSelectionStore.getState();

describe.each<[string, AnyToolKind]>([
    ["the box", boxTool],
    ["a fake test kind", rowTool],
])("the open shape measures from the start flag (#346), with %s", (_, kind) => {
    let resolver: Resolver;
    const at = (id: number, beat: number): XY => {
        const [x, y] = resolver.positionAt(id, beat);
        return { x, y };
    };

    beforeEach(() => {
        resolver = createResolver(snapshot());
        useTimelineResolverStore.setState({ resolver });
        selection().reset();
        selection().setPageBoxes(BOXES);
    });
    afterEach(() => {
        selection().reset();
        useTimelineResolverStore.setState({ resolver: null });
        useEditorModeStore.setState({ mode: "expert" });
    });

    it("the setup: marcher 1 is on the left before beat 9 and on the right after it", () => {
        expect(at(1, 3).x).toBeLessThan(at(2, 3).x);
        expect(at(1, 7).x).toBeLessThan(at(2, 7).x);
        expect(at(1, PLAYHEAD).x).toBeGreaterThan(at(2, PLAYHEAD).x);
    });

    it("Expert: rings, walks and least travel start at the start flag", () => {
        useEditorModeStore.setState({ mode: "expert" });
        selection().setStartStays(true);
        // The start flag at beat 3, inside the page before the playhead's
        selection().selectRange(3, PLAYHEAD);
        expect(selection().selection).toEqual({
            kind: "range",
            start: 3,
            end: PLAYHEAD,
        });
        const tool = drawShape(kind, fieldAt(resolver, PLAYHEAD));

        const rings = startsOf(tool);
        near(rings[0]!, at(1, 3));
        near(rings[1]!, at(2, 3));
        const walks = walksById(tool);
        near(walks.get(1)!.from, at(1, 3));
        near(walks.get(2)!.from, at(2, 3));
        // From the start flag marcher 1 is on the left, so least travel keeps them there; from
        // the playhead they would swap
        expect(onTheLeft(tool)).toBe(1);
    });

    it("Basic: measures from the start of the page holding the playhead", () => {
        useEditorModeStore.setState({ mode: "basic" });
        selection().setStartStays(false);
        selection().seek(PLAYHEAD);
        expect(selection().selection).toEqual({
            kind: "range",
            start: 7,
            end: PLAYHEAD,
        });
        const tool = drawShape(kind, fieldAt(resolver, PLAYHEAD));

        const rings = startsOf(tool);
        near(rings[0]!, at(1, 7));
        near(rings[1]!, at(2, 7));
        const walks = walksById(tool);
        near(walks.get(1)!.from, at(1, 7));
        near(walks.get(2)!.from, at(2, 7));
        expect(onTheLeft(tool)).toBe(1);
    });

    it("at home: measures from the home spots", () => {
        selection().setStartStays(true);
        selection().selectHome();
        expect(selection().selection).toEqual({ kind: "home" });
        const tool = drawShape(kind, fieldAt(resolver, 0));

        const rings = startsOf(tool);
        near(rings[0]!, { x: 0, y: 0 });
        near(rings[1]!, { x: 100, y: 0 });
        const walks = walksById(tool);
        near(walks.get(1)!.from, { x: 0, y: 0 });
        near(walks.get(2)!.from, { x: 100, y: 0 });
        expect(onTheLeft(tool)).toBe(1);
    });

    it("rings stand where marchers are while the drag still draws the shape", () => {
        selection().setStartStays(true);
        selection().selectRange(3, PLAYHEAD);
        let tool = openTool(
            kind,
            marchersOnField(fieldAt(resolver, PLAYHEAD), [1, 2]),
        );
        tool = press(tool, { x: 0, y: 200 }, env);
        tool = pointerMove(tool, { x: 100, y: 210 }, env);
        expect(tool.gesture?.type).toBe("draw");
        const rings = startsOf(tool);
        near(rings[0]!, at(1, 3));
        near(rings[1]!, at(2, 3));
    });
});
