import { expect } from "vitest";
import { and, asc, eq, getTableName, gt, inArray, lt } from "drizzle-orm";
import { createResolver, type Resolver, type XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { loadTimelineFixture } from "@/timeline/fixtures/loadTimelineFixture";
import { GOLDEN_FIXTURES } from "@/timeline/fixtures/goldenFixtures";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { createTimelineShapesInTransaction } from "../timelineShapes";
import {
    createTimelinesInTransaction,
    deleteTimelinesInTransaction,
    timelinesWithRange,
} from "../timelines";
import { createTimelineTransitionsInTransaction } from "../timelineTransitionsInTransaction";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";
import { saveShapeRecipeInTransaction } from "../shapeRecipes";
import { moveMarchersInRangeInTransaction } from "../timelineMoves";
import {
    cutMoveAtBeatInTransaction,
    planRemovalFromRange,
    removeMarchersFromMoveForRangeInTransaction,
    skippedRefusal,
    takeMarchersIntoOwnMoveInTransaction,
    takeMarchersOutOfRangeInTransaction,
} from "../timelineMoveCuts";
import type { BeatRange } from "../timelineMembership";

keepFixturesInPageMode("its tests convert the show themselves");

/**
 * The holds' shared move operations (`timelineMoveCuts`): cut a move in time at a count, and remove
 * marchers from a move for a range of counts. On the converted `marchersAndPages` show, page N's
 * box is `[8N − 7, 8N + 1)` (page 2's is `[9, 17)`), each page move one timeline with one shared
 * shapeless direct transition.
 */

const TABLES = [
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
    schema.timeline_shape_recipes,
    schema.timeline_shape_recipe_marchers,
];

const dataOf = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);

/** Each of `ids`' position at every half beat from 0 to `end`. */
const track = (r: Resolver, ids: readonly number[], end: number): XY[][] =>
    ids.map((id) =>
        Array.from({ length: 2 * end + 1 }, (_, i) => r.positionAt(id, i / 2)),
    );

const expectClose = (a: XY[][], b: XY[][]) => {
    expect(b.length).toBe(a.length);
    a.forEach((row, m) =>
        row.forEach((p, i) => {
            expect(
                Math.abs(p[0] - b[m]![i]![0]),
                `m${m} @${i / 2}`,
            ).toBeLessThan(1e-6);
            expect(
                Math.abs(p[1] - b[m]![i]![1]),
                `m${m} @${i / 2}`,
            ).toBeLessThan(1e-6);
        }),
    );
};

const timelinesSorted = (db: DbConnection) =>
    db
        .select()
        .from(schema.timelines)
        .orderBy(asc(schema.timelines.start_beat), asc(schema.timelines.id))
        .all();

/** `marcherIds`' rows over any beat of `range`. */
const rowsOver = (
    db: DbConnection,
    marcherIds: readonly number[],
    range: BeatRange,
) =>
    db
        .select()
        .from(schema.timeline_assignments)
        .where(
            and(
                inArray(schema.timeline_assignments.marcher_id, [
                    ...marcherIds,
                ]),
                lt(schema.timeline_assignments.start_beat, range.end),
                gt(schema.timeline_assignments.end_beat, range.start),
            ),
        )
        .all();

const PAGE2 = { start: 9, end: 17 };

/** The page move over page 2's box. */
const page2Move = async (db: DbConnection) =>
    (await db
        .select()
        .from(schema.timelines)
        .where(
            and(
                eq(schema.timelines.start_beat, PAGE2.start),
                eq(schema.timelines.end_beat, PAGE2.end),
            ),
        )
        .orderBy(asc(schema.timelines.id))
        .get())!;

/**
 * One shared move over `[1, 25)` (pages 1 to 3) on layer 1, its one shapeless direct transition
 * holding `marcherIds` in order, each heading for a spot of its own.
 */
const longSharedMove = async (db: DbConnection, marcherIds: number[]) =>
    transactionWithHistory(db, "long move", async (tx) => {
        const [t] = await createTimelinesInTransaction({
            tx,
            newTimelines: [{ name: "Long", startBeat: 1, endBeat: 25 }],
        });
        const [made] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: t!.id,
                    slotCount: marcherIds.length,
                    destination: {
                        kind: "individual",
                        points: marcherIds.map(
                            (_, i) => [300 + 40 * i, 200] as XY,
                        ),
                    },
                },
            ],
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: marcherIds.map((marcherId, i) => ({
                marcherId,
                transitionId: made!.id,
                slotIndex: i,
                startBeat: 1,
                endBeat: 25,
                layer: 1,
            })),
        });
        return t!;
    });

/** Deletes every timeline row, so marchers hold on their homes and no page has a move. */
const clearTimelines = (db: DbConnection) =>
    transactionWithHistory(db, "clear", async (tx) => {
        const ids = (
            await tx.select({ id: schema.timelines.id }).from(schema.timelines)
        ).map((r) => r.id);
        await deleteTimelinesInTransaction({ tx, timelineIds: new Set(ids) });
    });

/**
 * A move over `range` named `name`, one transition taking `marcherIds` to spots of their own; with
 * `allowSharedRanges`, over a range another move has too.
 */
