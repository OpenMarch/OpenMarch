import { afterEach, describe, expect, it as plainIt, beforeAll } from "vitest";
import { refusalText } from "@/test/refusalText";
import tolgee from "@/global/singletons/Tolgee";
import { asc, eq, getTableName } from "drizzle-orm";
import { createResolver, type Resolver } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { TimelineWriteError } from "../timelineErrors";
import {
    createTimelinesInTransaction,
    deleteTimelinesInTransaction,
} from "../timelines";
import { createTimelineTransitionsInTransaction } from "../timelineTransitions";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";
import {
    growOverLayers,
    readTimelineResizeLimits,
    resizeTimeline,
    timelineResizeLimits,
    timelineResizeRefusal,
} from "../timelineResize";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { readPageBoxes } from "../timelineMoveNames";
import { shiftTimeline } from "../timelineCommands";
import { translateTimelineText } from "@/timeline/translateTimelineText";
import type { TimelineText } from "@/timeline/timelineText";

/** A refusal in English, through the app's Tolgee (English in tests); `null` stays `null`. */
const say = (refusal: TimelineText | null) =>
    refusal && translateTimelineText(refusal);

// Refusals and toasts are translated: load English so they read as written
beforeAll(async () => {
    await tolgee.run();
});

/**
 * Resizing a move (docs/timeline/research/resize-move): dragging a clip's start or end edge
 * changes its timeline's range with the R-E1 procedure, within limits that stop at other moves on
 * the same marchers. The E-numbers are the design note's edge cases.
 */

keepFixturesInPageMode(
    "its tests convert the show or write timeline rows, and set the flag, themselves",
);

afterEach(() => stopTimelineResolver());

const TABLES = [
    schema.marchers,
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
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
    stats: await db.select().from(schema.history_stats).all(),
});

const expectRefused = async (
    db: DbConnection,
    write: () => Promise<unknown>,
) => {
    const before = await snapshot(db);
    const error = await write().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe("E-ARGS");
    expect(await snapshot(db)).toEqual(before);
    return error as TimelineWriteError;
};

const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);

/** The converted show cut down to page 1's move: one timeline from beat 1 moving everyone. */
const converted = async (db: DbConnection) => {
    const { timelineIds } = await convertPagesToTimeline(db);
    const [first, ...rest] = [...timelineIds.values()];
    await transactionWithHistory(db, "keepFirstPageMove", (tx) =>
        deleteTimelinesInTransaction({ tx, timelineIds: new Set(rest) }),
    );
    const timelines = await db.select().from(schema.timelines).all();
    expect(timelines.map((t) => t.id)).toEqual([first]);
    return timelines[0]!;
};

const rangeOf = async (db: DbConnection, timelineId: number) => {
    const row = await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.id, timelineId))
        .get();
    return row ? [row.start_beat, row.end_beat] : null;
};

/** Every row's range, transitions and assignments. */
const rowRanges = async (db: DbConnection) => ({
    transitions: (
        await db
            .select()
            .from(schema.timeline_transitions)
            .orderBy(asc(schema.timeline_transitions.id))
            .all()
    ).map((t) => [t.timeline_id, t.start_beat, t.end_beat]),
    assignments: (
        await db
            .select()
            .from(schema.timeline_assignments)
            .orderBy(asc(schema.timeline_assignments.id))
            .all()
    ).map((a) => [a.marcher_id, a.start_beat, a.end_beat]),
});

/** One edit: a timeline over [start, end) moving `marcherId` to (x, y) at `layer`. */
const addTimeline = (
    db: DbConnection,
    {
        marcherId,
        start,
        end,
        layer,
        to = [5, 5],
    }: {
        marcherId: number;
        start: number;
        end: number;
        layer: number;
        to?: [number, number];
    },
) =>
    transactionWithHistory(db, "addTimeline", async (tx) => {
        const [timeline] = await createTimelinesInTransaction({
            tx,
            newTimelines: [{ startBeat: start, endBeat: end }],
        });
        const [transition] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: timeline!.id,
                    startBeat: start,
                    endBeat: end,
                    slotCount: 1,
                    destination: { kind: "individual", points: [to] },
                },
            ],
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: [
                {
                    marcherId,
                    transitionId: transition!.id,
                    slotIndex: 0,
                    startBeat: start,
                    endBeat: end,
                    layer,
                },
            ],
        });
        return timeline!.id;
    });

