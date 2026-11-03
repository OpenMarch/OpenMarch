import { afterEach, describe, expect } from "vitest";
import { eq } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { readShowTiming } from "@/timeline/showTiming";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import {
    followPlacedBoxChanges,
    invalidatePlacedBoxes,
    placedBoxesRead,
    usePlacedBoxStore,
} from "@/shapes/placed/placedBoxStore";
import { createLastPage, deletePages } from "../page";
import { deleteMarchers } from "../marcher";
import {
    moveMarchersInTarget,
    type TimelineEditTarget,
} from "../timelineMoves";
import { mergeMoves, splitMarchersIntoNewMove } from "../timelineSplitMoves";
import { addMarchersToTimeline } from "../timelineMembership";
import {
    readAllShapeRecipes,
    readShapeRecipes,
    saveShapeRecipeInTransaction,
    type ShapeRecipeRecord,
} from "../shapeRecipes";

/**
 * Shape recipes (ADR 0006) are saved in the same edit as the positions they place, so undo and
 * redo take both, and a marcher placed by a new shape leaves the move's older recipe.
 */

afterEach(() => stopTimelineResolver());

const PAGE2 = { start: 9, end: 17 };
const ARC: ShapeRecipeRecord = {
    kind: "arc",
    kindVersion: 1,
    params: { bulge: 4 },
    orderMode: "keep",
    reverse: false,
};
const LINE: ShapeRecipeRecord = { ...ARC, kind: "line", params: {} };

const resolver = () => useTimelineResolverStore.getState().resolver!;

/** Pages 1–4, nobody moved yet */
const show = async (db: DbConnection) => {
    const pages = [...(await readShowTiming(db)).pages].sort(
        (a, b) => a.order - b.order,
    );
    await deletePages({
        db,
        pageIds: new Set(pages.filter((p) => p.order >= 2).map((p) => p.id)),
    });
    for (let i = 0; i < 3; i++) await createLastPage({ db, newPageCounts: 8 });
    await startTimelineResolver(db);
    const [a, b, c] = resolver().marcherIds();
    return { a: a!, b: b!, c: c! };
};

/** Places `ids` on page 2 at x = 100, 120, ... with `recipe`, like the Shape tool's Place */
const place = async (
    db: DbConnection,
    ids: number[],
    recipe: ShapeRecipeRecord,
    target: TimelineEditTarget = { kind: "range", ...PAGE2 },
) => {
    let saved: number | null = null;
    await moveMarchersInTarget({
        db,
        target,
        moves: ids.map((marcherId, i) => ({
            marcherId,
            x: 100 + 20 * i,
            y: 50,
        })),
        afterWrite: async (tx, timelineId) => {
            saved = await saveShapeRecipeInTransaction({
                tx,
                timelineId,
                recipe,
                members: ids.map((marcherId, i) => ({
                    marcherId,
                    slot: i,
                    x: 100 + 20 * i,
                    y: 50,
                })),
            });
        },
    });
    await timelineResolverSettled();
    return saved!;
};

/** The move a placed recipe belongs to (the converted show has moves of its own) */
const recipeTimeline = async (db: DbConnection, recipeId: number) =>
    (
        await db
            .select({ id: schema.timeline_shape_recipes.timeline_id })
            .from(schema.timeline_shape_recipes)
            .where(eq(schema.timeline_shape_recipes.id, recipeId))
            .get()
    )?.id ?? null;

