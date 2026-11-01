// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_FIELD_THEME } from "@openmarch/core";
import type { DrawnItemOutline } from "../fieldItems";
import {
    DIMMED_ITEM_ALPHA,
    ITEM_FILL_ALPHA,
    ITEM_STROKE_WIDTH,
    planItems,
    SELECTED_ITEM_STROKE_WIDTH,
} from "../itemsPlan";
import { SELECTION_RGBA01 } from "../selectionRing";

const square = (id: number, closed = true): DrawnItemOutline => ({
    id,
    points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
    ],
    closed,
    center: { x: 5, y: 5 },
    geometry: {
        outlineType: "rectangle",
        width: 1,
        depth: 1,
        height: 0,
        rotation: 0,
        customOutline: null,
        rollsOut: false,
        leadingEdge: null,
        progress: 1,
    },
});

const options = {
    theme: DEFAULT_FIELD_THEME,
    selected: new Set<number>(),
    isDimmed: () => false,
};

describe("planItems", () => {
    it("fills an Outline faintly and closes its line", () => {
        const plan = planItems([square(1)], options);
        expect(plan.fills).toHaveLength(1);
        expect(plan.fills[0].color[3]).toBeCloseTo(
            (DEFAULT_FIELD_THEME.primaryStroke.a ?? 1) * ITEM_FILL_ALPHA,
        );
        const [stroke] = plan.strokes;
        expect(stroke.points).toHaveLength(5);
        expect(stroke.points.at(-1)).toEqual(stroke.points[0]);
        expect(stroke.width).toBe(ITEM_STROKE_WIDTH);
    });

    it("leaves an open freehand line open", () => {
        expect(
            planItems([square(1, false)], options).strokes[0].points,
        ).toHaveLength(4);
    });

    it("outlines a selected item in the selection color, thicker", () => {
        const [stroke] = planItems([square(1)], {
            ...options,
            selected: new Set([1]),
        }).strokes;
        expect(stroke.color).toEqual(SELECTION_RGBA01);
        expect(stroke.width).toBe(SELECTED_ITEM_STROKE_WIDTH);
    });

    it("fades a dimmed item", () => {
        const plain = planItems([square(1)], options);
        const dimmed = planItems([square(1)], {
            ...options,
            isDimmed: () => true,
        });
        expect(dimmed.strokes[0].color[3]).toBeCloseTo(
            plain.strokes[0].color[3] * DIMMED_ITEM_ALPHA,
        );
    });
});
