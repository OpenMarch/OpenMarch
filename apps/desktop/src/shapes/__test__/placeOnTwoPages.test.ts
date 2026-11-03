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
import { timelinesWithRange } from "@/db-functions/timelines";
import {
    readAllShapeRecipes,
    type ShapeRecipeMember,
    type ShapeRecipeRecord,
} from "@/db-functions/shapeRecipes";
import { writePlacement } from "../tool/shapePlacement";

/**
 * The same box placed on page 1 and then on page 2 (#485's e2e). On page 2 its members go to where
 * page 1 left them, which on its own would be a drag back that takes them out of page 2's shared
 * move (holds decision 16); a shape's write sets them there instead, so each page keeps a recipe.
 * On the `marchersAndPages` show page N's box is `[8N − 7, 8N + 1)`.
 */

afterEach(() => stopTimelineResolver());

const BOX: ShapeRecipeRecord = {
    kind: "box",
    kindVersion: 1,
    params: { pivot: "c", spots: 3 },
    orderMode: "nearest",
    reverse: false,
};

/** An Expert edit window over `[start, end)`, as `planCanvasEdit` returns it */
const plan = (start: number, end: number): CanvasEditPlan => ({
    ok: true,
    target: { kind: "range", start, end },
    beat: end,
});

describeDbTests("a box placed on a page and again on the next one", (it) => {
    it("keeps a recipe in each page's move", async ({
        db,
        marchersAndPages: _,
    }) => {
        await startTimelineResolver(db);
        const ids = useTimelineResolverStore
            .getState()
            .resolver!.marcherIds()
            .slice(0, 3);
        const members: ShapeRecipeMember[] = ids.map((marcherId, i) => ({
            marcherId,
            slot: i,
            x: 100 + 20 * i,
            y: 50,
        }));
        const place = async (start: number, end: number) => {
            expect(
                await writePlacement(
                    { recipe: BOX, members },
                    new QueryClient(),
                    "Error placing the shape",
                    plan(start, end),
                ),
            ).toBe(true);
            await timelineResolverSettled();
        };
        const moveOver = async (start: number, end: number) =>
            (await timelinesWithRange(db, { start, end }))[0]!.id;

        await place(1, 9);
        await place(9, 17);

        expect(
            (await readAllShapeRecipes(db)).map((r) => r.timelineId),
        ).toEqual([await moveOver(1, 9), await moveOver(9, 17)]);
    });
});