const moveOver = async (
    db: DbConnection,
    range: BeatRange,
    marcherIds: number[],
    name: string | null,
    allowSharedRanges = false,
) =>
    transactionWithHistory(db, "move", async (tx) => {
        const [t] = await createTimelinesInTransaction({
            tx,
            newTimelines: [
                { name, startBeat: range.start, endBeat: range.end },
            ],
            allowSharedRanges,
        });
        const [made] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: t!.id,
                    slotCount: marcherIds.length,
                    destination: {
                        kind: "individual",
                        points: marcherIds.map(
                            (_, i) => [100 + 30 * i, 80 + range.end] as XY,
                        ),
                    },
                },
            ],
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: marcherIds.map((marcherId, i) => ({
                marcherId,
                transitionId: made!.id,
                slotIndex: i,
                startBeat: range.start,
                endBeat: range.end,
                layer: 0,
            })),
        });
        return t!;
    });

/** The marchers with a row in move `timelineId`, ascending. */
const membersOf = async (db: DbConnection, timelineId: number) =>
    (
        await db
            .select({ id: schema.timeline_assignments.marcher_id })
            .from(schema.timeline_assignments)
            .innerJoin(
                schema.timeline_transitions,
                eq(
                    schema.timeline_transitions.id,
                    schema.timeline_assignments.transition_id,
                ),
            )
            .where(eq(schema.timeline_transitions.timeline_id, timelineId))
            .all()
    )
        .map((r) => r.id)
        .sort((x, y) => x - y);

const golden = (name: string) =>
    GOLDEN_FIXTURES.find((g) => g.name === name)!.build();

describeDbTests("cut a move in time at a count", (it) => {
    it("mid-move (golden G1): two moves meeting at the count, every position unchanged", async ({
        db,
        marchersAndPages: _,
    }) => {
        const loaded = await loadTimelineFixture(db, golden("G1"));
        const m = loaded.marchers.get(1)!;
        const timelineId = loaded.timelines.get(1)!;
        const before = track(await resolverOf(db), [m], 16);

        const cut = await transactionWithHistory(db, "cut", (tx) =>
            cutMoveAtBeatInTransaction({ tx, timelineId, beat: 5 }),
        );

        expect(cut).not.toBeNull();
        expect(cut!.after.id).toBe(timelineId);
        expect([cut!.before.start_beat, cut!.before.end_beat]).toEqual([0, 5]);
        expect([cut!.after.start_beat, cut!.after.end_beat]).toEqual([5, 16]);
        expectClose(before, track(await resolverOf(db), [m], 16));
    });

    it("at a page flag that already has the page's move: the new part shares the box, numbered", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        // G2's move over [0, 16) with a steal over [8, 16); cut it at page 2's flag, beat 9
        const loaded = await loadTimelineFixture(db, golden("G2"));
        const m = loaded.marchers.get(1)!;
        const timelineId = loaded.timelines.get(1)!;
        const pageMove = await page2Move(db);
        const before = track(await resolverOf(db), [m], 20);

        const cut = await transactionWithHistory(db, "cut", (tx) =>
            cutMoveAtBeatInTransaction({ tx, timelineId, beat: 9 }),
        );

        expect([cut!.before.start_beat, cut!.before.end_beat]).toEqual([0, 9]);
        expect(cut!.before.name).toMatch(/^Move \d+$/);
        expect([cut!.after.start_beat, cut!.after.end_beat]).toEqual([9, 16]);
        expectClose(before, track(await resolverOf(db), [m], 20));
        // The page's own move is untouched, and still the oldest over its box
        expect(await page2Move(db)).toEqual(pageMove);
    });

    it("needs no cut at the move's own ends, or where nobody moves on one side: nothing is written", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        // G5: the marcher only joins the move [0, 16) at beat 8
        const loaded = await loadTimelineFixture(db, golden("G5"));
        const timelineId = loaded.timelines.get(1)!;
        const before = await dataOf(db);

        for (const beat of [0, 16, 20, 4])
            expect(
                await db.transaction((tx) =>
                    cutMoveAtBeatInTransaction({ tx, timelineId, beat }),
                ),
                `beat ${beat}`,
            ).toBeNull();
        expect(await dataOf(db)).toEqual(before);
    });
});

