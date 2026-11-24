// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_FIELD_THEME } from "@openmarch/core";
import type { DrawnItemOutline } from "../fieldItems";
import {
    DIMMED_ITEM_ALPHA,
    COLORED_ITEM_FILL_ALPHA,
    EQUIPMENT_DETAIL_PX_PER_M,
    EQUIPMENT_FILL_ALPHA,
    ITEM_FILL_ALPHA,
    ITEM_STROKE_WIDTH,
    planItems,
    SELECTED_ITEM_STROKE_WIDTH,
} from "../itemsPlan";
import { playingSpotOf } from "@/view3d/core/pit/playingSpot";
import { SELECTION_RGBA01 } from "../selectionRing";
import { PIXELS_PER_METER } from "@/items/itemOutlines";
import { placePitPlan } from "@/view3d/core/pit/pitPlan";

const square = (
    id: number,
    closed = true,
    color: DrawnItemOutline["color"] = null,
): DrawnItemOutline => ({
    id,
    color,
    points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
    ],
    closed,
    locked: false,
    playingSpot: null,
    plan: null,
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

    it("fills a colored prop with its color and keeps the theme's line", () => {
        const red = { r: 220, g: 38, b: 38, a: 1 };
        const plan = planItems([square(1, true, red)], options);
        const [r, g, b, a] = plan.fills[0].color;
        expect([r, g, b]).toEqual([220 / 255, 38 / 255, 38 / 255]);
        expect(a).toBeCloseTo(COLORED_ITEM_FILL_ALPHA);
        const line = DEFAULT_FIELD_THEME.primaryStroke;
        expect(plan.strokes[0].color.slice(0, 3)).toEqual([
            line.r / 255,
            line.g / 255,
            line.b / 255,
        ]);
    });

    it("dims a colored prop like the others", () => {
        const red = { r: 220, g: 38, b: 38, a: 1 };
        const plan = planItems([square(1, true, red)], {
            ...options,
            isDimmed: () => true,
        });
        expect(plan.fills[0].color[3]).toBeCloseTo(
            COLORED_ITEM_FILL_ALPHA * DIMMED_ITEM_ALPHA,
        );
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

describe("planItems for the front ensemble", () => {
    const zoom = 2;
    const withZoom = { ...options, zoom };

    it("draws nothing for a pit instrument's playing spot", () => {
        const spot = playingSpotOf("pit/marimba-5.0", {
            center: { x: 5, y: 5 },
            depth: 1,
            rotation: 0,
        });
        const plain = planItems([square(1)], withZoom);
        const plan = planItems([{ ...square(1), playingSpot: spot }], withZoom);
        expect(plan.strokes).toEqual(plain.strokes);
        expect(plan.fills).toEqual(plain.fills);
    });

    describe("equipment drawn from its model", () => {
        // Two outlines (a drum set's pieces) and two edges inside them
        const plan = placePitPlan(
            {
                outline: [
                    [-500, -300, 500, -300, 500, 300, -500, 300],
                    [600, 0, 800, 0, 700, 200],
                ],
                details: [
                    [-500, 0, 500, 0],
                    [0, -300, 0, 300],
                ],
            },
            { x: 5, y: 5 },
            0,
            PIXELS_PER_METER,
        );
        const equipment = { ...square(1), plan };
        const detailZoom = EQUIPMENT_DETAIL_PX_PER_M / PIXELS_PER_METER;

        it("fills and outlines its silhouette instead of its Outline", () => {
            const drawn = planItems([equipment], { ...options, zoom: 0.5 });
            expect(drawn.fills.map((f) => f.points)).toEqual(plan.outlines);
            expect(drawn.fills[0].color[3]).toBeCloseTo(EQUIPMENT_FILL_ALPHA);
            expect(drawn.strokes).toHaveLength(2);
            expect(drawn.strokes[0].points.at(-1)).toEqual(
                drawn.strokes[0].points[0],
            );
        });

        it("shows its edges and facing mark only once zoomed in enough", () => {
            const far = planItems([equipment], {
                ...options,
                zoom: detailZoom * 0.9,
            });
            const near = planItems([equipment], {
                ...options,
                zoom: detailZoom * 1.1,
            });
            expect(far.strokes).toHaveLength(2);
            expect(near.strokes).toHaveLength(4);
            // The edges go under the silhouette's line
            expect(near.strokes[0].points).toEqual(plan.details[0]);
            // The facing mark: a triangle past the front edge (y = 5 + 0.3 m), toward the audience
            expect(near.fills).toHaveLength(far.fills.length + 1);
            const mark = near.fills.at(-1)!.points;
            expect(mark).toHaveLength(3);
            const front = 5 + 0.3 * PIXELS_PER_METER;
            for (const p of mark) expect(p.y).toBeGreaterThan(front);
        });

        it("outlines a selected one in the selection color", () => {
            const drawn = planItems([equipment], {
                ...options,
                selected: new Set([1]),
            });
            expect(drawn.strokes[0].width).toBe(SELECTED_ITEM_STROKE_WIDTH);
        });

        it("draws locked equipment as it draws unlocked equipment: no padlock", () => {
            const unlocked = planItems([equipment], options);
            const locked = planItems([{ ...equipment, locked: true }], options);
            expect(locked).toEqual(unlocked);
        });
    });
});
