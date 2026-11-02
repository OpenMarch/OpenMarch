import { expect } from "vitest";
import { refusalText } from "@/test/refusalText";
import { asc, eq, getTableName } from "drizzle-orm";
import { createResolver, type Resolver } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { TimelineWriteError } from "../timelineErrors";
import { createTimelinesInTransaction } from "../timelines";
import { createTimelineShapesInTransaction } from "../timelineShapes";
import {
    createTimelineTransitionsInTransaction,
    setTimelineTransitionDestinationInTransaction,
    updateTimelineTransitionsInTransaction,
} from "../timelineTransitionsInTransaction";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";
import { markAssignmentsKeptInTransaction } from "../timelineKeptMarkers";
import { splitTimelineAtBeat } from "../timelineSplitAtBeat";
import { splitMarchersIntoNewMove } from "../timelineSplitMoves";

keepFixturesInPageMode("its tests convert the show themselves");

/**
 * **Split at playhead** (UI-27) on the converted `marchersAndPages` show: pages 1 to 6 of 8
 * counts each, so page N's box is `[8N − 7, 8N + 1)` and page 2's is `[9, 17)`, with one
 * timeline and one shapeless direct transition per page move, every marcher in it.
 */

const TABLES = [
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
    schema.timeline_kept_assignments,
];

const dataOf = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const snapshot = async (db: DbConnection) => ({
    data: await dataOf(db),
    undo: await db.select().from(schema.history_undo).all(),
    redo: await db.select().from(schema.history_redo).all(),
});

const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);

/** Every marcher's position at each half beat from 0 to `end`. */
const positions = (r: Resolver, end: number) =>
    r
        .marcherIds()
        .map((id) =>
            Array.from({ length: 2 * end + 1 }, (_, i) =>
                r.positionAt(id, i / 2),
            ),
        );

const expectSamePositions = (
    a: ReturnType<typeof positions>,
    b: ReturnType<typeof positions>,
    tolerance: number,
) => {
    expect(b.length).toBe(a.length);
    a.forEach((row, m) =>
        row.forEach((p, i) => {
            expect(Math.abs(p[0] - b[m]![i]![0])).toBeLessThan(tolerance);
            expect(Math.abs(p[1] - b[m]![i]![1])).toBeLessThan(tolerance);
        }),
    );
};

/** Page 2's timeline, over [9, 17), and its one transition. */
const page2 = async (db: DbConnection) => {
    const timeline = (await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.start_beat, 9))
        .get())!;
    expect(timeline.end_beat).toBe(17);
    const transition = (await db
        .select()
        .from(schema.timeline_transitions)
        .where(eq(schema.timeline_transitions.timeline_id, timeline.id))
        .get())!;
    return { timeline, transition };
};

const timelinesSorted = (db: DbConnection) =>
    db
        .select()
        .from(schema.timelines)
        .orderBy(asc(schema.timelines.start_beat), asc(schema.timelines.id))
        .all();

const rowsOf = (db: DbConnection, transitionId: number) =>
    db
        .select()
        .from(schema.timeline_assignments)
        .where(eq(schema.timeline_assignments.transition_id, transitionId))
        .orderBy(asc(schema.timeline_assignments.slot_index))
        .all();

const transitionsOf = (db: DbConnection, timelineId: number) =>
    db
        .select()
        .from(schema.timeline_transitions)
        .where(eq(schema.timeline_transitions.timeline_id, timelineId))
        .orderBy(asc(schema.timeline_transitions.id))
        .all();

const expectRefused = async (
    db: DbConnection,
    write: () => Promise<unknown>,
    message: RegExp,
) => {
    const before = await snapshot(db);
    const error = await write().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe("E-ARGS");
    expect(refusalText(error)).toMatch(message);
    expect(await snapshot(db)).toEqual(before);
};