describeDbTests("cut: which part keeps the move's id", (it) => {
    it("the part after would take over a newer page move: the part before keeps the id and name; the transitions after and the shape recipe go with the part after", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await clearTimelines(db);
        const [a, b, c] = (await resolverOf(db)).marcherIds();
        const long = await moveOver(
            db,
            { start: 9, end: 25 },
            [a!, b!],
            "Long",
        );
        await db.transaction((tx) =>
            saveShapeRecipeInTransaction({
                tx,
                timelineId: long.id,
                recipe: {
                    kind: "line",
                    kindVersion: 1,
                    params: {},
                    orderMode: "slot",
                    reverse: false,
                },
                members: [{ marcherId: a!, slot: 0, x: 100, y: 105 }],
            }),
        );
        const page3 = await moveOver(db, { start: 17, end: 25 }, [c!], null);
        const before = track(await resolverOf(db), [a!, b!, c!], 25);

        const cut = (await transactionWithHistory(db, "cut", (tx) =>
            cutMoveAtBeatInTransaction({ tx, timelineId: long.id, beat: 17 }),
        ))!;

        expect(cut.before.id).toBe(long.id);
        expect(cut.before.name).toBe("Long");
        expect([cut.before.start_beat, cut.before.end_beat]).toEqual([9, 17]);
        expect(cut.after.id).toBeGreaterThan(page3.id);
        expect(cut.after.name).toMatch(/^Move \d+$/);
        expect([cut.after.start_beat, cut.after.end_beat]).toEqual([17, 25]);
        const overPage3 = await db.transaction((tx) =>
            timelinesWithRange(tx, { start: 17, end: 25 }),
        );
        expect(overPage3.map((l) => l.id)).toEqual([page3.id, cut.after.id]);
        const recipes = await db
            .select()
            .from(schema.timeline_shape_recipes)
            .all();
        expect(recipes.map((r) => r.timeline_id)).toEqual([cut.after.id]);
        expectClose(before, track(await resolverOf(db), [a!, b!, c!], 25));
    });

    it("both parts would take over a newer page move: neither keeps the id, and the original goes", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        await clearTimelines(db);
        const [a, b, c, d] = (await resolverOf(db)).marcherIds();
        const long = await moveOver(
            db,
            { start: 9, end: 25 },
            [a!, b!],
            "Long",
        );
        const page2 = await moveOver(db, PAGE2, [c!], null);
        const page3 = await moveOver(db, { start: 17, end: 25 }, [d!], null);
        const ids = [a!, b!, c!, d!];
        const before = track(await resolverOf(db), ids, 25);

        const cut = (await transactionWithHistory(db, "cut", (tx) =>
            cutMoveAtBeatInTransaction({ tx, timelineId: long.id, beat: 17 }),
        ))!;

        expect(cut.before.id).toBeGreaterThan(page3.id);
        expect(cut.after.id).toBeGreaterThan(page3.id);
        expect(
            await db
                .select()
                .from(schema.timelines)
                .where(eq(schema.timelines.id, long.id))
                .get(),
        ).toBeUndefined();
        for (const [range, own] of [
            [PAGE2, page2],
            [{ start: 17, end: 25 }, page3],
        ] as const)
            expect(
                (
                    await db.transaction((tx) => timelinesWithRange(tx, range))
                )[0]!.id,
            ).toBe(own.id);
        expectClose(before, track(await resolverOf(db), ids, 25));
    });
});

