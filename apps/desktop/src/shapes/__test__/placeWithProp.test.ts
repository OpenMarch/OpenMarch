import { afterEach, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { describeDbTests } from "@/test/base";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import type { CanvasEditPlan } from "@/timeline/timelineCoordinateWrites";
import {
    readAllShapeRecipes,
    type ShapeRecipeMember,
    type ShapeRecipeRecord,
} from "@/db-functions/shapeRecipes";
import { createItems } from "@/db-functions/items";
import { writePlacement } from "../tool/shapePlacement";

/**
 * A prop is a marcher with a size and a rotation (props epic, fork #1239): a shape placed over
 * marchers and a prop gives the prop a spot like any marcher, and it stands there at the end of
 * the move. On the `marchersAndPages` show page 1's box is `[1, 9)`.
 */

afterEach(() => stopTimelineResolver());

const BOX: ShapeRecipeRecord = {
    kind: "box",
    kindVersion: 1,
    params: { pivot: "c", spots: 3 },
    orderMode: "nearest",
    reverse: false,
};

const PAGE_ONE: CanvasEditPlan = {
    ok: true,
    target: { kind: "range", start: 1, end: 9 },
    beat: 9,
};

describeDbTests("a shape placed over marchers and a prop", (it) => {
    it("gives the prop a spot and moves it there", async ({
        db,
        marchersAndPages: _,
    }) => {
        const [prop] = await createItems({
            db,
            newItems: [
                {
                    kind: "prop",
                    name: "Box",
                    surfaceType: "obstacle",
                    home: [40, 40],
                    beatId: 1,
                    geometry: {
                        outlineType: "rectangle",
                        width: 1,
                        depth: 1,
                        height: 1,
                    },
                },
            ],
        });
        const propId = prop!.marcher_id;
        await startTimelineResolver(db);
        const resolver = () => useTimelineResolverStore.getState().resolver!;
        expect(resolver().marcherIds()).toContain(propId);
        const marchers = resolver()
            .marcherIds()
            .filter((id) => id !== propId)
            .slice(0, 2);
        const members: ShapeRecipeMember[] = [...marchers, propId].map(
            (marcherId, i) => ({ marcherId, slot: i, x: 100 + 20 * i, y: 50 }),
        );

        expect(
            await writePlacement(
                { recipe: BOX, members },
                new QueryClient(),
                "Error placing the shape",
                PAGE_ONE,
            ),
        ).toBe(true);
        await timelineResolverSettled();

        const [recipe] = await readAllShapeRecipes(db);
        expect(recipe!.members.map((m) => m.marcherId)).toContain(propId);
        const [x, y] = resolver().positionAt(propId, 9);
        expect(x).toBeCloseTo(140, 6);
        expect(y).toBeCloseTo(50, 6);
    });
});
