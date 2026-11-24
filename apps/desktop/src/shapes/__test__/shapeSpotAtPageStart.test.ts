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
import { moveMarchersInTarget } from "@/db-functions/timelineMoves";
import { timelinesWithRange } from "@/db-functions/timelines";
import {
    readAllShapeRecipes,
    type ShapeRecipeMember,
    type ShapeRecipeRecord,
} from "@/db-functions/shapeRecipes";
import { writePlacement } from "../tool/shapePlacement";

/**
 * A placed shape changed so that a member's new spot is exactly where it stands at the page's
 * start (#1264, #1276): a box widened until its end column lands on the last page's column, or
 * Recalculate sending a marcher to the spot it already starts on. The shape's write sets that
 * member there like the rest. It isn't a drag back that takes it out of its move, which a
 * shape member refuses, leaving it at its old spot on top of a neighbor.
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

describeDbTests(
    "a placed shape changed so a member's spot is where it starts the page",
    (it) => {
        it("sets that member on its new spot like the others", async ({
            db,
            marchersAndPages: _,
        }) => {
            await startTimelineResolver(db);
            const resolver = () =>
                useTimelineResolverStore.getState().resolver!;
            const ids = resolver().marcherIds().slice(0, 3);
            const row = (x0: number, step: number): ShapeRecipeMember[] =>
                ids.map((marcherId, i) => ({
                    marcherId,
                    slot: i,
                    x: x0 + step * i,
                    y: 50,
                }));
            const place = async (
                start: number,
                end: number,
                members: ShapeRecipeMember[],
                replaces?: { id: number; timelineId: number | null },
            ) => {
                expect(
                    await writePlacement(
                        {
                            recipe: BOX,
                            members,
                            ...(replaces ? { replaces } : {}),
                        },
                        new QueryClient(),
                        "Error placing the shape",
                        plan(start, end),
                    ),
                ).toBe(true);
                await timelineResolverSettled();
            };

            // Page 1: 100, 130, 160. Page 2: 100, 120, 140, each member in a move of its own there,
            // as in a show whose pages were made one drag at a time: Clear this page takes them out
            // of page 2's shared move, so the placement adds each in a one-slot move
            await place(1, 9, row(100, 30));
            await moveMarchersInTarget({
                db,
                target: { kind: "range", start: 9, end: 17 },
                moves: row(100, 30).map(({ marcherId, x, y }) => ({
                    marcherId,
                    x,
                    y,
                })),
                clearPage: true,
            });
            await timelineResolverSettled();
            await place(9, 17, row(100, 20));
            const page2 = (
                await timelinesWithRange(db, { start: 9, end: 17 })
            )[0]!.id;
            const recipe = (await readAllShapeRecipes(db)).find(
                (r) => r.timelineId === page2,
            )!;

            // Widened on page 2: the last one lands on 160, where it stands at the page's start
            await place(9, 17, row(100, 30), {
                id: recipe.id,
                timelineId: page2,
            });

            expect(ids.map((id) => resolver().positionAt(id, 17))).toEqual([
                [100, 50],
                [130, 50],
                [160, 50],
            ]);
        });
    },
);