describeDbTests("remove marchers from a move for a range of counts", (it) => {
    it("the preview writes nothing and says what the removal then does; the removal returns the piece they left", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const [a, b, c] = (await resolverOf(db)).marcherIds();
        const long = await longSharedMove(db, [a!, b!, c!]);
        const before = await dataOf(db);

        const plan = await db.transaction((tx) =>
            planRemovalFromRange({ tx, marcherIds: [a!, c!], range: PAGE2 }),
        );

        expect(await dataOf(db)).toEqual(before);
        const leaving = [a!, c!].sort((x, y) => x - y);
        const pageMove = await page2Move(db);
        expect(plan).toEqual({
            removed: leaving,
            skipped: [],
            moves: [
                // The page's own move over exactly the range needs no cut
                {
                    timelineId: pageMove.id,
                    removed: leaving,
                    intoOwnMove: false,
                    cuts: [],
                },
                // A direct path: cut for everyone, since that changes nobody's motion
                {
                    timelineId: long.id,
                    removed: leaving,
                    intoOwnMove: false,
                    cuts: [
                        { timelineId: long.id, beat: 9, idStaysWith: "after" },
                        { timelineId: long.id, beat: 17, idStaysWith: "after" },
                    ],
                },
            ],
        });

        const result = await transactionWithHistory(db, "take out", (tx) =>
            takeMarchersOutOfRangeInTransaction({
                tx,
                marcherIds: [a!, c!],
                range: PAGE2,
            }),
        );

        expect(result.removed).toEqual(plan.removed);
        expect(result.cuts.map((cut) => cut.before.end_beat)).toEqual([9, 17]);
        expect(result.pieces).toEqual([
            { timelineId: pageMove.id, pieceId: pageMove.id, deleted: false },
            {
                timelineId: long.id,
                pieceId: result.cuts[1]!.before.id,
                deleted: false,
            },
        ]);
        const piece = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.id, result.pieces[1]!.pieceId))
            .get())!;
        expect([piece.start_beat, piece.end_beat]).toEqual([
            PAGE2.start,
            PAGE2.end,
        ]);
    });

    it("a range inside a shared move: a direct path is cut at both ends for everyone, the marcher leaves the middle, the others keep their motion", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const all = (await resolverOf(db)).marcherIds();
        const [a, b, c] = all;
        const long = await longSharedMove(db, [a!, b!, c!]);
        const r0 = await resolverOf(db);
        const before = track(r0, all, 30);
        const bAt9 = r0.positionAt(b!, 9);
        const bAt25 = r0.positionAt(b!, 25);

        const result = await transactionWithHistory(db, "remove", (tx) =>
            removeMarchersFromMoveForRangeInTransaction({
                tx,
                timelineId: long.id,
                marcherIds: [b!],
                range: PAGE2,
            }),
        );

        expect(result.removed).toEqual([b]);
        expect(result.skipped).toEqual([]);
        expect(
            result.cuts.map((c) => [c.before.start_beat, c.before.end_beat]),
        ).toEqual([
            [1, 9],
            [9, 17],
        ]);
        // Three parts; the original keeps its id as the last
        const parts = (await timelinesSorted(db)).filter((t) =>
            [long.id, ...result.cuts.map((c) => c.before.id)].includes(t.id),
        );
        expect(parts.map((t) => [t.start_beat, t.end_beat])).toEqual([
            [1, 9],
            [9, 17],
            [17, 25],
        ]);
        expect(parts[2]!.id).toBe(long.id);
        // b has no row over the page: on its stored layer-1 rows nothing covers [9, 17)
        expect(
            (await rowsOver(db, [b!], PAGE2)).filter((r) => r.layer === 1),
        ).toEqual([]);
        // The middle part's transition is compacted to the two who stay
        const middle = await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.timeline_id, parts[1]!.id))
            .all();
        expect(middle.map((t) => t.slot_count)).toEqual([2]);

        const r1 = await resolverOf(db);
        const after = track(r1, all, 30);
        all.forEach((id, m) => {
            if (id === b) return;
            expectClose([before[m]!], [after[m]!]);
        });
        // b: unchanged before the page, then it follows the page move under it (layer 0) from
        // where it is at 9, and after the page it still arrives where the long move took it
        const bm = all.indexOf(b!);
        expectClose([before[bm]!.slice(0, 19)], [after[bm]!.slice(0, 19)]);
        expect(r1.positionAt(b!, 9)).toEqual(bAt9);
        expect(r1.positionAt(b!, 25)).toEqual(bAt25);
    });

    it("the move's whole membership leaves a range inside it: the move itself is cut, the original keeping its id as the last part", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const [a, b] = (await resolverOf(db)).marcherIds();
        const long = await longSharedMove(db, [a!, b!]);

        const result = await transactionWithHistory(db, "remove", (tx) =>
            removeMarchersFromMoveForRangeInTransaction({
                tx,
                timelineId: long.id,
                marcherIds: [a!, b!],
                range: PAGE2,
            }),
        );

        expect(result.removed).toEqual([a!, b!].sort((x, y) => x - y));
        expect(result.cuts.map((c) => c.after.id)).toEqual([long.id, long.id]);
        expect(result.pieces).toEqual([
            {
                timelineId: long.id,
                pieceId: result.cuts[1]!.before.id,
                deleted: true,
            },
        ]);
        const parts = (await timelinesSorted(db)).filter((t) =>
            [long.id, result.cuts[0]!.before.id].includes(t.id),
        );
        expect(parts.map((t) => [t.start_beat, t.end_beat])).toEqual([
            [1, 9],
            [17, 25],
        ]);
    });

    it("a move over exactly the range (a converted page's shared move): no cut, the slot compacted", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const all = (await resolverOf(db)).marcherIds();
        const pageMove = await page2Move(db);
        const [transition] = await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.timeline_id, pageMove.id))
            .all();
        const r0 = await resolverOf(db);
        const before = track(r0, all, 30);
        const m = all[1]!;

        const result = await transactionWithHistory(db, "remove", (tx) =>
            removeMarchersFromMoveForRangeInTransaction({
                tx,
                timelineId: pageMove.id,
                marcherIds: [m],
                range: PAGE2,
            }),
        );

        expect(result).toMatchObject({ removed: [m], skipped: [], cuts: [] });
        expect(await rowsOver(db, [m], PAGE2)).toEqual([]);
        const after = await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, transition!.id))
            .get();
        expect(after!.slot_count).toBe(transition!.slot_count - 1);
        // m stands where page 1 left it through page 2; everyone else keeps every position
        const r1 = await resolverOf(db);
        for (let beat = 9; beat <= 17; beat++)
            expect(r1.positionAt(m, beat)).toEqual(r0.positionAt(m, 9));
        const tracks = track(r1, all, 8);
        all.forEach((id, i) => {
            if (id !== m) expectClose([before[i]!.slice(0, 17)], [tracks[i]!]);
        });
    });

    it("shape recipe and follow-the-leader members stay and are named; the others leave", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const all = (await resolverOf(db)).marcherIds();
        const [a, b, c] = all;
        const pageMove = await page2Move(db);
        // Set up outside the history: a recipe alone writes no tracked row
        await db.transaction((tx) =>
            saveShapeRecipeInTransaction({
                tx,
                timelineId: pageMove.id,
                recipe: {
                    kind: "line",
                    kindVersion: 1,
                    params: {},
                    orderMode: "slot",
                    reverse: false,
                },
                members: [{ marcherId: a!, slot: 0, x: 10, y: 10 }],
            }),
        );
        // G6: four marchers in a line (T1, a stored shape) then follow-the-leader (T2, [4, 12))
        const g6 = await loadTimelineFixture(db, golden("G6"));
        const leaders = [1, 2, 3, 4].map((id) => g6.marchers.get(id)!);

        const result = await transactionWithHistory(db, "take out", (tx) =>
            takeMarchersOutOfRangeInTransaction({
                tx,
                marcherIds: [a!, b!, c!, leaders[0]!],
                range: PAGE2,
            }),
        );

        expect(result.removed).toEqual([b, c].sort((x, y) => x! - y!));
        expect(result.skipped.map((s) => [s.marcherId, s.reason])).toEqual(
            [
                [a!, "shape"],
                [leaders[0]!, "followTheLeader"],
            ].sort((x, y) => (x[0] as number) - (y[0] as number)),
        );
        expect(await rowsOver(db, [b!, c!], PAGE2)).toEqual([]);
        expect(await rowsOver(db, [a!], PAGE2)).toHaveLength(1);
        expect(await rowsOver(db, [leaders[0]!], PAGE2)).toHaveLength(1);

        const refusal = await db.transaction((tx) =>
            skippedRefusal(tx, result.skipped),
        );
        expect(refusal!.refusal).toBe("inShapeOrFollowTheLeader");
        expect(refusal!.marcherIds).toEqual(
            [a!, leaders[0]!].sort((x, y) => x - y),
        );
        expect(refusal!.message).toMatch(
            /is in a shape, and FX\d+ follows the leader, so they keep their move here\.$/,
        );
    });

    it("one undo step restores every row the cuts and the removal wrote", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const [a, b, c] = (await resolverOf(db)).marcherIds();
        await longSharedMove(db, [a!, b!, c!]);
        const before = await dataOf(db);

        await transactionWithHistory(db, "take out", (tx) =>
            takeMarchersOutOfRangeInTransaction({
                tx,
                marcherIds: [a!, c!],
                range: PAGE2,
            }),
        );
        expect(await dataOf(db)).not.toEqual(before);

        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await dataOf(db)).toEqual(before);
    });
});