const firstMarcher = async (db: DbConnection) =>
    (await db.select().from(schema.marchers).get())!.id;

describe("timelineResizeLimits (pure)", () => {
    const row = (marcherId: number, start: number, end: number, layer = 0) => ({
        marcherId,
        start,
        end,
        layer,
    });

    plainIt(
        "with nothing around, the edges run from 0 to one beat apart (E1, E2)",
        () => {
            const limits = timelineResizeLimits({
                timelineId: 1,
                start: 8,
                end: 16,
                own: [row(1, 8, 16)],
                others: [],
                taken: [],
            });
            expect(limits.startEdge.min).toEqual({
                beat: 0,
                stop: { kind: "show" },
            });
            expect(limits.startEdge.max).toEqual({
                beat: 15,
                stop: { kind: "minimum" },
            });
            expect(limits.endEdge.min).toEqual({
                beat: 9,
                stop: { kind: "minimum" },
            });
            expect(limits.endEdge.max.stop).toEqual({ kind: "show" });
        },
    );

    plainIt(
        "grows over a page's own moves on any layer, and raises its rows above them (owner, 2026-10-16)",
        () => {
            const page = (start: number, end: number, layer = 0) => ({
                ...row(1, start, end, layer),
                timelineId: 2,
                pageMove: true,
            });
            const others = [page(0, 8), page(16, 24), page(24, 32, 2)];
            const limits = timelineResizeLimits({
                timelineId: 1,
                start: 8,
                end: 16,
                own: [row(1, 8, 16)],
                others,
                taken: [],
            });
            expect(limits.startEdge.min.stop).toEqual({ kind: "show" });
            expect(limits.endEdge.max.stop).toEqual({ kind: "show" });
            const own = [{ id: 7, ...row(1, 8, 16) }];
            const from = { start: 8, end: 16 };
            expect(
                growOverLayers(own, others, from, { start: 8, end: 20 }),
            ).toEqual(new Map([[7, 1]]));
            expect(
                growOverLayers(own, others, from, { start: 8, end: 28 }),
            ).toEqual(new Map([[7, 3]]));
            // Shrinking or staying inside grows over nothing
            expect(
                growOverLayers(own, others, from, { start: 10, end: 16 }).size,
            ).toBe(0);
            // A higher move of the marcher inside this one would be overridden: page moves stop
            // the edge as before
            const guarded = timelineResizeLimits({
                timelineId: 1,
                start: 8,
                end: 16,
                own: [row(1, 8, 16)],
                others: [...others, { ...row(1, 10, 12, 1), timelineId: 3 }],
                taken: [],
            });
            expect(guarded.endEdge.max.beat).toBe(16);
        },
    );

    plainIt(
        "doesn't raise a row under a page move that already sits over the move: it grows underneath",
        () => {
            // Page 2's own move over [8,16) is above Move M over [4,12) (page 2 edited after M
            // crossed its flag). Growing M's end to 14 must not lift M over page 2 on 8–12,
            // counts the resize never touched
            const pageAbove = {
                ...row(1, 8, 16, 1),
                timelineId: 2,
                pageMove: true,
            };
            const limits = timelineResizeLimits({
                timelineId: 1,
                start: 4,
                end: 12,
                own: [row(1, 4, 12)],
                others: [pageAbove],
                taken: [],
            });
            expect(timelineResizeRefusal(limits, 4, 14)).toBeNull();
            expect(
                growOverLayers(
                    [{ id: 7, ...row(1, 4, 12) }],
                    [pageAbove],
                    { start: 4, end: 12 },
                    { start: 4, end: 14 },
                ).size,
            ).toBe(0);
        },
    );

    plainIt(
        "stops at a same- or higher-layer move on the same marcher, and grows over lower ones (E3, E4, E5)",
        () => {
            const limits = timelineResizeLimits({
                timelineId: 1,
                start: 8,
                end: 16,
                own: [row(1, 8, 16, 1), row(2, 8, 16, 1)],
                others: [
                    // Below: page moves the breakaway overrides; never a limit
                    { ...row(1, 0, 8, 0), timelineId: 10 },
                    { ...row(1, 16, 32, 0), timelineId: 11 },
                    // Same layer before, higher layer after
                    { ...row(2, 2, 6, 1), timelineId: 12 },
                    { ...row(2, 20, 24, 3), timelineId: 13 },
                    // Another marcher's moves don't limit this one
                    { ...row(3, 16, 18, 5), timelineId: 14 },
                ],
                taken: [
                    { timelineId: 12, start: 2, end: 6 },
                    { timelineId: 13, start: 20, end: 24 },
                ],
            });
            expect(limits.startEdge.min).toEqual({
                beat: 6,
                stop: { kind: "move", timelineId: 12, start: 2, end: 6 },
            });
            expect(limits.endEdge.max).toEqual({
                beat: 20,
                stop: { kind: "move", timelineId: 13, start: 20, end: 24 },
            });
        },
    );

    plainIt(
        "ignores moves that already overlap it, such as an exit stolen out of it (E6)",
        () => {
            const limits = timelineResizeLimits({
                timelineId: 1,
                start: 8,
                end: 16,
                own: [row(1, 8, 16, 0)],
                others: [{ ...row(1, 12, 24, 1), timelineId: 2 }],
                taken: [],
            });
            expect(limits.endEdge.max.stop).toEqual({ kind: "show" });
            expect(limits.endEdge.min.beat).toBe(9);
        },
    );

    plainIt(
        "can't cross a row that joins late or leaves early, or empty a row anchored at one edge (E7)",
        () => {
            const limits = timelineResizeLimits({
                timelineId: 1,
                start: 0,
                end: 16,
                own: [row(1, 0, 16), row(2, 4, 16), row(3, 0, 12)],
                others: [],
                taken: [],
            });
            // Marcher 2 joins at 4: the start can't pass 4; marcher 3 leaves at 12: the start keeps
            // at least one beat of it
            expect(limits.startEdge.max).toEqual({
                beat: 4,
                stop: { kind: "member", beat: 4 },
            });
            // Marcher 3 leaves at 12: the end can't come back past it; marcher 2's row keeps a beat
            expect(limits.endEdge.min).toEqual({
                beat: 12,
                stop: { kind: "member", beat: 12 },
            });
        },
    );

    plainIt(
        "explains a range outside the limits, and refuses another timeline's exact range (E8)",
        () => {
            const limits = timelineResizeLimits({
                timelineId: 1,
                start: 8,
                end: 16,
                own: [row(1, 8, 16)],
                others: [{ ...row(1, 20, 24), timelineId: 2 }],
                taken: [
                    { timelineId: 2, start: 20, end: 24 },
                    { timelineId: 3, start: 0, end: 16 },
                ],
            });
            expect(timelineResizeRefusal(limits, 8, 20)).toBeNull();
            expect(say(timelineResizeRefusal(limits, 8, 21))).toMatch(
                /in the way/,
            );
            expect(say(timelineResizeRefusal(limits, 8, 8))).toMatch(
                /at least 1 count/,
            );
            expect(say(timelineResizeRefusal(limits, 0, 16))).toMatch(
                /already covers exactly these counts/,
            );
            expect(say(timelineResizeRefusal(limits, 8.5, 16))).toMatch(
                /whole counts/,
            );
        },
    );
});

