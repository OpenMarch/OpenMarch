// @vitest-environment node
import { describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { FieldProperties } from "@openmarch/core";
import type { TimelinePath } from "@/timeline/timelinePaths";
import type { FocusScene } from "@/timeline/timelineFocusScene";
import {
    collisionsView,
    ENDPOINT_RADIUS,
    FOCUS,
    hexRgba,
    MIDPOINT_RADIUS,
    PATHWAY_WIDTH,
    planCollisionOverlay,
    planFocusOverlay,
    planPathOverlay,
    rgbaOf,
} from "../timelineOverlays";

const template =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;
const fieldProperties = new FieldProperties({
    ...template,
    stepSizeWarningThresholdInches: 30,
});
const theme = fieldProperties.theme;
/** Field units per count that is 22.5 in a step (8 to 5) on this field */
const eightToFive = fieldProperties.pixelsPerStep;

/** A straight path from `start` to `end` whose fastest stretch covers `stride` units a count. */
function path(
    start: { x: number; y: number },
    end: { x: number; y: number },
    stride: number,
): TimelinePath {
    return {
        points: [start, end],
        start,
        end,
        midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        length: Math.hypot(end.x - start.x, end.y - start.y),
        stride,
    };
}

const base = {
    marcherIds: [1, 2],
    nextPaths: new Map<number, TimelinePath>(),
    nextPathsEnabled: true,
    stepSizeWarningsEnabled: true,
    fieldProperties,
};

describe("planPathOverlay", () => {
    const out = path({ x: 80, y: 0 }, { x: 80, y: 40 }, eightToFive);

    it("draws the next path in its theme color, with a white midpoint and a filled endpoint", () => {
        const plan = planPathOverlay({
            ...base,
            nextPaths: new Map([[1, out]]),
        });
        expect(plan.units).toBe("field");
        expect(plan.strokes).toEqual([
            {
                points: out.points,
                color: rgbaOf(theme.nextPath),
                width: PATHWAY_WIDTH,
                dash: null,
                round: false,
            },
        ]);
        expect(plan.dots).toEqual([
            {
                x: 80,
                y: 20,
                radius: MIDPOINT_RADIUS,
                fill: [1, 1, 1, 1],
                stroke: rgbaOf(theme.nextPath),
                strokeWidth: 2,
            },
            // The move out: its endpoint is where it ends
            {
                x: 80,
                y: 40,
                radius: ENDPOINT_RADIUS,
                fill: rgbaOf(theme.nextPath),
                stroke: null,
                strokeWidth: 0,
            },
        ]);
    });

    it("draws a path over the step-size threshold dashed, thicker and red, with its endpoint in the theme color", () => {
        const fast = path({ x: 0, y: 0 }, { x: 160, y: 0 }, eightToFive * 4);
        const plan = planPathOverlay({
            ...base,
            nextPaths: new Map([[2, fast]]),
        });
        expect(plan.strokes).toHaveLength(1);
        expect(plan.strokes[0]).toMatchObject({
            color: [220 / 255, 38 / 255, 38 / 255, 1],
            width: 3,
            dash: [5, 3],
        });
        expect(plan.dots[0]!.stroke).toEqual(plan.strokes[0]!.color);
        expect(plan.dots[1]!.fill).toEqual(rgbaOf(theme.nextPath));
    });

    it("shows a next path over the threshold with its toggle off", () => {
        const fast = path({ x: 0, y: 0 }, { x: 160, y: 0 }, eightToFive * 4);
        const plan = planPathOverlay({
            ...base,
            nextPathsEnabled: false,
            nextPaths: new Map([[2, fast]]),
        });
        expect(plan.strokes).toHaveLength(1);
        expect(plan.strokes[0]!.dash).toEqual([5, 3]);
    });

    it("draws nothing for a side whose toggle is off and isn't over the threshold", () => {
        const plan = planPathOverlay({
            ...base,
            nextPathsEnabled: false,
            nextPaths: new Map([[1, out]]),
        });
        expect(plan.strokes).toEqual([]);
        expect(plan.dots).toEqual([]);
    });

    it("without warnings, draws a fast path in its theme color, and only when toggled on", () => {
        const fast = path({ x: 0, y: 0 }, { x: 160, y: 0 }, eightToFive * 4);
        const on = planPathOverlay({
            ...base,
            stepSizeWarningsEnabled: false,
            nextPaths: new Map([[1, fast]]),
        });
        expect(on.strokes[0]).toMatchObject({
            color: rgbaOf(theme.nextPath),
            dash: null,
        });
        const off = planPathOverlay({
            ...base,
            stepSizeWarningsEnabled: false,
            nextPathsEnabled: false,
            nextPaths: new Map([[1, fast]]),
        });
        expect(off.strokes).toEqual([]);
    });
});

describe("planFocusOverlay", () => {
    const scene: FocusScene = {
        timelineId: 1,
        color: "#2fc4b2",
        slots: [
            {
                marcherId: 1,
                origin: { x: 0, y: 0 },
                performed: [
                    [
                        { x: 0, y: 0 },
                        { x: 10, y: 0 },
                    ],
                ],
                ghosts: [
                    [
                        { x: 10, y: 0 },
                        { x: 20, y: 0 },
                    ],
                ],
                destination: null,
                ghostEnd: { x: 20, y: 0 },
                forks: [{ x: 10, y: 0, color: "#e79b00" }],
                holds: false,
            },
            {
                marcherId: 2,
                origin: { x: 50, y: 50 },
                performed: [],
                ghosts: [],
                destination: { x: 50, y: 50 },
                ghostEnd: null,
                forks: [],
                holds: true,
            },
        ],
        context: [
            {
                marcherId: 1,
                color: "#e79b00",
                points: [
                    { x: 10, y: 0 },
                    { x: 10, y: 30 },
                ],
            },
        ],
    };
    const gray = "#6f6f6f";

    it("draws context, ghosts and performed paths in screen pixels, then the dots", () => {
        const plan = planFocusOverlay(scene, gray, null);
        expect(plan.units).toBe("screen");
        expect(plan.strokes.map((s) => [s.color, s.width, s.dash])).toEqual([
            [hexRgba("#e79b00", FOCUS.contextAlpha), 1.5, null],
            [hexRgba(gray), 1.5, [2, 4]],
            [hexRgba("#2fc4b2"), 2, null],
        ]);
        expect(plan.strokes.every((s) => s.round)).toBe(true);
        expect(
            plan.dots.map((d) => [d.x, d.y, d.radius, d.fill, d.stroke]),
        ).toEqual([
            // Where the context move ends
            [10, 30, 3, hexRgba("#e79b00"), null],
            // Member 1: start ring, ghost end, fork
            [0, 0, 3, null, hexRgba("#2fc4b2")],
            [20, 0, 4, hexRgba(gray, 0.45), hexRgba(gray)],
            [10, 0, 3.5, hexRgba("#e79b00"), null],
            // Member 2 holds still: only a quiet ring, no destination
            [50, 50, 3, null, hexRgba("#2fc4b2", 0.4)],
        ]);
    });

    it("steps back the members that aren't selected", () => {
        const plan = planFocusOverlay(scene, gray, new Set([2]));
        // Member 1's performed path, at a quarter strength
        expect(plan.strokes[2]!.color[3]).toBeCloseTo(0.25);
        expect(plan.strokes[0]!.color[3]).toBeCloseTo(0.6 * 0.25);
        // Member 2's ring keeps its hold strength
        expect(plan.dots[plan.dots.length - 1]!.stroke![3]).toBeCloseTo(0.4);
    });
});

describe("hexRgba", () => {
    it("reads #rrggbb, and falls back to gray", () => {
        expect(hexRgba("#ff8000", 0.5)).toEqual([1, 128 / 255, 0, 0.5]);
        expect(hexRgba("red")).toEqual([0.5, 0.5, 0.5, 1]);
    });
});

describe("collisions", () => {
    const collisions = [
        {
            marcher1Id: 1,
            marcher2Id: 2,
            label: "A1,A2",
            x: 100,
            y: 200,
            distance: 4,
        },
        {
            marcher1Id: 3,
            marcher2Id: 4,
            label: "B1,B2",
            x: 300,
            y: 260,
            distance: 6,
        },
    ];

    it("draws a red disc as wide as the pair is apart, and their labels above it", () => {
        const plan = planCollisionOverlay(collisions);
        expect(plan.dots[0]).toEqual({
            x: 100,
            y: 200,
            radius: 4,
            fill: [1, 0, 0, 0.5],
            stroke: [1, 0, 0, 1],
            strokeWidth: 2,
        });
        expect(plan.labels[1]).toEqual({
            text: "B1,B2",
            x: 300,
            y: 260 - 12 - 3,
            size: 12,
            color: [1, 0, 0, 1],
        });
    });

    it("frames the markers and their labels for zoom to collisions", () => {
        // Bounds: x 96..306, y from the first label (200 - 12 - 2 = 186) to 266
        const view = collisionsView(collisions, 1000, 600)!;
        const w = 306 - 96 + 200;
        const h = 266 - 186 + 200;
        const zoom = Math.min(1000 / w, 600 / h, 1.5) * 0.7;
        expect(view.zoom).toBeCloseTo(zoom);
        expect(view.panX).toBeCloseTo(500 - ((96 + 306) / 2) * zoom);
        expect(view.panY).toBeCloseTo(300 - ((186 + 266) / 2) * zoom);
    });

    it("never zooms in past 1.5 × 0.7", () => {
        const view = collisionsView([collisions[0]!], 4000, 4000)!;
        expect(view.zoom).toBeCloseTo(1.05);
    });

    it("does nothing with no collisions or no size", () => {
        expect(collisionsView([], 800, 600)).toBeNull();
        expect(collisionsView(collisions, 0, 600)).toBeNull();
    });
});