describeDbTests(
    "take marchers out of a move into a move of their own",
    (it) => {
        it("they leave for a new move over the same counts, and everyone keeps every position", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            const all = (await resolverOf(db)).marcherIds();
            const [a, b] = all;
            const pageMove = await page2Move(db);
            const before = track(await resolverOf(db), all, 30);

            const result = await transactionWithHistory(db, "take", (tx) =>
                takeMarchersIntoOwnMoveInTransaction({
                    tx,
                    timelineId: pageMove.id,
                    marcherIds: [b!, a!],
                }),
            );

            expect(result.taken).toEqual([a, b]);
            expect(result.stayed).toEqual([]);
            expect(result.timelineId).not.toBe(pageMove.id);
            const own = (await db
                .select()
                .from(schema.timelines)
                .where(eq(schema.timelines.id, result.timelineId!))
                .get())!;
            expect({ start: own.start_beat, end: own.end_beat }).toEqual(PAGE2);
            expect(await membersOf(db, own.id)).toEqual([a, b]);
            expectClose(before, track(await resolverOf(db), all, 30));
        });

        it("the move's whole membership: it already is their own, so nothing is written", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            const all = (await resolverOf(db)).marcherIds();
            const pageMove = await page2Move(db);
            const before = await dataOf(db);

            // Nothing to write, so outside the history (an empty edit is refused there)
            const result = await db.transaction((tx) =>
                takeMarchersIntoOwnMoveInTransaction({
                    tx,
                    timelineId: pageMove.id,
                    marcherIds: all,
                }),
            );

            expect(result).toEqual({
                taken: all,
                stayed: [],
                timelineId: pageMove.id,
            });
            expect(await dataOf(db)).toEqual(before);
        });

        it("a shape recipe member stays and is named; nobody left to take writes nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            const [a, b] = (await resolverOf(db)).marcherIds();
            const pageMove = await page2Move(db);
            await db.transaction((tx) =>
                saveShapeRecipeInTransaction({
                    tx,
                    timelineId: pageMove.id,
                    recipe: {
                        kind: "line",
                        kindVersion: 1,
                        params: {},
                        orderMode: "slot",
                        reverse: false,
                    },
                    members: [{ marcherId: a!, slot: 0, x: 10, y: 10 }],
                }),
            );
            const before = await dataOf(db);

            const alone = await db.transaction((tx) =>
                takeMarchersIntoOwnMoveInTransaction({
                    tx,
                    timelineId: pageMove.id,
                    marcherIds: [a!],
                }),
            );
            expect(alone).toEqual({
                taken: [],
                stayed: [
                    { marcherId: a, timelineId: pageMove.id, reason: "shape" },
                ],
                timelineId: null,
            });
            expect(await dataOf(db)).toEqual(before);

            const both = await transactionWithHistory(db, "take", (tx) =>
                takeMarchersIntoOwnMoveInTransaction({
                    tx,
                    timelineId: pageMove.id,
                    marcherIds: [a!, b!],
                }),
            );
            expect(both.taken).toEqual([b]);
            expect(both.stayed.map((s) => s.marcherId)).toEqual([a]);
            expect(await membersOf(db, pageMove.id)).toContain(a);
            expect(await membersOf(db, both.timelineId!)).toEqual([b]);
        });
    },
);

