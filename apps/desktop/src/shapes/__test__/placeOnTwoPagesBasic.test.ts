import { afterEach, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { type DbConnection, describeDbTests } from "@/test/base";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import type { CanvasEditPlan } from "@/timeline/timelineCoordinateWrites";
import { readBasicRows } from "@/db-functions/basicRows";
import { performRedo, performUndo } from "@/db-functions/history";
import { moveMarchersInTarget } from "@/db-functions/timelineMoves";
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
 * members go to where page 1 left them, which an ordinary Basic edit reads as a drag back that
 * takes them out of page 2's move (`planPoint` in `timelinePointMoves.ts`). A shape's write sets
 * them there instead, in page 2's shared move, so each page keeps a recipe, as Expert's range
 * writer does (`ownPageMoves`, `keepUnchanged`).
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
        const setup = async (db: DbConnection) => {
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
                (await timelinesWithRange(db, { start, end }))[0]?.id;
            const onPage2 = async () =>
                (await readBasicRows(db, { marcherIds: ids }))
                    .filter((r) => r.start < 17 && r.end > 9)
                    .map((r) => r.marcherId);
            const recipeMoves = async () =>
                (await readAllShapeRecipes(db)).map((r) => r.timelineId);
            return { ids, members, place, moveOver, onPage2, recipeMoves };
        };

        // Was BUG 5 of the audit: page 2 got no recipe, and its members lost their rows over
        // page 2, so the page the shape was just placed on was Not defined for them
        it("keeps a recipe in each page's move, and the members' rows on page 2", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { ids, place, moveOver, onPage2, recipeMoves } =
                await setup(db);
            await place(1, 9);
            expect(await onPage2()).toEqual(ids);
            await place(9, 17);

            expect(await onPage2()).toEqual(ids);
            expect(await recipeMoves()).toEqual([
                await moveOver(1, 9),
                await moveOver(9, 17),
            ]);
            // On their spots at page 2's flag, set there by page 2's own move
            const resolver = useTimelineResolverStore.getState().resolver!;
            expect(ids.map((id) => resolver.positionAt(id, 17))).toEqual([
                [100, 50],
                [120, 50],
                [140, 50],
            ]);
        });

        it("Undo takes page 2's recipe and puts its positions back; Redo places it again", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { ids, place, moveOver, onPage2, recipeMoves } =
                await setup(db);
            const resolver = () =>
                useTimelineResolverStore.getState().resolver!;
            await place(1, 9);
            const before = ids.map((id) => resolver().positionAt(id, 17));
            await place(9, 17);

            await performUndo(db);
            await timelineResolverSettled();
            expect(await recipeMoves()).toEqual([await moveOver(1, 9)]);
            expect(await onPage2()).toEqual(ids);
            expect(ids.map((id) => resolver().positionAt(id, 17))).toEqual(
                before,
            );

            await performRedo(db);
            await timelineResolverSettled();
            expect(await recipeMoves()).toEqual([
                await moveOver(1, 9),
                await moveOver(9, 17),
            ]);
            expect(await onPage2()).toEqual(ids);
            expect(resolver().positionAt(ids[0]!, 17)).toEqual([100, 50]);
        });

        it("an ordinary drag back onto the page's start still takes the marcher out of the page", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { ids, onPage2 } = await setup(db);
            const resolver = useTimelineResolverStore.getState().resolver!;
            const [x, y] = resolver.positionAt(ids[0]!, 9);
            // Setup: the marcher moves over page 2, or this is no drag back
            expect(resolver.positionAt(ids[0]!, 17)).not.toEqual([x, y]);
            await moveMarchersInTarget({
                db,
                target: { kind: "point", beat: 17, box: { start: 9, end: 17 } },
                moves: [{ marcherId: ids[0]!, x, y }],
            });
            expect(await onPage2()).toEqual(ids.slice(1));
        });
    },
);