describeDbTests("Shape recipes", (it) => {
    it("are saved with the positions, and undo and redo take both", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const id = await place(db, [a, b], ARC);
        const timelineId = await recipeTimeline(db, id);
        const stored = await readShapeRecipes({
            db,
            timelineId,
            marcherIds: [a],
        });
        expect(stored).toEqual([
            {
                id,
                timelineId,
                ...ARC,
                members: [
                    { marcherId: a, slot: 0, x: 100, y: 50 },
                    { marcherId: b, slot: 1, x: 120, y: 50 },
                ],
            },
        ]);

        await performUndo(db);
        await timelineResolverSettled();
        expect(
            await db.select().from(schema.timeline_shape_recipes).all(),
        ).toEqual([]);
        expect(
            await db.select().from(schema.timeline_shape_recipe_marchers).all(),
        ).toEqual([]);

        await performRedo(db);
        await timelineResolverSettled();
        expect(
            await readShapeRecipes({
                db,
                timelineId: await recipeTimeline(db, id),
                marcherIds: [b],
            }),
        ).toEqual(stored);
    });

    it("a new shape takes its marchers out of the move's older recipe", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b, c } = await show(db);
        const arc = await place(db, [a, b, c], ARC);
        const line = await place(db, [b, c], LINE);
        const timelineId = await recipeTimeline(db, arc);
        const stored = await readShapeRecipes({
            db,
            timelineId,
            marcherIds: [a, b, c],
        });
        expect(
            stored.map((r) => [
                r.id,
                r.kind,
                r.members.map((m) => m.marcherId),
            ]),
        ).toEqual([
            [arc, "arc", [a]],
            [line, "line", [b, c]],
        ]);

        // Placing the last one elsewhere empties the arc, which goes
        await place(db, [a], LINE);
        const after = await readShapeRecipes({
            db,
            timelineId,
            marcherIds: [a, b, c],
        });
        expect(after.some((r) => r.id === arc)).toBe(false);
    });

    it("at Home, too: one undo takes back the homes and the recipe", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        const homesBefore = await db
            .select({ id: schema.marchers.id, x: schema.marchers.home_x })
            .from(schema.marchers)
            .all();
        await moveMarchersInTarget({
            db,
            target: { kind: "home" },
            moves: [
                { marcherId: a, x: 11, y: 22 },
                { marcherId: b, x: 33, y: 22 },
            ],
            afterWrite: async (tx, timelineId) => {
                expect(timelineId).toBeNull();
                await saveShapeRecipeInTransaction({
                    tx,
                    timelineId,
                    recipe: LINE,
                    members: [
                        { marcherId: a, slot: 0, x: 11, y: 22 },
                        { marcherId: b, slot: 1, x: 33, y: 22 },
                    ],
                });
            },
        });
        expect(
            await readShapeRecipes({ db, timelineId: null, marcherIds: [a] }),
        ).toHaveLength(1);
        await performUndo(db);
        expect(
            await db
                .select({ id: schema.marchers.id, x: schema.marchers.home_x })
                .from(schema.marchers)
                .all(),
        ).toEqual(homesBefore);
        expect(
            await db.select().from(schema.timeline_shape_recipes).all(),
        ).toEqual([]);
    });

    it("an edited recipe keeps its id", async ({ db, marchersAndPages: _ }) => {
        const { a, b } = await show(db);
        const id = await place(db, [a, b], ARC);
        const timelineId = (await recipeTimeline(db, id))!;
        let replaced: number | null = null;
        await moveMarchersInTarget({
            db,
            target: { kind: "timeline", timelineId },
            moves: [
                { marcherId: a, x: 0, y: 0 },
                { marcherId: b, x: 40, y: 0 },
            ],
            afterWrite: async (tx, written) => {
                replaced = await saveShapeRecipeInTransaction({
                    tx,
                    timelineId: written,
                    recipe: { ...ARC, params: { bulge: 9 } },
                    members: [
                        { marcherId: a, slot: 0, x: 0, y: 0 },
                        { marcherId: b, slot: 1, x: 40, y: 0 },
                    ],
                    replaces: id,
                });
            },
        });
        expect(replaced).toBe(id);
        const [recipe] = await readShapeRecipes({
            db,
            timelineId,
            marcherIds: [a],
        });
        expect(recipe!.params).toEqual({ bulge: 9 });
        expect(recipe!.members.map((m) => [m.x, m.y])).toEqual([
            [0, 0],
            [40, 0],
        ]);
    });

    it("deleting a shape's last marcher deletes the shape, and undo brings both back", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await show(db);
        await place(db, [a, b], ARC);
        const before = await db
            .select()
            .from(schema.timeline_shape_recipes)
            .all();

        await deleteMarchers({ db, marcherIds: new Set([a]) });
        expect(
            await db.select().from(schema.timeline_shape_recipes).all(),
        ).toEqual(before);
        await deleteMarchers({ db, marcherIds: new Set([b]) });
        expect(
            await db.select().from(schema.timeline_shape_recipes).all(),
        ).toEqual([]);

        await performUndo(db);
        expect(
            await db.select().from(schema.timeline_shape_recipes).all(),
        ).toEqual(before);
        expect(
            (
                await db
                    .select()
                    .from(schema.timeline_shape_recipe_marchers)
                    .all()
            ).map((m) => m.marcher_id),
        ).toEqual([b]);
    });

    it("placed shapes follow undo and redo of an edit that only changed a recipe (a pivot drag)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const stop = followPlacedBoxChanges();
        try {
            const { a, b } = await show(db);
            const id = await place(db, [a, b], ARC);
            const timelineId = await recipeTimeline(db, id);
            const bulge = () =>
                (
                    usePlacedBoxStore
                        .getState()
                        .recipes.find((r) => r.id === id)?.params as
                        | { bulge: number }
                        | undefined
                )?.bulge;
            // The app re-reads after its own edits
            invalidatePlacedBoxes();
            await expect.poll(bulge).toBe(4);

            // No position changes, so the resolver hears of none of this
            await transactionWithHistory(db, "editRecipe", async (tx) => {
                await saveShapeRecipeInTransaction({
                    tx,
                    timelineId,
                    recipe: { ...ARC, params: { bulge: 9 } },
                    members: [
                        { marcherId: a, slot: 0, x: 100, y: 50 },
                        { marcherId: b, slot: 1, x: 120, y: 50 },
                    ],
                    replaces: id,
                });
            });
            invalidatePlacedBoxes();
            await expect.poll(bulge).toBe(9);
            await performUndo(db);
            await expect.poll(bulge).toBe(4);
            await performRedo(db);
            await expect.poll(bulge).toBe(9);
        } finally {
            stop();
        }
    });

    it("placed shapes are read back with the end beats of their moves, a move made by the same edit too (#514)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const stop = followPlacedBoxChanges();
        try {
            const { a, b } = await show(db);
            const before = new Set(
                (
                    await db
                        .select({ id: schema.timelines.id })
                        .from(schema.timelines)
                        .all()
                ).map((t) => t.id),
            );
            const id = await place(db, [a, b], ARC);
            const timelineId = (await recipeTimeline(db, id))!;
            expect(before.has(timelineId)).toBe(false);
            const [move] = await db
                .select({ end: schema.timelines.end_beat })
                .from(schema.timelines)
                .where(eq(schema.timelines.id, timelineId))
                .all();
            // Read back after the edit, as the save queue waits for it: no stored timelines here
            await placedBoxesRead();
            const { recipes, ends } = usePlacedBoxStore.getState();
            expect(recipes.map((r) => r.id)).toContain(id);
            expect(ends.get(timelineId)).toBe(move!.end);
        } finally {
            stop();
        }
    });

    describe("with a move split off the page's (UI-25)", () => {
        /** a and b placed on page 2, then a split off into a move of its own over the same counts */
        const splitShow = async (db: DbConnection) => {
            const marchers = await show(db);
            const first = await place(db, [marchers.a, marchers.b], ARC);
            const pageMove = (await recipeTimeline(db, first))!;
            const split = await splitMarchersIntoNewMove({
                db,
                timelineId: pageMove,
                marcherIds: [marchers.a],
            });
            await timelineResolverSettled();
            return {
                ...marchers,
                arc: first,
                pageMove,
                splitMove: split.timeline.id,
            };
        };

        it("splitting every marcher off the page takes its shape along whole, and undo puts it back (#581)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await show(db);
            const arc = await place(db, [a, b], ARC);
            const pageMove = (await recipeTimeline(db, arc))!;
            const before = await readAllShapeRecipes(db);
            const split = await splitMarchersIntoNewMove({
                db,
                timelineId: pageMove,
                marcherIds: [a, b],
            });
            await timelineResolverSettled();
            expect(await recipeTimeline(db, arc)).toBe(split.timeline.id);
            expect(await readAllShapeRecipes(db)).toEqual(
                before.map((r) => ({ ...r, timelineId: split.timeline.id })),
            );
            await performUndo(db);
            await timelineResolverSettled();
            expect(await readAllShapeRecipes(db)).toEqual(before);
        });

        it("a shape placed in the selected split move belongs to it", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, c, splitMove } = await splitShow(db);
            const id = await place(db, [a, c], LINE, {
                kind: "range",
                ...PAGE2,
                timelineId: splitMove,
            });
            expect(await recipeTimeline(db, id)).toBe(splitMove);
        });

        it("a shape placed over the counts without a selected move belongs to the move its marchers' positions went to", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, splitMove } = await splitShow(db);
            const id = await place(db, [a], LINE);
            expect(await recipeTimeline(db, id)).toBe(splitMove);
        });

        it("in Basic mode too: a shape placed at the page's flag belongs to the move its marchers' positions went to", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, splitMove } = await splitShow(db);
            const id = await place(db, [a], LINE, {
                kind: "point",
                beat: PAGE2.end,
                box: PAGE2,
            });
            expect(await recipeTimeline(db, id)).toBe(splitMove);
        });

        it("merging the split move back keeps its shape, in the page's move, and undo puts it back", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, pageMove, splitMove } = await splitShow(db);
            const id = await place(db, [a], LINE, {
                kind: "range",
                ...PAGE2,
                timelineId: splitMove,
            });
            const before = await readShapeRecipes({
                db,
                timelineId: splitMove,
                marcherIds: [a],
            });

            await mergeMoves({ db, sourceId: splitMove, targetId: pageMove });
            await timelineResolverSettled();
            const merged = await readShapeRecipes({
                db,
                timelineId: pageMove,
                marcherIds: [a],
            });
            expect(merged).toEqual(
                before.map((r) => ({ ...r, timelineId: pageMove })),
            );
            // Where the shape put a is still where a stands at the move's end
            const member = merged.find((r) => r.id === id)!.members[0]!;
            expect(resolver().positionAt(a, PAGE2.end)).toEqual([
                member.x,
                member.y,
            ]);

            await performUndo(db);
            await timelineResolverSettled();
            expect(
                await readShapeRecipes({
                    db,
                    timelineId: splitMove,
                    marcherIds: [a],
                }),
            ).toEqual(before);
        });

        /** Who recipe `id` lists, or null once it's gone */
        const membersOf = async (db: DbConnection, id: number) => {
            const [r] = (await readAllShapeRecipes(db)).filter(
                (x) => x.id === id,
            );
            return r ? r.members.map((m) => m.marcherId) : null;
        };

        /**
         * A recipe in move `timelineId` listing `ids`, written as a file from before these rules
         * could hold it (a shape placed in a split move while the page's still listed its marchers)
         */
        const staleRecipe = async (
            db: DbConnection,
            timelineId: number,
            ids: number[],
        ) =>
            await transactionWithHistory(db, "staleRecipe", async (tx) => {
                const row = await tx
                    .insert(schema.timeline_shape_recipes)
                    .values({
                        timeline_id: timelineId,
                        kind: LINE.kind,
                        kind_version: LINE.kindVersion,
                        params: "{}",
                        order_mode: LINE.orderMode,
                        reverse: false,
                    })
                    .returning({ id: schema.timeline_shape_recipes.id })
                    .get();
                await tx
                    .insert(schema.timeline_shape_recipe_marchers)
                    .values(
                        ids.map((marcherId, slot) => ({
                            recipe_id: row.id,
                            marcher_id: marcherId,
                            slot,
                            x: 100 + 20 * slot,
                            y: 50,
                        })),
                    )
                    .run();
                return row.id;
            });

        /** Puts marcher `id` back in recipe `recipeId`, as a file from before these rules may */
        const staleMember = async (
            db: DbConnection,
            recipeId: number,
            id: number,
        ) =>
            await transactionWithHistory(db, "staleMember", async (tx) => {
                await tx
                    .insert(schema.timeline_shape_recipe_marchers)
                    .values({
                        recipe_id: recipeId,
                        marcher_id: id,
                        slot: 9,
                        x: 0,
                        y: 0,
                    })
                    .run();
            });

        it("a shape placed in the split move takes its marchers out of the page's shape, at the same counts, in one undo step", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, c, arc, splitMove } = await splitShow(db);
            // As a file from before splits carried shapes may hold: the page's shape lists a
            await staleMember(db, arc, a);
            await place(db, [a, c], LINE, {
                kind: "range",
                ...PAGE2,
                timelineId: splitMove,
            });
            expect(await membersOf(db, arc)).toEqual([b]);
            await performUndo(db);
            expect((await membersOf(db, arc))?.sort()).toEqual([a, b].sort());
        });

        it("a shape saved at a page's flag leaves alone the shape of a move that only passes over it", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await show(db);
            const arc = await place(db, [a], ARC);
            const pageMove = (await recipeTimeline(db, arc))!;
            // An Expert move over page 2's flag, on a layer above a's page move
            const { timelineId: over } = await addMarchersToTimeline({
                db,
                range: { start: PAGE2.end - 4, end: PAGE2.end + 4 },
                marcherIds: [a],
            });
            await timelineResolverSettled();
            const theirs = await staleRecipe(db, over, [a]);
            // The page's shape edited (a placement there is refused: a's position at the flag is
            // the Expert move's now)
            await transactionWithHistory(db, "editShape", (tx) =>
                saveShapeRecipeInTransaction({
                    tx,
                    timelineId: pageMove,
                    recipe: LINE,
                    members: [{ marcherId: a, slot: 0, x: 100, y: 50 }],
                    replaces: arc,
                }),
            );
            expect(await membersOf(db, arc)).toEqual([a]);
            expect(await membersOf(db, theirs)).toEqual([a]);
        });

        it("a shape over marchers in different moves lists only those in its own move", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, pageMove } = await splitShow(db);
            // a has a move of its own over these counts; the shape goes to the page's
            const id = await place(db, [a, b], LINE, {
                kind: "range",
                ...PAGE2,
                timelineId: pageMove,
            });
            expect(await recipeTimeline(db, id)).toBe(pageMove);
            expect(await membersOf(db, id)).toEqual([b]);
        });

        it("splitting marchers off drops them from the page's shape, which they don't make up, in one undo step", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, arc, splitMove } = await splitShow(db);
            expect(await membersOf(db, arc)).toEqual([b]);
            expect(await recipeTimeline(db, arc)).not.toBe(splitMove);
            await performUndo(db);
            expect(await membersOf(db, arc)).toEqual([a, b]);
        });

        it("splitting off a shape's whole member set takes the shape to the new move, and undo brings it back", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, c } = await show(db);
            const line = await place(db, [c], LINE);
            const arc = await place(db, [a, b], ARC);
            const pageMove = (await recipeTimeline(db, arc))!;
            const split = await splitMarchersIntoNewMove({
                db,
                timelineId: pageMove,
                marcherIds: [a, b],
            });
            expect(await recipeTimeline(db, arc)).toBe(split.timeline.id);
            expect(await membersOf(db, arc)).toEqual([a, b]);
            expect(await recipeTimeline(db, line)).toBe(pageMove);
            await performUndo(db);
            expect(await recipeTimeline(db, arc)).toBe(pageMove);
            expect(await membersOf(db, arc)).toEqual([a, b]);
        });

        it("undoing a merge gives the page's shape back the marcher the merged shape took", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, arc, pageMove, splitMove } = await splitShow(db);
            // As a file from before these rules may hold: the page's shape still lists a
            await staleMember(db, arc, a);
            const line = await staleRecipe(db, splitMove, [a]);
            await mergeMoves({ db, sourceId: splitMove, targetId: pageMove });
            expect(await membersOf(db, arc)).toEqual([b]);
            expect(await recipeTimeline(db, line)).toBe(pageMove);
            await performUndo(db);
            expect((await membersOf(db, arc))?.sort()).toEqual([a, b].sort());
            expect(await recipeTimeline(db, line)).toBe(splitMove);
        });

        it("a merge that empties the page's shape deletes it, and undo brings it back", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, pageMove, splitMove } = await splitShow(db);
            const line = await staleRecipe(db, splitMove, [a]);
            const stale = await staleRecipe(db, pageMove, [a]);
            await mergeMoves({ db, sourceId: splitMove, targetId: pageMove });
            expect(await membersOf(db, stale)).toBeNull();
            expect(await membersOf(db, line)).toEqual([a]);
            await performUndo(db);
            expect(await membersOf(db, stale)).toEqual([a]);
            expect(await recipeTimeline(db, line)).toBe(splitMove);
        });
    });
});
