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
import { readBasicRows } from "@/db-functions/basicRows";
import { timelinesWithRange } from "@/db-functions/timelines";
import {
    readAllShapeRecipes,
    type ShapeRecipeMember,
    type ShapeRecipeRecord,
} from "@/db-functions/shapeRecipes";
import { writePlacement } from "../tool/shapePlacement";

/**
 * `placeOnTwoPages.test.ts` (#485) in **Basic** (Basic drift audit, 2026-11-18): the same box
 * placed on page 1 and then on page 2 of a converted show, each at the page's flag. On page 2 its
 * members go to where page 1 left them. Expert's range writer sets them there, in page 2's shared
 * move, so each page keeps a recipe (`ownPageMoves`, `keepUnchanged`). Basic's point writer still
 * reads it as a drag back (`planPoint` in `timelinePointMoves.ts`: "Back onto where the move
 * starts: the point goes") and takes every member out of page 2's move.
 *
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

/** Basic's edit on the flag of the page box `[start, end)`, as `planCanvasEdit` returns it */
const plan = (start: number, end: number): CanvasEditPlan => ({
    ok: true,
    target: { kind: "point", beat: end, box: { start, end } },
    beat: end,
});

describeDbTests(
    "a box placed on a page and again on the next one, in Basic",
    (it) => {
        // BUG 5: page 2 gets no recipe, and its members lose their rows over page 2, so the page
        // the designer just placed the shape on is Not defined for them and follows page 1.
        it.fails(
            "BUG 5: keeps a recipe in each page's move, and the members' rows on page 2",
            async ({ db, marchersAndPages: _ }) => {
                await startTimelineResolver(db);
                const ids = useTimelineResolverStore
                    .getState()
                    .resolver!.marcherIds()
                    .slice(0, 3);
                const members: ShapeRecipeMember[] = ids.map(
                    (marcherId, i) => ({
                        marcherId,
                        slot: i,
                        x: 100 + 20 * i,
                        y: 50,
                    }),
                );
                const place = async (start: number, end: number) => {
                    const placed = await writePlacement(
                        { recipe: BOX, members },
                        new QueryClient(),
                        "Error placing the shape",
                        plan(start, end),
                    );
                    await timelineResolverSettled();
                    return placed;
                };
                const moveOver = async (start: number, end: number) =>
                    (await timelinesWithRange(db, { start, end }))[0]?.id;
                const onPage2 = async () =>
                    (await readBasicRows(db, { marcherIds: ids }))
                        .filter((r) => r.start < 17 && r.end > 9)
                        .map((r) => r.marcherId);

                // Setup that must hold for the test to mean anything: a broken one returns, so
                // `it.fails` reports it instead of counting it as the bug
                if (!(await place(1, 9))) return;
                if ((await onPage2()).length !== 3) return;
                if (!(await place(9, 17))) return;

                expect(await onPage2()).toEqual(ids);
                expect(
                    (await readAllShapeRecipes(db)).map((r) => r.timelineId),
                ).toEqual([await moveOver(1, 9), await moveOver(9, 17)]);
            },
        );
    },
);
