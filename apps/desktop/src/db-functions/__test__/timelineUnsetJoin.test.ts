import { expect } from "vitest";
import { eq } from "drizzle-orm";
import { describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { createTimelineShapesInTransaction } from "../timelineShapes";
import {
    setTimelineTransitionDestinationInTransaction,
    updateTimelineTransitionsInTransaction,
} from "../timelineTransitionsInTransaction";
import { saveShapeRecipeInTransaction } from "../shapeRecipes";
import { splitTimelineAtBeat } from "../timelineSplitAtBeat";
import { splitMarchersIntoNewMove } from "../timelineSplitMoves";
import { unsetMarchersAt } from "../timelineUnset";
import { resizeTimeline } from "../timelineResize";
import {
    PAGE2,
    dataOf,
    expectSameSteps,
    page2,
    resolverOf,
    stepsOf,
    timelineRange,
} from "./timelineUnsetJoinHelpers";

keepFixturesInPageMode("its tests convert the show themselves");

/**
 * **Remove keyframe joins the halves after a split** (holds decision 14, #470): on the converted
 * `marchersAndPages` show (pages 1 to 6 of 8 counts, so page 2's box is `[9, 17)` and page 3's
 * `[17, 25)`), Split at playhead at count 13 and Remove keyframe there with the whole move
 * selected walks the marchers along the original path at even speed again, instead of standing
 * still until 13 and then going at double speed (#362 Repro, question 14). Part of a group is
 * `timelineUnsetJoinPart.test.ts` (#471).
 */

describeDbTests(
    "Remove keyframe joins the halves after a split (#470)",
    (it) => {
        it("question 14: after Split at playhead, removing the split with the whole move selected walks evenly again", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            const { timeline, members } = await page2(db);
            const even = stepsOf(await resolverOf(db), members, PAGE2);
            // Somebody walks on page 2, or the test shows nothing
            expect([...even.values()].some((s) => s[0]! > 1)).toBe(true);

            const split = await splitTimelineAtBeat({
                db,
                timelineId: timeline.id,
                beat: 13,
            });
            const result = await unsetMarchersAt({
                db,
                beat: 13,
                marcherIds: members,
            });

            expect(result.unset).toEqual(members);
            expect(result.joined).toEqual(members);
            // The step lengths across the page are what they were before the split: even
            expectSameSteps(
                even,
                stepsOf(await resolverOf(db), members, PAGE2),
            );
            // The move after the split runs over the whole page again; the half before is gone
            expect(await timelineRange(db, timeline.id)).toEqual(PAGE2);
            expect(await timelineRange(db, split.before.id)).toBeUndefined();
        });

        it("question 14 as reproduced: a move split off a page's, split at the playhead, then removed", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            const { timeline: page, members } = await page2(db);
            const chosen = members.slice(0, 2);
            const off = await splitMarchersIntoNewMove({
                db,
                timelineId: page.id,
                marcherIds: chosen,
            });
            const even = stepsOf(await resolverOf(db), members, PAGE2);
            await splitTimelineAtBeat({
                db,
                timelineId: off.timeline.id,
                beat: 13,
            });

            const result = await unsetMarchersAt({
                db,
                beat: 13,
                marcherIds: chosen,
            });

            expect(result.joined).toEqual(chosen);
            expectSameSteps(
                even,
                stepsOf(await resolverOf(db), members, PAGE2),
            );
            expect(await timelineRange(db, off.timeline.id)).toEqual(PAGE2);
        });

        it("is one undo step: undo restores the split, redo the join", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            const { timeline, members } = await page2(db);
            await splitTimelineAtBeat({
                db,
                timelineId: timeline.id,
                beat: 13,
            });
            const splitData = await dataOf(db);

            await unsetMarchersAt({ db, beat: 13, marcherIds: members });
            const joinedData = await dataOf(db);

            await performUndo(db);
            expect(await dataOf(db)).toEqual(splitData);
            await performRedo(db);
            expect(await dataOf(db)).toEqual(joinedData);
        });

        it("does not join at a page flag: Remove behaves as before there", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            const { members } = await page2(db);
            const page3 = (await db
                .select()
                .from(schema.timelines)
                .where(eq(schema.timelines.start_beat, 17))
                .get())!;

            const result = await unsetMarchersAt({
                db,
                beat: 17,
                marcherIds: members,
            });

            expect(result.unset).toEqual(members);
            expect(result.joined).toEqual([]);
            // Page 3's move still starts on its flag
            expect(await timelineRange(db, page3.id)).toEqual({
                start: 17,
                end: 25,
            });
        });

        it("joins each of two moves after the count, and deletes the removed move once", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            const { timeline, members } = await page2(db);
            const even = stepsOf(await resolverOf(db), members, PAGE2);
            const split = await splitTimelineAtBeat({
                db,
                timelineId: timeline.id,
                beat: 13,
            });
            // The removed move's marchers go on into two different moves after the count
            const chosen = members.slice(0, 2);
            const off = await splitMarchersIntoNewMove({
                db,
                timelineId: timeline.id,
                marcherIds: chosen,
            });

            const result = await unsetMarchersAt({
                db,
                beat: 13,
                marcherIds: members,
            });

            expect(result.joined).toEqual(members);
            expect(result.notJoined).toEqual([]);
            expect(await timelineRange(db, timeline.id)).toEqual(PAGE2);
            expect(await timelineRange(db, off.timeline.id)).toEqual(PAGE2);
            expect(await timelineRange(db, split.before.id)).toBeUndefined();
            expectSameSteps(
                even,
                stepsOf(await resolverOf(db), members, PAGE2),
            );
        });

        it("reports the marchers whose join is refused (L-4), and keeps the plain Remove for them", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            const { timeline, members } = await page2(db);
            // One marcher's move split off page 1 and grown over page 2's own move (its row rises
            // a layer), then, once page 2 is split at the playhead, taken off page 1: a second
            // move over [9, 17) for it
            const a = members[0]!;
            const page1 = (await db
                .select()
                .from(schema.timelines)
                .where(eq(schema.timelines.end_beat, 9))
                .get())!;
            const off = await splitMarchersIntoNewMove({
                db,
                timelineId: page1.id,
                marcherIds: [a],
            });
            await resizeTimeline({
                db,
                timelineId: off.timeline.id,
                start: page1.start_beat,
                end: 17,
            });
            await splitTimelineAtBeat({
                db,
                timelineId: timeline.id,
                beat: 13,
            });
            await resizeTimeline({
                db,
                timelineId: off.timeline.id,
                start: 9,
                end: 17,
            });

            const result = await unsetMarchersAt({
                db,
                beat: 13,
                marcherIds: members,
            });

            expect(result.unset).toEqual(members);
            expect(result.joined).toEqual([]);
            expect(result.notJoined).toEqual([
                { marcherIds: members, reason: "secondMove" },
            ]);
            // The move after the count still starts on it
            expect(await timelineRange(db, timeline.id)).toEqual({
                start: 13,
                end: 17,
            });
        });

        it("a follow-the-leader move joins with its members still in it, and plays as before the split", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            const { timeline, transition, members } = await page2(db);
            await transactionWithHistory(db, "ftl", async (tx) => {
                const [shape] = await createTimelineShapesInTransaction({
                    tx,
                    newShapes: [
                        {
                            kind: "line",
                            geometry: {
                                points: [
                                    [100, 300],
                                    [900, 340],
                                ],
                            },
                        },
                    ],
                });
                await setTimelineTransitionDestinationInTransaction({
                    tx,
                    transitionId: transition.id,
                    destination: { kind: "shape", shapeId: shape!.id },
                });
                await updateTimelineTransitionsInTransaction({
                    tx,
                    modifiedTransitions: [
                        {
                            id: transition.id,
                            pathStyle: "follow_the_leader",
                            pathParams: { waypoints: [] },
                        },
                    ],
                });
            });
            const r0 = await resolverOf(db);
            await splitTimelineAtBeat({
                db,
                timelineId: timeline.id,
                beat: 13,
            });

            const result = await unsetMarchersAt({
                db,
                beat: 13,
                marcherIds: members,
            });

            // Joining keeps everyone in the move it was in, so nobody is skipped
            expect(result.joined).toEqual(members);
            const r1 = await resolverOf(db);
            for (const id of members)
                for (let beat = 9; beat <= 17; beat += 0.5) {
                    const [x0, y0] = r0.positionAt(id, beat);
                    const [x1, y1] = r1.positionAt(id, beat);
                    expect(x1).toBeCloseTo(x0, 6);
                    expect(y1).toBeCloseTo(y0, 6);
                }
            expect(
                await db
                    .select()
                    .from(schema.timeline_transitions)
                    .where(eq(schema.timeline_transitions.id, transition.id))
                    .get(),
            ).toMatchObject({
                path_style: "follow_the_leader",
                start_beat: 9,
                end_beat: 17,
            });
        });

        it("a shape recipe of the move after the split stays with it, members and all", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            const { timeline, members } = await page2(db);
            await splitTimelineAtBeat({
                db,
                timelineId: timeline.id,
                beat: 13,
            });
            const recipeId = await transactionWithHistory(
                db,
                "recipe",
                async (tx) => {
                    // The recipe tables aren't in the undo history on their own; a named move is
                    await tx
                        .update(schema.timelines)
                        .set({ name: "Shape move" })
                        .where(eq(schema.timelines.id, timeline.id));
                    return await saveShapeRecipeInTransaction({
                        tx,
                        timelineId: timeline.id,
                        recipe: {
                            kind: "line",
                            kindVersion: 1,
                            params: {},
                            orderMode: "keep",
                            reverse: false,
                        },
                        members: members.map((marcherId, i) => ({
                            marcherId,
                            slot: i,
                            x: 100 + 20 * i,
                            y: 50,
                        })),
                    });
                },
            );

            const result = await unsetMarchersAt({
                db,
                beat: 13,
                marcherIds: members,
            });

            expect(result.joined).toEqual(members);
            const recipe = await db
                .select()
                .from(schema.timeline_shape_recipes)
                .where(eq(schema.timeline_shape_recipes.id, recipeId))
                .get();
            expect(recipe?.timeline_id).toBe(timeline.id);
            const recipeMembers = (
                await db
                    .select({
                        id: schema.timeline_shape_recipe_marchers.marcher_id,
                    })
                    .from(schema.timeline_shape_recipe_marchers)
                    .where(
                        eq(
                            schema.timeline_shape_recipe_marchers.recipe_id,
                            recipeId,
                        ),
                    )
                    .all()
            )
                .map((r) => r.id)
                .sort((a, b) => a - b);
            expect(recipeMembers).toEqual(members);
        });
    },
);