/** A one-marcher move over `[start, end)` on layer 1, heading for `point`. */
const overlay = (
    db: DbConnection,
    marcherId: number,
    start: number,
    end: number,
    point: [number, number],
) =>
    transactionWithHistory(db, "overlay", async (tx) => {
        const [t] = await createTimelinesInTransaction({
            tx,
            newTimelines: [{ startBeat: start, endBeat: end }],
        });
        const [made] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: t!.id,
                    slotCount: 1,
                    destination: { kind: "individual", points: [point] },
                },
            ],
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: [
                {
                    marcherId,
                    transitionId: made!.id,
                    slotIndex: 0,
                    startBeat: start,
                    endBeat: end,
                    layer: 1,
                },
            ],
        });
    });

describeDbTests("Split at playhead (UI-27)", (it) => {
    it("a direct move splits into two that play exactly as the one did", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const { timeline, transition } = await page2(db);
        const before = positions(await resolverOf(db), 48);
        const original = await snapshot(db);

        const result = await splitTimelineAtBeat({
            db,
            timelineId: timeline.id,
            beat: 13,
        });
        expect(result.motionChanged).toEqual([]);
        expect(result.before).toMatchObject({ start_beat: 9, end_beat: 13 });
        expect(result.after).toMatchObject({
            id: timeline.id,
            start_beat: 13,
            end_beat: 17,
            name: timeline.name,
        });
        // The new move is named like any new move; the page's own stays unnamed
        expect(result.before.name).toMatch(/^Move \d+$/);

        const after = await resolverOf(db);
        expectSamePositions(before, positions(after, 48), 1e-9);

        // One shapeless direct transition before, holding where everyone was at the beat
        const [made] = await transitionsOf(db, result.before.id);
        expect(made).toMatchObject({
            path_style: "direct",
            dest_shape_id: null,
            start_beat: 9,
            end_beat: 13,
        });
        const firstRows = await rowsOf(db, made!.id);
        const secondRows = await rowsOf(db, transition.id);
        expect(
            firstRows.map((r) => r.marcher_id).sort((a, b) => a - b),
        ).toEqual(secondRows.map((r) => r.marcher_id).sort((a, b) => a - b));
        expect(
            firstRows.every((r) => r.start_beat === 9 && r.end_beat === 13),
        ).toBe(true);
        expect(
            secondRows.every((r) => r.start_beat === 13 && r.end_beat === 17),
        ).toBe(true);
        const points = await db
            .select()
            .from(schema.timeline_slot_destinations)
            .where(
                eq(schema.timeline_slot_destinations.transition_id, made!.id),
            )
            .orderBy(asc(schema.timeline_slot_destinations.slot_index))
            .all();
        expect(points.length).toBe(firstRows.length);
        firstRows.forEach((row, slot) => {
            const [x, y] = after.positionAt(row.marcher_id, 13);
            expect(points[slot]!.x).toBeCloseTo(x, 9);
            expect(points[slot]!.y).toBeCloseTo(y, 9);
        });

        // One undoable edit
        const split = await snapshot(db);
        await performUndo(db);
        expect((await snapshot(db)).data).toEqual(original.data);
        await performRedo(db);
        expect((await snapshot(db)).data).toEqual(split.data);
    });

    it("a row another move cuts before the beat keeps each piece's line", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const { timeline, transition } = await page2(db);
        const [cut] = await rowsOf(db, transition.id);
        const m = cut!.marcher_id;
        // Two one-marcher moves on a higher layer cut the row into three pieces before 15:
        // [9, 10), [11, 12) and [13, 17), each starting where the other move left the marcher
        await overlay(db, m, 10, 11, [123, 456]);
        await overlay(db, m, 12, 13, [-200, 80]);
        const before = positions(await resolverOf(db), 48);
        const original = await snapshot(db);

        const result = await splitTimelineAtBeat({
            db,
            timelineId: timeline.id,
            beat: 15,
        });
        expect(result.motionChanged).toEqual([]);
        expectSamePositions(before, positions(await resolverOf(db), 48), 1e-9);

        // The counterpart holds the last piece; each earlier piece has a transition of its own
        const made = await transitionsOf(db, result.before.id);
        expect(made.length).toBe(3);
        const piecesOfM = (await Promise.all(made.map((t) => rowsOf(db, t.id))))
            .flat()
            .filter((r) => r.marcher_id === m)
            .map((r) => [r.start_beat, r.end_beat])
            .sort((a, b) => a[0]! - b[0]!);
        expect(piecesOfM).toEqual([
            [9, 10],
            [11, 12],
            [13, 15],
        ]);
        expect(made.every((t) => t.path_style === "direct")).toBe(true);

        await performUndo(db);
        expect((await snapshot(db)).data).toEqual(original.data);
    });

    it("rows ending before the beat, or hidden over it, play as they did", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const { timeline, transition } = await page2(db);
        const [short, covered] = await rowsOf(db, transition.id);
        await transactionWithHistory(db, "short row", (tx) =>
            tx
                .update(schema.timeline_assignments)
                .set({ end_beat: 11 })
                .where(eq(schema.timeline_assignments.id, short!.id)),
        );
        await overlay(db, covered!.marcher_id, 12, 15, [40, -40]);
        const before = positions(await resolverOf(db), 48);

        const result = await splitTimelineAtBeat({
            db,
            timelineId: timeline.id,
            beat: 13,
        });
        expect(result.motionChanged).toEqual([]);
        expectSamePositions(before, positions(await resolverOf(db), 48), 1e-9);
    });

    it("a move split off a page's move by marchers splits at the playhead, leaving the page's (UI-25)", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const { timeline: page, transition } = await page2(db);
        const rows = await rowsOf(db, transition.id);
        const off = await splitMarchersIntoNewMove({
            db,
            timelineId: page.id,
            marcherIds: rows.slice(0, 2).map((r) => r.marcher_id),
        });
        // The split-off shares the page's range; the page's own is the older one
        expect(off.timeline).toMatchObject({ start_beat: 9, end_beat: 17 });
        expect(off.timeline.id).toBeGreaterThan(page.id);
        const before = positions(await resolverOf(db), 48);

        const result = await splitTimelineAtBeat({
            db,
            timelineId: off.timeline.id,
            beat: 13,
        });
        expect(result.after).toMatchObject({
            id: off.timeline.id,
            start_beat: 13,
            end_beat: 17,
        });
        expect(result.before).toMatchObject({ start_beat: 9, end_beat: 13 });
        expectSamePositions(before, positions(await resolverOf(db), 48), 1e-9);
        // The page's move is untouched, still the page box's timeline
        expect(
            await db
                .select()
                .from(schema.timelines)
                .where(eq(schema.timelines.id, page.id))
                .get(),
        ).toMatchObject({ start_beat: 9, end_beat: 17 });
    });

    it("refuses a half landing on a page's box that has its timeline: it would take over the page's move", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const { transition } = await page2(db);
        const [row] = await rowsOf(db, transition.id);
        // A move from page 1's count 5 over page 2: split at page 2's flag, its second half
        // would be exactly page 2's box
        await overlay(db, row!.marcher_id, 5, 17, [10, 10]);
        const move = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.start_beat, 5))
            .get())!;
        await expectRefused(
            db,
            () => splitTimelineAtBeat({ db, timelineId: move.id, beat: 9 }),
            /already runs over/,
        );
    });

    it("follow the leader goes straight before the beat and says who changed", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const { timeline, transition } = await page2(db);
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
        const members = (await rowsOf(db, transition.id)).map(
            (r) => r.marcher_id,
        );

        const result = await splitTimelineAtBeat({
            db,
            timelineId: timeline.id,
            beat: 13,
        });
        const r1 = await resolverOf(db);
        // Everyone is where they were at the beat and at the end
        for (const id of members) {
            for (const beat of [9, 13, 17]) {
                const [x0, y0] = r0.positionAt(id, beat);
                const [x1, y1] = r1.positionAt(id, beat);
                expect(x1).toBeCloseTo(x0, 6);
                expect(y1).toBeCloseTo(y0, 6);
            }
        }
        // Founding members followed a trail before; now they go straight, which is a change
        expect(result.motionChanged.map((c) => c.marcherId)).toEqual(
            [...members].sort((a, b) => a - b),
        );
        expect(result.motionChanged.every((c) => c.fromBeat === 9)).toBe(true);
        const moved = members.filter((id) => {
            const [x0, y0] = r0.positionAt(id, 11);
            const [x1, y1] = r1.positionAt(id, 11);
            return Math.hypot(x1 - x0, y1 - y0) > 1e-6;
        });
        expect(moved.length).toBeGreaterThan(0);
        const [made] = await transitionsOf(db, result.before.id);
        expect(made!.path_style).toBe("direct");
        const [kept] = await transitionsOf(db, timeline.id);
        expect(kept).toMatchObject({
            id: transition.id,
            path_style: "follow_the_leader",
            start_beat: 13,
        });
    });

    it("a kept row split in two is kept in both halves", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const { timeline, transition } = await page2(db);
        const rows = await rowsOf(db, transition.id);
        await transactionWithHistory(db, "keep", (tx) =>
            markAssignmentsKeptInTransaction(tx, [rows[0]!.id]),
        );
        const result = await splitTimelineAtBeat({
            db,
            timelineId: timeline.id,
            beat: 12,
        });
        const kept = await db
            .select()
            .from(schema.timeline_kept_assignments)
            .all();
        const [made] = await transitionsOf(db, result.before.id);
        const firstRow = (await rowsOf(db, made!.id)).find(
            (r) => r.marcher_id === rows[0]!.marcher_id,
        )!;
        expect(kept.map((k) => k.assignment_id).sort((a, b) => a - b)).toEqual(
            [rows[0]!.id, firstRow.id].sort((a, b) => a - b),
        );
    });

    it("refuses a beat on or outside the move's ends, a fraction, and a taken half", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const { timeline } = await page2(db);
        const split = (beat: number) =>
            splitTimelineAtBeat({ db, timelineId: timeline.id, beat });
        await expectRefused(db, () => split(9), /isn't inside/);
        await expectRefused(db, () => split(17), /isn't inside/);
        await expectRefused(db, () => split(12.5), /whole count/);
        await transactionWithHistory(db, "taken", (tx) =>
            createTimelinesInTransaction({
                tx,
                newTimelines: [{ startBeat: 9, endBeat: 12 }],
            }),
        );
        await expectRefused(db, () => split(12), /already runs over/);
    });

    it("refuses when nobody moves before (or after) the beat", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timelineId = await transactionWithHistory(
            db,
            "late",
            async (tx) => {
                const [made] = await createTimelinesInTransaction({
                    tx,
                    newTimelines: [{ startBeat: 50, endBeat: 60 }],
                });
                const [t] = await createTimelineTransitionsInTransaction({
                    tx,
                    newTransitions: [
                        {
                            timelineId: made!.id,
                            slotCount: 1,
                            destination: {
                                kind: "individual",
                                points: [[400, 400]],
                            },
                        },
                    ],
                });
                await createTimelineAssignmentsInTransaction({
                    tx,
                    newAssignments: [
                        {
                            marcherId: 1,
                            transitionId: t!.id,
                            slotIndex: 0,
                            startBeat: 55,
                            endBeat: 58,
                        },
                    ],
                });
                return made!.id;
            },
        );
        await expectRefused(
            db,
            () => splitTimelineAtBeat({ db, timelineId, beat: 53 }),
            /moves before/,
        );
        await expectRefused(
            db,
            () => splitTimelineAtBeat({ db, timelineId, beat: 59 }),
            /moves after/,
        );
        // Inside the row, the split works and the halves hold the row's two parts
        const result = await splitTimelineAtBeat({ db, timelineId, beat: 56 });
        const [made] = await transitionsOf(db, result.before.id);
        expect(await rowsOf(db, made!.id)).toMatchObject([
            { marcher_id: 1, start_beat: 55, end_beat: 56 },
        ]);
        expect(
            (await timelinesSorted(db)).map((t) => [t.start_beat, t.end_beat]),
        ).toContainEqual([56, 60]);
    });
});