describeDbTests("resizing a timeline", (it) => {
    it("stretching the end keeps the set and re-times the path (E10); undo and redo round-trip (E13)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const timeline = await converted(db);
        const s = timeline.start_beat;
        const e = timeline.end_beat;
        const length = e - s;
        const before = await dataOf(db);
        const r0 = await resolverOf(db);
        const ids = r0.marcherIds();

        const result = await resizeTimeline({
            db,
            timelineId: timeline.id,
            start: s,
            end: e + length,
        });
        expect(result).toEqual({
            timelineId: timeline.id,
            from: { start: s, end: e },
            to: { start: s, end: e + length },
        });
        const after = await dataOf(db);
        // Every transition and assignment followed (C-11, R-E1); destinations are untouched
        expect(await rowRanges(db)).toEqual({
            transitions: (
                before.timeline_transitions as { timeline_id: number }[]
            ).map((t) => [t.timeline_id, s, e + length]),
            assignments: (
                before.timeline_assignments as { marcher_id: number }[]
            ).map((a) => [a.marcher_id, s, e + length]),
        });
        expect(after.timeline_slot_destinations).toEqual(
            before.timeline_slot_destinations,
        );

        // Twice as long: the position at s + 2t is the old one at s + t, and the set is reached
        // at the new end
        const r1 = await resolverOf(db);
        for (const id of ids)
            for (let t = 0; t <= length; t += 0.5) {
                const was = r0.positionAt(id, s + t);
                const is = r1.positionAt(id, s + 2 * t);
                expect(is[0]).toBeCloseTo(was[0], 9);
                expect(is[1]).toBeCloseTo(was[1], 9);
            }

        expect((await performUndo(db)).success).toBe(true);
        expect(await dataOf(db)).toEqual(before);
        expect((await performRedo(db)).success).toBe(true);
        expect(await dataOf(db)).toEqual(after);
    });

    it("moving the start later keeps the set; before it everyone holds where they were", async ({
        db,
        marchersAndPages: _,
    }) => {
        const timeline = await converted(db);
        const s = timeline.start_beat;
        const e = timeline.end_beat;
        const r0 = await resolverOf(db);
        await resizeTimeline({
            db,
            timelineId: timeline.id,
            start: s + 2,
            end: e,
        });
        expect(await rangeOf(db, timeline.id)).toEqual([s + 2, e]);
        const r1 = await resolverOf(db);
        for (const id of r0.marcherIds()) {
            expect(r1.positionAt(id, s + 1)).toEqual(r0.positionAt(id, s));
            expect(r1.positionAt(id, s + 2)).toEqual(r0.positionAt(id, s));
            expect(r1.positionAt(id, e)).toEqual(r0.positionAt(id, e));
        }
    });

    it("refuses a resize past the limits or to nothing, and writes nothing (E1, E3)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const timeline = await converted(db);
        const marcherId = await firstMarcher(db);
        const e = timeline.end_beat;
        // The same marcher moves again at the same layer from e + 4
        await addTimeline(db, {
            marcherId,
            start: e + 4,
            end: e + 8,
            layer: 0,
        });
        const error = await expectRefused(db, () =>
            resizeTimeline({
                db,
                timelineId: timeline.id,
                start: timeline.start_beat,
                end: e + 5,
            }),
        );
        expect(refusalText(error)).toMatch(/in the way/);
        await expectRefused(db, () =>
            resizeTimeline({
                db,
                timelineId: timeline.id,
                start: e,
                end: e,
            }),
        );
        await expectRefused(db, () =>
            resizeTimeline({ db, timelineId: 9999, start: 0, end: 4 }),
        );
        // Up to the other move is fine
        await resizeTimeline({
            db,
            timelineId: timeline.id,
            start: timeline.start_beat,
            end: e + 4,
        });
        expect(await rangeOf(db, timeline.id)).toEqual([
            timeline.start_beat,
            e + 4,
        ]);
    });

    it("grows over a lower-layer move, which it then overrides; the rows underneath stay (E4)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const timeline = await converted(db);
        const marcherId = await firstMarcher(db);
        const s = timeline.start_beat;
        const e = timeline.end_beat;
        // A breakaway one layer up, after page 1's move
        const breakaway = await addTimeline(db, {
            marcherId,
            start: e + 2,
            end: e + 6,
            layer: 1,
            to: [40, 40],
        });
        const limits = (await readTimelineResizeLimits(db, breakaway))!;
        expect(limits.startEdge.min).toEqual({
            beat: 0,
            stop: { kind: "show" },
        });

        const r0 = await resolverOf(db);
        const pageRows = (await rowRanges(db)).assignments.filter(
            ([, start]) => start === s,
        );
        // Its start grows back into page 1's move: the marcher leaves that move halfway
        const mid = s + Math.floor((e - s) / 2);
        await resizeTimeline({
            db,
            timelineId: breakaway,
            start: mid,
            end: e + 6,
        });
        const r1 = await resolverOf(db);
        expect(r1.positionAt(marcherId, mid)).toEqual(
            r0.positionAt(marcherId, mid),
        );
        expect(r1.positionAt(marcherId, e + 6)).toEqual([40, 40]);
        // Page 1's rows are still stored, unchanged
        expect(
            (await rowRanges(db)).assignments.filter(
                ([, start]) => start === s,
            ),
        ).toEqual(pageRows);
    });

    it("stops at a higher-layer move on the same marcher (E3)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const timeline = await converted(db);
        const marcherId = await firstMarcher(db);
        const e = timeline.end_beat;
        const breakaway = await addTimeline(db, {
            marcherId,
            start: e + 2,
            end: e + 6,
            layer: 1,
        });
        const later = await addTimeline(db, {
            marcherId,
            start: e + 8,
            end: e + 10,
            layer: 2,
        });
        const limits = (await readTimelineResizeLimits(db, breakaway))!;
        expect(limits.endEdge.max).toEqual({
            beat: e + 8,
            stop: {
                kind: "move",
                timelineId: later,
                start: e + 8,
                end: e + 10,
            },
        });
        await expectRefused(db, () =>
            resizeTimeline({
                db,
                timelineId: breakaway,
                start: e + 2,
                end: e + 9,
            }),
        );
    });

    it("refuses another timeline's exact range (C-12, E8)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const timeline = await converted(db);
        const marcherId = await firstMarcher(db);
        const e = timeline.end_beat;
        const breakaway = await addTimeline(db, {
            marcherId,
            start: e - 2,
            end: e + 4,
            layer: 1,
        });
        const error = await expectRefused(db, () =>
            resizeTimeline({
                db,
                timelineId: breakaway,
                start: timeline.start_beat,
                end: e,
            }),
        );
        expect(refusalText(error)).toMatch(
            /already covers exactly these counts/,
        );
    });

    it("refuses landing an older move on a newer page move's exact counts, by resize or clip move (UI-25)", async ({
        db,
        marchersAndPages: _,
    }) => {
        await converted(db);
        const [m1, m2, m3] = (
            await db.select().from(schema.marchers).all()
        ).map((m) => m.id);
        const box = (await readPageBoxes(db))[1]!;
        // The older move shares no marcher with the page's move, so L-4 alone would let it land
        const older = await addTimeline(db, {
            marcherId: m1!,
            start: box.start - 2,
            end: box.end - 2,
            layer: 1,
        });
        const page = await addTimeline(db, {
            marcherId: m2!,
            start: box.start,
            end: box.end,
            layer: 1,
        });
        expect(older).toBeLessThan(page);
        const limits = (await readTimelineResizeLimits(db, older))!;
        expect(limits.taken).toContainEqual({
            timelineId: page,
            start: box.start,
            end: box.end,
            pageTakeover: true,
        });
        const resized = await expectRefused(db, () =>
            resizeTimeline({
                db,
                timelineId: older,
                start: box.start,
                end: box.end,
            }),
        );
        expect(refusalText(resized)).toMatch(
            /make this move the page's own move/,
        );
        const moved = await expectRefused(db, () =>
            shiftTimeline({ db, timelineId: older, delta: 2 }),
        );
        expect(refusalText(moved)).toMatch(
            /make this move the page's own move/,
        );
        // A newer move may still land on the page's counts (L-4): it stays a clip
        const newer = await addTimeline(db, {
            marcherId: m3!,
            start: box.end,
            end: box.end + box.end - box.start,
            layer: 1,
        });
        await shiftTimeline({
            db,
            timelineId: newer,
            delta: box.start - box.end,
        });
        expect(await rangeOf(db, newer)).toEqual([box.start, box.end]);
    });

    it("writes nothing for an unchanged range (an edge dropped where it started)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const timeline = await converted(db);
        const before = await snapshot(db);
        expect(
            await resizeTimeline({
                db,
                timelineId: timeline.id,
                start: timeline.start_beat,
                end: timeline.end_beat,
            }),
        ).toBeNull();
        expect(await snapshot(db)).toEqual(before);
    });

    describe("history", () => {
        const testWithHistory = getTestWithHistory(it, TABLES);
        testWithHistory(
            "each resize is one undo group",
            async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
                const timeline = await converted(db);
                const s = timeline.start_beat;
                const e = timeline.end_beat;
                const state = await expectNumberOfChanges.getDatabaseState(db);
                await resizeTimeline({
                    db,
                    timelineId: timeline.id,
                    start: s,
                    end: e + 4,
                });
                await resizeTimeline({
                    db,
                    timelineId: timeline.id,
                    start: s + 2,
                    end: e + 4,
                });
                await expectNumberOfChanges.test(db, 2, state);
            },
        );
    });
});
