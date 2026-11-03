import { expect } from "vitest";
import { asc, eq } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { createTimelineShapesInTransaction } from "../timelineShapes";
import {
    createTimelineTransitionsInTransaction,
    setTimelineTransitionDestinationInTransaction,
    updateTimelineTransitionsInTransaction,
} from "../timelineTransitionsInTransaction";
import { saveShapeRecipeInTransaction } from "../shapeRecipes";
import { splitTimelineAtBeat } from "../timelineSplitAtBeat";
import { splitMarchersIntoNewMove } from "../timelineSplitMoves";
import { resizeTimeline } from "../timelineResize";
import { removeAssignmentRowsInTransaction } from "../timelineMembership";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";
import { unsetMarchersAt } from "../timelineUnset";
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
 * **Joining after a split for part of a group** (holds R4, #471): on the converted
 * `marchersAndPages` show (page 2's box is `[9, 17)`), Split at playhead at count 13, then Remove
 * keyframe there with only some of the move's marchers selected. Those marchers are taken out of
 * both halves into a move of their own, which joins (#470), so they walk evenly again; the others
 * keep both halves. Shape and follow-the-leader members can't be taken out: they keep the plain
 * Remove, and the result names them.
 */

/** `marcherId`'s rows over page 2, as `[start, end]`, in order. */
const rowsOnPage2 = async (db: DbConnection, marcherId: number) =>
    (
        await db
            .select()
            .from(schema.timeline_assignments)
            .where(eq(schema.timeline_assignments.marcher_id, marcherId))
            .orderBy(asc(schema.timeline_assignments.start_beat))
            .all()
    )
        .filter((r) => r.start_beat < PAGE2.end && r.end_beat > PAGE2.start)
        .map((r) => [r.start_beat, r.end_beat]);

/** Page 2 split at the playhead, count 13, with its steps before and after the split. */
const splitPage2 = async (db: DbConnection) => {
    await convertPagesToTimeline(db);
    const { timeline, transition, members } = await page2(db);
    expect(members.length).toBeGreaterThanOrEqual(3);
    const even = stepsOf(await resolverOf(db), members);
    // Somebody walks on page 2, or the test shows nothing
    expect([...even.values()].some((s) => s[0]! > 1)).toBe(true);
    const split = await splitTimelineAtBeat({
        db,
        timelineId: timeline.id,
        beat: 13,
    });
    const halves = stepsOf(await resolverOf(db), members);
    return { after: timeline, transition, members, split, even, halves };
};

describeDbTests(
    "Remove keyframe joins part of a group after a split (#471)",
    (it) => {
        it("one of the move's marchers selected: it walks one even move, the others keep both halves", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { after, members, split, even, halves } =
                await splitPage2(db);
            const [one, ...others] = members as [number, ...number[]];

            const result = await unsetMarchersAt({
                db,
                beat: 13,
                marcherIds: [one],
            });

            expect(result.unset).toEqual([one]);
            expect(result.joined).toEqual([one]);
            expect(result.notJoined).toEqual([]);
            expect(result.notTakenApart).toBeUndefined();
            const r = await resolverOf(db);
            expectSameSteps(
                new Map([[one, even.get(one)!]]),
                stepsOf(r, [one]),
            );
            expectSameSteps(
                new Map(others.map((id) => [id, halves.get(id)!])),
                stepsOf(r, others),
            );
            expect(await rowsOnPage2(db, one)).toEqual([[9, 17]]);
            for (const id of others)
                expect(await rowsOnPage2(db, id)).toEqual([
                    [9, 13],
                    [13, 17],
                ]);
            // Both halves are still there for the others
            expect(await timelineRange(db, split.before.id)).toEqual({
                start: 9,
                end: 13,
            });
            expect(await timelineRange(db, after.id)).toEqual({
                start: 13,
                end: 17,
            });
        });

        it("is one undo step: undo restores the split for everyone, redo the join", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { members } = await splitPage2(db);
            const splitData = await dataOf(db);

            await unsetMarchersAt({ db, beat: 13, marcherIds: [members[0]!] });
            const joinedData = await dataOf(db);
            expect(joinedData).not.toEqual(splitData);

            const undo = await performUndo(db);
            expect(undo.success, undo.error?.message).toBe(true);
            expect(await dataOf(db)).toEqual(splitData);
            await performRedo(db);
            expect(await dataOf(db)).toEqual(joinedData);
        });

        it("a shape member keeps the plain Remove and is named; the other selected marcher joins", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { after, members, even } = await splitPage2(db);
            const [shaped, free] = members as [number, number];
            // The half after the split keeps the shape recipe (#363) of one marcher
            await transactionWithHistory(db, "recipe", async (tx) => {
                // The recipe tables aren't in the undo history on their own; a named move is
                await tx
                    .update(schema.timelines)
                    .set({ name: "Shape move" })
                    .where(eq(schema.timelines.id, after.id));
                await saveShapeRecipeInTransaction({
                    tx,
                    timelineId: after.id,
                    recipe: {
                        kind: "line",
                        kindVersion: 1,
                        params: {},
                        orderMode: "keep",
                        reverse: false,
                    },
                    members: [{ marcherId: shaped, slot: 0, x: 100, y: 50 }],
                });
            });
            const r0 = await resolverOf(db);

            const result = await unsetMarchersAt({
                db,
                beat: 13,
                marcherIds: [shaped, free],
            });

            expect(result.unset).toEqual([shaped, free]);
            expect(result.joined).toEqual([free]);
            expect(result.notTakenApart?.refusal).toBe(
                "inShapeOrFollowTheLeader",
            );
            expect(result.notTakenApart?.marcherIds).toEqual([shaped]);
            expect(result.notTakenApart?.message).toMatch(/is in a shape/);
            expectSameSteps(
                new Map([[free, even.get(free)!]]),
                stepsOf(await resolverOf(db), [free]),
            );
            // Today's Remove: the shape member stands where count 9 left it until 13, then walks its
            // half after the split, still in the shape's move
            const r1 = await resolverOf(db);
            for (let beat = 9; beat <= 13; beat++)
                expect(r1.positionAt(shaped, beat)).toEqual(
                    r0.positionAt(shaped, 9),
                );
            expect(r1.positionAt(shaped, 17)).toEqual(
                r0.positionAt(shaped, 17),
            );
            expect(await rowsOnPage2(db, shaped)).toEqual([[13, 17]]);
            expect(await timelineRange(db, after.id)).toEqual({
                start: 13,
                end: 17,
            });
        });

        it("a follow-the-leader member keeps the plain Remove and is named", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { members, transition } = await splitPage2(db);
            const one = members[0]!;
            // The half after the split (its transition stayed with it) walks follow-the-leader
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

            const result = await unsetMarchersAt({
                db,
                beat: 13,
                marcherIds: [one],
            });

            expect(result.unset).toEqual([one]);
            expect(result.joined).toEqual([]);
            expect(result.notTakenApart?.marcherIds).toEqual([one]);
            expect(result.notTakenApart?.message).toMatch(/follows the leader/);
            expect(await rowsOnPage2(db, one)).toEqual([[13, 17]]);
        });

        it("a member who follows the leader on a later page keeps the plain Remove and is named", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { members } = await splitPage2(db);
            const one = members[0]!;
            // Page 3 (from count 17) walks follow-the-leader in the order of the move before it
            // (R-12), so split by marcher won't break up the shared transitions of page 2's halves
            const page3 = (await db
                .select()
                .from(schema.timeline_transitions)
                .innerJoin(
                    schema.timelines,
                    eq(
                        schema.timelines.id,
                        schema.timeline_transitions.timeline_id,
                    ),
                )
                .where(eq(schema.timelines.start_beat, PAGE2.end))
                .get())!.timeline_transitions;
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
                    transitionId: page3.id,
                    destination: { kind: "shape", shapeId: shape!.id },
                });
                await updateTimelineTransitionsInTransaction({
                    tx,
                    modifiedTransitions: [
                        {
                            id: page3.id,
                            pathStyle: "follow_the_leader",
                            pathParams: { waypoints: [] },
                            orderMode: "inherit",
                        },
                    ],
                });
            });

            const result = await unsetMarchersAt({
                db,
                beat: 13,
                marcherIds: [one],
            });

            expect(result.unset).toEqual([one]);
            expect(result.joined).toEqual([]);
            expect(result.notTakenApart?.marcherIds).toEqual([one]);
            expect(result.notTakenApart?.message).toMatch(/follows the leader/);
            expect(await rowsOnPage2(db, one)).toEqual([[13, 17]]);
        });

        it("every member of the half before selected, but the half after has others: they're taken out of it and join", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { after, members, split, even, halves } =
                await splitPage2(db);
            const [one, ...others] = members as [number, ...number[]];
            // `one` alone in a move of its own before the split; the half after keeps everyone
            const own = await splitMarchersIntoNewMove({
                db,
                timelineId: split.before.id,
                marcherIds: [one],
            });

            const result = await unsetMarchersAt({
                db,
                beat: 13,
                marcherIds: [one],
            });

            expect(result.unset).toEqual([one]);
            expect(result.joined).toEqual([one]);
            expect(result.notJoined).toEqual([]);
            expect(result.notTakenApart).toBeUndefined();
            const r = await resolverOf(db);
            expectSameSteps(
                new Map([[one, even.get(one)!]]),
                stepsOf(r, [one]),
            );
            expectSameSteps(
                new Map(others.map((id) => [id, halves.get(id)!])),
                stepsOf(r, others),
            );
            expect(await rowsOnPage2(db, one)).toEqual([[9, 17]]);
            // Its own move before the split is one with its move after now
            expect(await timelineRange(db, own.timeline.id)).toBeUndefined();
            expect(await timelineRange(db, after.id)).toEqual({
                start: 13,
                end: 17,
            });
        });

        it("a join refused after the take keeps the plain Remove, reports why, and leaves no empty move behind", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            const { timeline, members } = await page2(db);
            // As in #470's "second move" case: `a` also has a move of its own over [9, 17), so
            // its move after the split can't be fitted back over the counts
            const [a, b] = members as [number, number];
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
            const split = await splitTimelineAtBeat({
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
            // `a` and `b` share a transition of their own in the half before the split, so it
            // goes whole into their own move, and Remove leaves it there with two vacant slots
            const r0 = await resolverOf(db);
            await transactionWithHistory(db, "pair", async (tx) => {
                const rows = (
                    await tx.select().from(schema.timeline_assignments).all()
                ).filter(
                    (r) =>
                        (r.marcher_id === a || r.marcher_id === b) &&
                        r.start_beat === 9 &&
                        r.end_beat === 13,
                );
                expect(rows).toHaveLength(2);
                await removeAssignmentRowsInTransaction({
                    tx,
                    removed: rows,
                    compact: true,
                });
                const [pair] = await createTimelineTransitionsInTransaction({
                    tx,
                    newTransitions: [
                        {
                            timelineId: split.before.id,
                            slotCount: 2,
                            destination: {
                                kind: "individual",
                                points: [
                                    r0.positionAt(a, 13),
                                    r0.positionAt(b, 13),
                                ],
                            },
                            pathStyle: "direct",
                            pathParams: null,
                            orderMode: "inherit",
                        },
                    ],
                });
                await createTimelineAssignmentsInTransaction({
                    tx,
                    newAssignments: [a, b].map((marcherId, slotIndex) => ({
                        marcherId,
                        transitionId: pair!.id,
                        slotIndex,
                        startBeat: 9,
                        endBeat: 13,
                        layer: rows.find((r) => r.marcher_id === marcherId)!
                            .layer,
                    })),
                });
            });
            const before = await db.select().from(schema.timelines).all();

            const result = await unsetMarchersAt({
                db,
                beat: 13,
                marcherIds: [a, b],
            });

            expect(result.unset).toEqual([a, b]);
            expect(result.joined).toEqual([]);
            expect(result.notJoined).toEqual([
                { marcherIds: [a, b], reason: "secondMove" },
            ]);
            // Both halves stay for the others, and the only new move is theirs after the count
            expect(await timelineRange(db, split.before.id)).toEqual({
                start: 9,
                end: 13,
            });
            const added = (await db.select().from(schema.timelines).all())
                .filter((t) => !before.some((o) => o.id === t.id))
                .map((t) => ({ start: t.start_beat, end: t.end_beat }));
            expect(added).toEqual([{ start: 13, end: 17 }]);
        });
    },
);
