// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PIT_MANIFEST } from "../pitModels";
import {
    loadPitPlans,
    pitPlanOf,
    placePitPlan,
    type PitPlan,
} from "../pitPlan";

// A 2 × 1 m box, front edge at z = +500 mm, with one edge across its middle
const box: PitPlan = {
    outline: [[-1000, -500, 1000, -500, 1000, 500, -1000, 500]],
    details: [[-1000, 0, 1000, 0]],
};

describe("placePitPlan", () => {
    it("places the model at the item, in field units", () => {
        const placed = placePitPlan(box, { x: 100, y: 200 }, 0, 10);
        expect(placed.outlines[0]).toEqual([
            { x: 90, y: 195 },
            { x: 110, y: 195 },
            { x: 110, y: 205 },
            { x: 90, y: 205 },
        ]);
        expect(placed.details[0]).toEqual([
            { x: 90, y: 200 },
            { x: 110, y: 200 },
        ]);
        // The front edge's middle, toward the audience (+y)
        expect(placed.front).toEqual({ x: 100, y: 205 });
    });

    it("turns as the field turns an Outline", () => {
        const placed = placePitPlan(box, { x: 0, y: 0 }, 90, 10);
        // Turned a quarter: the front faces -x, as placeOutline turns (x, y) to (-y, x)
        expect(placed.front.x).toBeCloseTo(-5);
        expect(placed.front.y).toBeCloseTo(0);
        expect(placed.rotation).toBe(90);
    });
});

describe("pitPlanOf", () => {
    it("has nothing for an item without a built-in model", async () => {
        await loadPitPlans();
        expect(pitPlanOf(null)).toBeNull();
        expect(pitPlanOf("pit/no-such-model")).toBeNull();
        expect(pitPlanOf("library:abc")).toBeNull();
    });

    it("has a plan for every built-in model (rerun pit-plan.mjs after changing them)", async () => {
        await loadPitPlans();
        for (const name of Object.keys(PIT_MANIFEST)) {
            const plan = pitPlanOf(`pit/${name}`);
            expect(plan, name).not.toBeNull();
            expect(plan!.outline.length, name).toBeGreaterThan(0);
            // Every outline is a closed polygon of x, z pairs
            for (const ring of plan!.outline) {
                expect(ring.length % 2, name).toBe(0);
                expect(ring.length / 2, name).toBeGreaterThanOrEqual(3);
            }
        }
    });

    it("draws a model as big as its footprint", async () => {
        await loadPitPlans();
        const plan = pitPlanOf("pit/marimba-5.0")!;
        const xs = plan.outline.flatMap((ring) =>
            ring.filter((_, i) => i % 2 === 0),
        );
        const { width } = PIT_MANIFEST["marimba-5.0"].high.sizeM;
        // Within a centimeter or two of the manifest's width (the outline is traced on a 5 mm grid)
        expect((Math.max(...xs) - Math.min(...xs)) / 1000).toBeCloseTo(
            width,
            1,
        );
    });
});