describeDbTests("the drag back (holds decision 16)", (it) => {
    it("skips and names a shape member: it keeps its move, untouched; the others are taken out", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const [a, b] = (await resolverOf(db)).marcherIds();
        const pageMove = await page2Move(db);
        await db.transaction((tx) =>
            saveShapeRecipeInTransaction({
                tx,
                timelineId: pageMove.id,
                recipe: {
                    kind: "line",
                    kindVersion: 1,
                    params: {},
                    orderMode: "slot",
                    reverse: false,
                },
                members: [{ marcherId: a!, slot: 0, x: 10, y: 10 }],
            }),
        );
        const r = await resolverOf(db);
        const back = [a!, b!].map((marcherId) => {
            const [x, y] = r.positionAt(marcherId, PAGE2.start);
            return { marcherId, x, y };
        });
        expect(r.positionAt(a!, PAGE2.end)).not.toEqual(
            r.positionAt(a!, PAGE2.start),
        );
        const aRows = await rowsOver(db, [a!], PAGE2);
        const aTrack = track(r, [a!], 33);

        const result = await transactionWithHistory(db, "drag back", (tx) =>
            moveMarchersInRangeInTransaction({ tx, range: PAGE2, moves: back }),
        );

        expect(result.cleared).toEqual([b]);
        expect(result.skipped!.refusal).toBe("inShapeOrFollowTheLeader");
        expect(result.skipped!.marcherIds).toEqual([a]);
        expect(result.skipped!.message).toMatch(
            /^\S+ is in a shape, so it keeps its move here\.$/,
        );
        expect(result.slots).toEqual([]);
        expect(await rowsOver(db, [b!], PAGE2)).toEqual([]);
        expect(await rowsOver(db, [a!], PAGE2)).toEqual(aRows);
        expectClose(aTrack, track(await resolverOf(db), [a!], 33));
    });
});

describeDbTests(
    "Clear this page on part of a shared move (holds decision 16: other pages keep their motion)",
    (it) => {
        const PAGE3 = { start: 17, end: 25 };
        const ARC = { start: 17, end: 41 };

        /**
         * One arc move over `[17, 41)` (pages 3 to 5) on layer 1, the only move in the show, its one
         * transition holding `marcherIds` in order, with a line recipe for every one of them but
         * the first.
         */
        const arcShow = async (db: DbConnection) => {
            await convertPagesToTimeline(db);
            await clearTimelines(db);
            const [a, b, c] = (await resolverOf(db)).marcherIds();
            const ids = [a!, b!, c!];
            const arc = await transactionWithHistory(db, "arc", async (tx) => {
                const [t] = await createTimelinesInTransaction({
                    tx,
                    newTimelines: [
                        { name: "Arc", startBeat: ARC.start, endBeat: ARC.end },
                    ],
                });
                const [made] = await createTimelineTransitionsInTransaction({
                    tx,
                    newTransitions: [
                        {
                            timelineId: t!.id,
                            slotCount: ids.length,
                            destination: {
                                kind: "individual",
                                points: ids.map(
                                    (_, i) => [400 + 40 * i, 300] as XY,
                                ),
                            },
                            pathStyle: "arc",
                            pathParams: { bulge: 0.4 },
                        },
                    ],
                });
                await createTimelineAssignmentsInTransaction({
                    tx,
                    newAssignments: ids.map((marcherId, i) => ({
                        marcherId,
                        transitionId: made!.id,
                        slotIndex: i,
                        startBeat: ARC.start,
                        endBeat: ARC.end,
                        layer: 1,
                    })),
                });
                return t!;
            });
            await db.transaction((tx) =>
                saveShapeRecipeInTransaction({
                    tx,
                    timelineId: arc.id,
                    recipe: {
                        kind: "line",
                        kindVersion: 1,
                        params: {},
                        orderMode: "slot",
                        reverse: false,
                    },
                    members: [
                        { marcherId: b!, slot: 1, x: 440, y: 300 },
                        { marcherId: c!, slot: 2, x: 480, y: 300 },
                    ],
                }),
            );
            return { arc, a: a!, b: b!, c: c!, ids };
        };

        /** Each count's position of `id` from 17 to 41. */
        const counts = (r: Resolver, id: number): XY[] =>
            Array.from({ length: ARC.end - ARC.start + 1 }, (_, i) =>
                r.positionAt(id, ARC.start + i),
            );

        /** What a marcher's rows and moves are, slot indexes aside. */
        const rowsOf = async (db: DbConnection, id: number) =>
            (
                await db
                    .select({
                        id: schema.timeline_assignments.id,
                        transitionId: schema.timeline_assignments.transition_id,
                        start: schema.timeline_assignments.start_beat,
                        end: schema.timeline_assignments.end_beat,
                        layer: schema.timeline_assignments.layer,
                        timelineId: schema.timeline_transitions.timeline_id,
                        pathStyle: schema.timeline_transitions.path_style,
                        pathParams: schema.timeline_transitions.path_params,
                    })
                    .from(schema.timeline_assignments)
                    .innerJoin(
                        schema.timeline_transitions,
                        eq(
                            schema.timeline_transitions.id,
                            schema.timeline_assignments.transition_id,
                        ),
                    )
                    .where(eq(schema.timeline_assignments.marcher_id, id))
                    .all()
            ).sort((x, y) => x.id - y.id);

        const clearPage3 = (db: DbConnection, marcherId: number) =>
            transactionWithHistory(db, "clear page", async (tx) => {
                const r = createResolver(
                    (await readTimelineTables(tx)).snapshot,
                );
                const [x, y] = r.positionAt(marcherId, PAGE3.start);
                return moveMarchersInRangeInTransaction({
                    tx,
                    range: PAGE3,
                    moves: [{ marcherId, x, y }],
                    clearPage: true,
                });
            });

        /**
         * A follow-the-leader move over `range` onto a line, `ids` in its one transition, whose
         * order it inherits from the move before (R-12).
         */
        const followTheLeaderAfter = (
            db: DbConnection,
            ids: number[],
            range: BeatRange,
        ) =>
            transactionWithHistory(db, "ftl", async (tx) => {
                const [t] = await createTimelinesInTransaction({
                    tx,
                    newTimelines: [
                        {
                            name: "Ftl",
                            startBeat: range.start,
                            endBeat: range.end,
                        },
                    ],
                });
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
                const [made] = await createTimelineTransitionsInTransaction({
                    tx,
                    newTransitions: [
                        {
                            timelineId: t!.id,
                            slotCount: ids.length,
                            destination: { kind: "shape", shapeId: shape!.id },
                            pathStyle: "follow_the_leader",
                            pathParams: { waypoints: [] },
                            orderMode: "inherit",
                        },
                    ],
                });
                await createTimelineAssignmentsInTransaction({
                    tx,
                    newAssignments: ids.map((marcherId, i) => ({
                        marcherId,
                        transitionId: made!.id,
                        slotIndex: i,
                        startBeat: range.start,
                        endBeat: range.end,
                        layer: 1,
                    })),
                });
            });

        it("the others keep their move, rows, arc, recipe and every count; the cleared marcher's move alone is cut", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { arc, a, b, c } = await arcShow(db);
            const r0 = await resolverOf(db);
            const kept = [b, c];
            const before = kept.map((id) => counts(r0, id));
            const rowsBefore = await Promise.all(
                kept.map((id) => rowsOf(db, id)),
            );
            const recipesBefore = await db
                .select()
                .from(schema.timeline_shape_recipes)
                .all();
            const recipeMembersBefore = await db
                .select()
                .from(schema.timeline_shape_recipe_marchers)
                .all();
            const aAt25 = r0.positionAt(a, 25);
            const aAt41 = r0.positionAt(a, 41);

            const result = await clearPage3(db, a);

            expect(result.cleared).toEqual([a]);
            expect(result.skipped).toBeUndefined();
            const r1 = await resolverOf(db);
            expectClose(
                before,
                kept.map((id) => counts(r1, id)),
            );
            expect(await Promise.all(kept.map((id) => rowsOf(db, id)))).toEqual(
                rowsBefore,
            );
            expect(await membersOf(db, arc.id)).toEqual(kept);
            expect(
                await db.select().from(schema.timeline_shape_recipes).all(),
            ).toEqual(recipesBefore);
            expect(
                await db
                    .select()
                    .from(schema.timeline_shape_recipe_marchers)
                    .all(),
            ).toEqual(recipeMembersBefore);
            // a: Not set over page 3, then its own move on to where the arc took it
            expect(await rowsOver(db, [a], PAGE3)).toEqual([]);
            for (let beat = PAGE3.start; beat <= PAGE3.end; beat++)
                expect(r1.positionAt(a, beat)).toEqual(
                    r0.positionAt(a, PAGE3.start),
                );
            expect(r1.positionAt(a, 41)).toEqual(aAt41);
            expect(aAt25).not.toEqual(r0.positionAt(a, PAGE3.start));
            const aRows = await rowsOf(db, a);
            expect(aRows.map((r) => [r.start, r.end])).toEqual([[25, 41]]);
            expect(aRows[0]!.timelineId).not.toBe(arc.id);
        });

        it("one undo step puts back every row, and redo does it again exactly", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await arcShow(db);
            const before = await dataOf(db);

            await clearPage3(db, a);
            const done = await dataOf(db);
            expect(done).not.toEqual(before);

            const undo = await performUndo(db);
            expect(undo.success, undo.error?.message).toBe(true);
            expect(await dataOf(db)).toEqual(before);
            const redo = await performRedo(db);
            expect(redo.success, redo.error?.message).toBe(true);
            expect(await dataOf(db)).toEqual(done);
        });

        it("a marcher split by marcher can't take out (an inheriting follow-the-leader order) keeps its move and is named; nothing is cut", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, ids } = await arcShow(db);
            // The next move walks follow-the-leader in the arc's order (R-12)
            await followTheLeaderAfter(db, ids, { start: 41, end: 49 });
            const before = await dataOf(db);

            // Nothing to write, so outside the history (an empty edit is refused there)
            const result = await db.transaction(async (tx) => {
                const r = createResolver(
                    (await readTimelineTables(tx)).snapshot,
                );
                const [x, y] = r.positionAt(a, PAGE3.start);
                return moveMarchersInRangeInTransaction({
                    tx,
                    range: PAGE3,
                    moves: [{ marcherId: a, x, y }],
                    clearPage: true,
                });
            });

            expect(result.cleared).toBeUndefined();
            expect(result.skipped!.marcherIds).toEqual([a]);
            expect(result.skipped!.message).toMatch(
                /^\S+ shares a curved move with a follow-the-leader order, so it keeps its move here\.$/,
            );
            expect(await dataOf(db)).toEqual(before);
        });
        it("a direct path shared with a follow-the-leader order elsewhere is still cut for everyone, as it changes nobody's motion", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            await clearTimelines(db);
            const all = (await resolverOf(db)).marcherIds();
            const [a, b, c] = all;
            const ids = [a!, b!, c!];
            // A direct move over pages 3 to 5, then follow the leader in its order
            const direct = await moveOver(db, ARC, ids, "Direct");
            await followTheLeaderAfter(db, ids, { start: 41, end: 49 });
            const r0 = await resolverOf(db);
            const before = track(r0, all, 50);

            const result = await clearPage3(db, a!);

            expect(result.cleared).toEqual([a]);
            expect(result.skipped).toBeUndefined();
            expect(await rowsOver(db, [a!], PAGE3)).toEqual([]);
            const after = track(await resolverOf(db), all, 50);
            all.forEach((id, m) => {
                if (id === a) return;
                expectClose([before[m]!], [after[m]!]);
            });
            // Cut for everyone: the original keeps its id as the part after the page
            const kept = (await timelinesSorted(db)).find(
                (t) => t.id === direct.id,
            )!;
            expect([kept.start_beat, kept.end_beat]).toEqual([
                PAGE3.end,
                ARC.end,
            ]);
            expect(await membersOf(db, direct.id)).toEqual(
                [...ids].sort((x, y) => x - y),
            );
        });
        it("clearing several moves at once: a part of a cut never takes over the move a part of another made over a page, and the preview says so", async ({
            db,
            marchersAndPages: _,
        }) => {
            await convertPagesToTimeline(db);
            await clearTimelines(db);
            const [a, b, d] = (await resolverOf(db)).marcherIds();
            const range = { start: 17, end: 33 };
            // Move A (a, b) on an arc, then move B (d) direct, both over pages 3 and 4
            const moveA = await transactionWithHistory(db, "A", async (tx) => {
                const [t] = await createTimelinesInTransaction({
                    tx,
                    newTimelines: [
                        {
                            name: "A",
                            startBeat: range.start,
                            endBeat: range.end,
                        },
                    ],
                });
                const [made] = await createTimelineTransitionsInTransaction({
                    tx,
                    newTransitions: [
                        {
                            timelineId: t!.id,
                            slotCount: 2,
                            destination: {
                                kind: "individual",
                                points: [
                                    [400, 300],
                                    [440, 300],
                                ],
                            },
                            pathStyle: "arc",
                            pathParams: { bulge: 0.4 },
                        },
                    ],
                });
                await createTimelineAssignmentsInTransaction({
                    tx,
                    newAssignments: [a!, b!].map((marcherId, i) => ({
                        marcherId,
                        transitionId: made!.id,
                        slotIndex: i,
                        startBeat: range.start,
                        endBeat: range.end,
                        layer: 1,
                    })),
                });
                return t!;
            });
            const moveB = await moveOver(db, range, [d!], "B", true);
            const PAGE4 = { start: 25, end: 33 };

            const plan = await db.transaction((tx) =>
                planRemovalFromRange({
                    tx,
                    marcherIds: [a!, d!],
                    range: PAGE3,
                }),
            );
            const result = await transactionWithHistory(db, "clear", (tx) =>
                takeMarchersOutOfRangeInTransaction({
                    tx,
                    marcherIds: [a!, d!],
                    range: PAGE3,
                }),
            );

            // a's own move is cut at page 4's flag first, so B's part after it would be the oldest
            // over page 4's box: the part before keeps B's id, and goes empty with d
            expect(plan.moves.map((m) => [m.intoOwnMove, m.cuts])).toEqual([
                [
                    true,
                    [{ timelineId: moveA.id, beat: 25, idStaysWith: "after" }],
                ],
                [
                    false,
                    [{ timelineId: moveB.id, beat: 25, idStaysWith: "before" }],
                ],
            ]);
            expect(result.cuts[1]!.before.id).toBe(moveB.id);
            const overPage4 = await db.transaction((tx) =>
                timelinesWithRange(tx, PAGE4),
            );
            expect(overPage4).toHaveLength(2);
            expect(overPage4.map((t) => t.id)).not.toContain(moveB.id);
            // Page 4's move is a's own part, not a part of B taking over
            expect(await membersOf(db, overPage4[0]!.id)).toEqual([a]);
            expect(await membersOf(db, overPage4[1]!.id)).toEqual([d]);
        });
    },
);
