import { afterEach, expect } from "vitest";
import { and, eq, getTableName, inArray } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import type Page from "@/global/classes/Page";
import {
    convertPagesToTimeline,
    readShowTiming,
} from "@/timeline/convert/writePageConversion";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { performUndo, transactionWithHistory } from "../history";
import { TimelineWriteError } from "../timelineErrors";
import { createTimelinesInTransaction } from "../timelines";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";
import { createTimelineTransitionsInTransaction } from "../timelineTransitions";
import {
    moveMarchersFromFlagInstead,
    moveMarchersInTarget,
} from "../timelineMoves";
import { keepFixturesInPageMode } from "@/test/timelineMode";

// These tests convert the show themselves
keepFixturesInPageMode(
    "its tests convert the show or write timeline rows, and set the flag, themselves",
);

/**
 * UI-9 Editing (docs/timeline/ui.md, P8.15): a canvas move sets the ending of each marcher's
 * transition in the selected timeline, found by the timeline's id, or the homes at home. On a
 * converted `marchersAndPages` show: one timeline per page move, each marcher in each once.
 */

afterEach(() => stopTimelineResolver());

const TABLES = [
    schema.marchers,
    schema.timelines,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

const snapshot = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const resolver = () => useTimelineResolverStore.getState().resolver!;

const setUp = async (db: DbConnection): Promise<Page[]> => {
    await convertPagesToTimeline(db);
    await startTimelineResolver(db);
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order);
};

/** The stored timeline ending on `page`'s flag (its page timeline). */
const timelineOf = async (db: DbConnection, page: Page) => {
    const row = await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.end_beat, pageEndBeat(page)))
        .get();
    expect(row, `a timeline ends on page ${page.name}`).toBeDefined();
    return row!;
};

const expectRefused = async (
    db: DbConnection,
    message: RegExp,
    write: () => Promise<unknown>,
) => {
    const before = await snapshot(db);
    const error = await write().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe("E-ARGS");
    expect((error as Error).message).toMatch(message);
    expect(await snapshot(db)).toEqual(before);
};

/** A one-slot shapeless transition for `marcherId` at `layer`, in `timelineId` or a new one; returns the timeline. */
const addRow = async (
    db: DbConnection,
    {
        marcherId,
        start,
        end,
        layer,
        timelineId,
        assignmentEnd = end,
    }: {
        marcherId: number;
        start: number;
        end: number;
        layer: number;
        timelineId?: number;
        /** The assignment's end, when it ends before its transition */
        assignmentEnd?: number;
    },
): Promise<number> =>
    await transactionWithHistory(db, "addRow", async (tx) => {
        const id =
            timelineId ??
            (
                await createTimelinesInTransaction({
                    tx,
                    newTimelines: [{ startBeat: start, endBeat: end }],
                })
            )[0]!.id;
        const [transition] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: id,
                    startBeat: start,
                    endBeat: end,
                    slotCount: 1,
                    destination: { kind: "individual", points: [[300, 300]] },
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
                    endBeat: assignmentEnd,
                    layer,
                },
            ],
        });
        return id;
    });

describeDbTests("moving marchers in the selected timeline (UI-9)", (it) => {
    it("sets only the marcher's ending in that timeline, as one undoable edit", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page = pages[3]!;
        const timeline = await timelineOf(db, page);
        const endBeat = pageEndBeat(page);
        const others = pages
            .filter((p) => p !== page && p.previousPageId !== null)
            .map((p) => [p, resolver().positionAt(5, pageEndBeat(p))] as const);
        const before = await snapshot(db);

        const result = await moveMarchersInTarget({
            db,
            target: { kind: "timeline", timelineId: timeline.id },
            moves: [{ marcherId: 5, x: 123.5, y: 456.25 }],
        });
        expect(result.homes).toEqual([]);
        expect(result.slots).toHaveLength(1);
        const [moved] = result.slots;

        // Only the marcher's slot changed: every other slot, including the rest of the
        // converted page move it shares, kept its destination
        type SlotRow = {
            transition_id: number;
            slot_index: number;
            x: number;
            y: number;
        };
        const after = await snapshot(db);
        const slotsBefore = before.timeline_slot_destinations as SlotRow[];
        const slotsAfter = after.timeline_slot_destinations as SlotRow[];
        const isMoved = (row: SlotRow) =>
            row.transition_id === moved!.transitionId &&
            row.slot_index === moved!.slotIndex;
        expect(
            slotsBefore.filter(
                (row) =>
                    row.transition_id === moved!.transitionId && !isMoved(row),
            ).length,
            "the page move is shared with other marchers",
        ).toBeGreaterThan(0);
        expect(slotsAfter.filter((row) => !isMoved(row))).toEqual(
            slotsBefore.filter((row) => !isMoved(row)),
        );
        expect(slotsAfter.find(isMoved)).toMatchObject({ x: 123.5, y: 456.25 });
        for (const table of TABLES) {
            const name = getTableName(table);
            if (name !== "timeline_slot_destinations")
                expect(after[name], name).toEqual(before[name]);
        }

        await timelineResolverSettled();
        expect(resolver().positionAt(5, endBeat)).toEqual([123.5, 456.25]);
        // The marcher's other page ends are unchanged
        for (const [p, at] of others)
            expect(resolver().positionAt(5, pageEndBeat(p))).toEqual(at);

        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await snapshot(db)).toEqual(before);
    });

    it("finds the row by timeline, not by end beat: a steal ending earlier doesn't matter", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page = pages[3]!;
        const timeline = await timelineOf(db, page);
        // A higher-layer move inside the timeline that ends before its end
        await addRow(db, {
            marcherId: 2,
            start: timeline.start_beat,
            end: timeline.end_beat - 1,
            layer: 1,
        });
        await moveMarchersInTarget({
            db,
            target: { kind: "timeline", timelineId: timeline.id },
            moves: [{ marcherId: 2, x: 50, y: 60 }],
        });
        await timelineResolverSettled();
        expect(resolver().positionAt(2, timeline.end_beat)).toEqual([50, 60]);
    });

    it("refuses a marcher that isn't in the timeline, and writes nothing", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const timeline = await timelineOf(db, pages[2]!);
        await db
            .delete(schema.timeline_assignments)
            .where(
                and(
                    eq(schema.timeline_assignments.marcher_id, 3),
                    eq(schema.timeline_assignments.end_beat, timeline.end_beat),
                ),
            );
        await expectRefused(db, /isn't in this timeline/, () =>
            moveMarchersInTarget({
                db,
                target: { kind: "timeline", timelineId: timeline.id },
                moves: [
                    { marcherId: 1, x: 10, y: 10 },
                    { marcherId: 3, x: 20, y: 20 },
                ],
            }),
        );
    });

    it("refuses a marcher with more than one row in the timeline (use the inspector)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const timeline = await timelineOf(db, pages[2]!);
        await addRow(db, {
            marcherId: 4,
            start: timeline.start_beat,
            end: timeline.end_beat,
            layer: 1,
            timelineId: timeline.id,
        });
        await expectRefused(db, /more than one move.*inspector/, () =>
            moveMarchersInTarget({
                db,
                target: { kind: "timeline", timelineId: timeline.id },
                moves: [{ marcherId: 4, x: 10, y: 10 }],
            }),
        );
    });

    it("refuses when a higher layer of another timeline wins at the end", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const timeline = await timelineOf(db, pages[2]!);
        await addRow(db, {
            marcherId: 6,
            start: timeline.end_beat - 1,
            end: timeline.end_beat,
            layer: 1,
        });
        // UI-10: the refusal names the move in the way, in pages and counts (never beats)
        await expectRefused(
            db,
            /^E-ARGS: marcher T6's position at Page 2 count 8 comes from Move 1 \(Page 2, count 8\), not this move\. Put the start flag and playhead on that move's edges to edit it\.$/,
            () =>
                moveMarchersInTarget({
                    db,
                    target: { kind: "timeline", timelineId: timeline.id },
                    moves: [{ marcherId: 6, x: 10, y: 10 }],
                }),
        );
    });

    it("an isolated edit sets the plan of a marcher another move has at the end", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const timeline = await timelineOf(db, pages[2]!);
        const { start_beat: s, end_beat: e } = timeline;
        const exit = e - 4;
        // Marcher 6 leaves the page's move 4 beats before its end (a steal-out)
        await addRow(db, { marcherId: 6, start: exit, end: e, layer: 1 });
        await timelineResolverSettled();
        const origin = resolver().positionAt(6, s);
        const stolenEnd = resolver().positionAt(6, e);
        await moveMarchersInTarget({
            db,
            target: { kind: "timeline", timelineId: timeline.id, ghosts: true },
            moves: [{ marcherId: 6, x: 10, y: 20 }],
        });
        await timelineResolverSettled();
        // It still ends where the stealing move takes it
        expect(resolver().positionAt(6, e)).toEqual(stolenEnd);
        // It leaves from the page move's new plan (R-4)
        const p = (exit - s) / (e - s);
        const [x, y] = resolver().positionAt(6, exit);
        expect(x).toBeCloseTo(origin[0] + p * (10 - origin[0]), 6);
        expect(y).toBeCloseTo(origin[1] + p * (20 - origin[1]), 6);
        // One undo step takes it back
        expect((await performUndo(db)).success).toBe(true);
    });

    it("refuses a row that ends before the timeline's end (use the inspector)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const timeline = await timelineOf(db, pages[2]!);
        // Marcher 7's only row in the timeline ends a beat early
        await db
            .delete(schema.timeline_assignments)
            .where(
                and(
                    eq(schema.timeline_assignments.marcher_id, 7),
                    eq(schema.timeline_assignments.end_beat, timeline.end_beat),
                ),
            );
        await addRow(db, {
            marcherId: 7,
            start: timeline.start_beat,
            end: timeline.end_beat,
            assignmentEnd: timeline.end_beat - 1,
            layer: 0,
            timelineId: timeline.id,
        });
        await expectRefused(
            db,
            /^E-ARGS: marcher T7 stops at Page 2 count 7, before this move ends \(Page 2 count 8\)\. Edit it in the inspector\.$/,
            () =>
                moveMarchersInTarget({
                    db,
                    target: { kind: "timeline", timelineId: timeline.id },
                    moves: [{ marcherId: 7, x: 10, y: 10 }],
                }),
        );
    });

    it("editing a nested timeline's ending: the outer move resumes from there to its own destination (R-5, D-12)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const outer = await timelineOf(db, pages[3]!);
        expect(outer.end_beat - outer.start_beat).toBeGreaterThanOrEqual(6);
        const marcherId = 2;
        const outerEnd = resolver().positionAt(marcherId, outer.end_beat);
        const nestedStart = outer.start_beat + 1;
        const nestedEnd = outer.start_beat + 3;
        // A timeline wholly inside the outer one, one layer up (UI-9 Layers)
        const nested = await addRow(db, {
            marcherId,
            start: nestedStart,
            end: nestedEnd,
            layer: 1,
        });

        const point: [number, number] = [222.5, 333.25];
        await moveMarchersInTarget({
            db,
            target: { kind: "timeline", timelineId: nested },
            moves: [{ marcherId, x: point[0], y: point[1] }],
        });
        await timelineResolverSettled();

        // The nested move ends at the edited point
        expect(resolver().positionAt(marcherId, nestedEnd)).toEqual(point);
        // The outer move still ends where it ended
        expect(resolver().positionAt(marcherId, outer.end_beat)).toEqual(
            outerEnd,
        );
        // In between, it resumes from the new point: on the line from it to the outer end
        const mid = (nestedEnd + outer.end_beat) / 2;
        const [mx, my] = resolver().positionAt(marcherId, mid);
        const cross =
            (outerEnd[0] - point[0]) * (my - point[1]) -
            (outerEnd[1] - point[1]) * (mx - point[0]);
        expect(Math.abs(cross)).toBeLessThan(1e-6);
        expect(mx).toBeGreaterThanOrEqual(Math.min(point[0], outerEnd[0]));
        expect(mx).toBeLessThanOrEqual(Math.max(point[0], outerEnd[0]));
        expect([mx, my]).not.toEqual(point);
        expect([mx, my]).not.toEqual(outerEnd);
    });

    it("refuses an unknown timeline and a marcher named twice", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const timeline = await timelineOf(db, pages[2]!);
        await expectRefused(db, /does not exist/, () =>
            moveMarchersInTarget({
                db,
                target: { kind: "timeline", timelineId: 987654 },
                moves: [{ marcherId: 1, x: 10, y: 10 }],
            }),
        );
        await expectRefused(db, /more than once/, () =>
            moveMarchersInTarget({
                db,
                target: { kind: "timeline", timelineId: timeline.id },
                moves: [
                    { marcherId: 1, x: 10, y: 10 },
                    { marcherId: 1, x: 20, y: 20 },
                ],
            }),
        );
    });

    it("at home sets the homes and nothing else", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const before = await snapshot(db);
        const result = await moveMarchersInTarget({
            db,
            target: { kind: "home" },
            moves: [{ marcherId: 1, x: 10.5, y: 20.25 }],
        });
        expect(result.homes).toEqual([1]);
        const after = await snapshot(db);
        expect(after.timeline_slot_destinations).toEqual(
            before.timeline_slot_destinations,
        );
        await timelineResolverSettled();
        expect(resolver().positionAt(1, 0)).toEqual([10.5, 20.25]);
    });

    it("opens no edit when nothing moves", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const before = await snapshot(db);
        const result = await moveMarchersInTarget({
            db,
            target: { kind: "home" },
            moves: [],
        });
        expect(result).toEqual({
            homes: [],
            slots: [],
            convertedTransitionIds: [],
        });
        expect(await snapshot(db)).toEqual(before);
    });
});

/**
 * UI-10 Dragging adds (docs/timeline/ui.md, P8.17): a canvas move in the edit window `[S, P)` sets
 * where the moved marchers arrive at P, creating the window's timeline and adding them to it as
 * needed, in one undoable edit.
 */
describeDbTests("moving marchers in an edit window (UI-10)", (it) => {
    it("on a page box: a marcher already in its timeline only gets its ending set", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page = pages[3]!;
        const timeline = await timelineOf(db, page);
        const before = await snapshot(db);
        await moveMarchersInTarget({
            db,
            target: {
                kind: "range",
                start: timeline.start_beat,
                end: timeline.end_beat,
            },
            moves: [{ marcherId: 5, x: 123.5, y: 456.25 }],
        });
        const after = await snapshot(db);
        for (const table of TABLES) {
            const name = getTableName(table);
            if (name !== "timeline_slot_destinations")
                expect(after[name], name).toEqual(before[name]);
        }
        await timelineResolverSettled();
        expect(resolver().positionAt(5, timeline.end_beat)).toEqual([
            123.5, 456.25,
        ]);
    });

    it("mid-page: creates the window's timeline, adds the marchers and sets their arrivals, as one undoable edit", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page = pages[3]!;
        const timeline = await timelineOf(db, page);
        const mid = timeline.start_beat + 3;
        const atFlag = [5, 6].map((id) =>
            resolver().positionAt(id, timeline.end_beat),
        );
        const before = await snapshot(db);

        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: timeline.start_beat, end: mid },
            moves: [
                { marcherId: 5, x: 200, y: 210 },
                { marcherId: 6, x: 220, y: 230 },
            ],
        });
        await timelineResolverSettled();
        const created = await db
            .select()
            .from(schema.timelines)
            .where(
                and(
                    eq(schema.timelines.start_beat, timeline.start_beat),
                    eq(schema.timelines.end_beat, mid),
                ),
            )
            .all();
        expect(
            created,
            "one timeline over the window, and no page",
        ).toHaveLength(1);
        expect(resolver().positionAt(5, mid)).toEqual([200, 210]);
        expect(resolver().positionAt(6, mid)).toEqual([220, 230]);
        // They resume from there to where they already arrived at the flag (R-5, D-12)
        expect(resolver().positionAt(5, timeline.end_beat)).toEqual(atFlag[0]);
        expect(resolver().positionAt(6, timeline.end_beat)).toEqual(atFlag[1]);

        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await snapshot(db)).toEqual(before);
    });

    it("a second move in the same window joins the same timeline", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const timeline = await timelineOf(db, pages[3]!);
        const window = {
            kind: "range" as const,
            start: timeline.start_beat,
            end: timeline.start_beat + 2,
        };
        await moveMarchersInTarget({
            db,
            target: window,
            moves: [{ marcherId: 5, x: 200, y: 210 }],
        });
        await moveMarchersInTarget({
            db,
            target: window,
            moves: [
                { marcherId: 5, x: 201, y: 211 },
                { marcherId: 7, x: 240, y: 250 },
            ],
        });
        await timelineResolverSettled();
        const over = await db
            .select()
            .from(schema.timelines)
            .where(
                and(
                    eq(schema.timelines.start_beat, window.start),
                    eq(schema.timelines.end_beat, window.end),
                ),
            )
            .all();
        expect(over).toHaveLength(1);
        expect(resolver().positionAt(5, window.end)).toEqual([201, 211]);
        expect(resolver().positionAt(7, window.end)).toEqual([240, 250]);
    });

    it("a refusal in the move step rolls back the add made in the same edit", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const timeline = await timelineOf(db, pages[3]!);
        const window = {
            kind: "range" as const,
            start: timeline.start_beat,
            end: timeline.start_beat + 3,
        };
        // Marcher 6 joins the window's timeline, then a higher layer decides where it is at the end
        await moveMarchersInTarget({
            db,
            target: window,
            moves: [{ marcherId: 6, x: 200, y: 210 }],
        });
        await addRow(db, {
            marcherId: 6,
            start: window.end - 1,
            end: window.end,
            layer: 5,
        });
        // Marcher 5 would be added before marcher 6's move is refused: nothing may stay written
        await expectRefused(
            db,
            /position at Page 3 count 3 comes from Move 2 \(Page 3, count 3\), not this move/,
            () =>
                moveMarchersInTarget({
                    db,
                    target: window,
                    moves: [
                        { marcherId: 5, x: 230, y: 240 },
                        { marcherId: 6, x: 201, y: 211 },
                    ],
                }),
        );
    });

    it("names a page's move in the way by its page, never beats (wp18)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page3 = await timelineOf(db, pages[3]!);
        const window = {
            kind: "range" as const,
            start: page3.start_beat,
            end: page3.start_beat + 3,
        };
        await moveMarchersInTarget({
            db,
            target: window,
            moves: [{ marcherId: 6, x: 200, y: 210 }],
        });
        // A higher layer over page 3's whole box, in page 3's own timeline
        await addRow(db, {
            marcherId: 6,
            start: page3.start_beat,
            end: page3.end_beat,
            layer: 5,
            timelineId: page3.id,
        });
        await expectRefused(
            db,
            /^E-ARGS: marcher T6's position at Page 3 count 3 comes from Page 3's move, not this move\. Put the start flag and playhead on that move's edges to edit it\.$/,
            () =>
                moveMarchersInTarget({
                    db,
                    target: window,
                    moves: [{ marcherId: 6, x: 201, y: 211 }],
                }),
        );
    });

    it("names pages as the file numbers them (pageNumberOffset, wp18)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        await db.delete(schema.workspace_settings);
        await db.insert(schema.workspace_settings).values({
            id: 1,
            json_data: JSON.stringify({ pageNumberOffset: 1 }),
        });
        const timeline = await timelineOf(db, pages[2]!);
        await addRow(db, {
            marcherId: 6,
            start: timeline.end_beat - 1,
            end: timeline.end_beat,
            layer: 1,
        });
        // The page that is "Page 2" with no offset is "Page 3" with an offset of 1
        await expectRefused(
            db,
            /^E-ARGS: marcher T6's position at Page 3 count 8 comes from Move 1 \(Page 3, count 8\), not this move\./,
            () =>
                moveMarchersInTarget({
                    db,
                    target: { kind: "timeline", timelineId: timeline.id },
                    moves: [{ marcherId: 6, x: 10, y: 10 }],
                }),
        );
    });

    /** Marcher 5's assignments in `timelineIds`, to check that a pass-through keeps them. */
    const rowsOf5In = async (db: DbConnection, timelineIds: number[]) =>
        await db
            .select({ id: schema.timeline_assignments.id })
            .from(schema.timeline_assignments)
            .innerJoin(
                schema.timeline_transitions,
                eq(
                    schema.timeline_transitions.id,
                    schema.timeline_assignments.transition_id,
                ),
            )
            .where(
                and(
                    eq(schema.timeline_assignments.marcher_id, 5),
                    inArray(
                        schema.timeline_transitions.timeline_id,
                        timelineIds,
                    ),
                ),
            )
            .all();

    it("a window over two whole pages moves straight through them, keeps their rows, and is one undoable edit", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const first = await timelineOf(db, pages[2]!);
        const second = await timelineOf(db, pages[3]!);
        const start = first.start_beat;
        const end = second.end_beat;
        const origin = resolver().positionAt(5, start);
        const before = await snapshot(db);
        const rowsBefore = await rowsOf5In(db, [first.id, second.id]);
        expect(rowsBefore.length).toBeGreaterThan(0);

        const result = await moveMarchersInTarget({
            db,
            target: { kind: "range", start, end },
            moves: [{ marcherId: 5, x: 200, y: 210 }],
        });
        expect(result.passThrough).toEqual({
            range: { start, end },
            marcherIds: [5],
            labels: [expect.any(String)],
            overridden: [
                { start: first.start_beat, end: first.end_beat },
                { start: second.start_beat, end: second.end_beat },
            ],
            caughtUp: [],
            flags: [first.end_beat],
            createdTimelineId: expect.any(Number),
        });
        await timelineResolverSettled();
        expect(resolver().positionAt(5, end)).toEqual([200, 210]);
        // On the inner flag, it is on the straight line from S to the drop
        const p = (first.end_beat - start) / (end - start);
        const [x, y] = resolver().positionAt(5, first.end_beat);
        expect(x).toBeCloseTo(origin[0] + (200 - origin[0]) * p, 6);
        expect(y).toBeCloseTo(origin[1] + (210 - origin[1]) * p, 6);
        // The pages' rows stay stored underneath
        expect(await rowsOf5In(db, [first.id, second.id])).toEqual(rowsBefore);

        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await snapshot(db)).toEqual(before);
    });

    it("a window running partway into the next page lets that page's move catch up after it (R-5)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page = await timelineOf(db, pages[3]!);
        const next = await timelineOf(db, pages[4]!);
        const atNextFlag = resolver().positionAt(5, next.end_beat);
        const window = {
            kind: "range" as const,
            start: page.start_beat + 3,
            end: next.start_beat + 3,
        };
        const result = await moveMarchersInTarget({
            db,
            target: window,
            moves: [{ marcherId: 5, x: 200, y: 210 }],
        });
        expect(result.passThrough?.overridden).toEqual([]);
        expect(result.passThrough?.caughtUp).toEqual([
            { start: next.start_beat, end: next.end_beat },
        ]);
        await timelineResolverSettled();
        expect(resolver().positionAt(5, window.end)).toEqual([200, 210]);
        expect(resolver().positionAt(5, next.end_beat)).toEqual(atNextFlag);
    });

    it("a marcher already in the window's timeline passes through nothing", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page = await timelineOf(db, pages[3]!);
        const result = await moveMarchersInTarget({
            db,
            target: {
                kind: "range",
                start: page.start_beat,
                end: page.end_beat,
            },
            moves: [{ marcherId: 5, x: 200, y: 210 }],
        });
        expect(result.passThrough).toBeUndefined();
    });

    it("Keep Page N as a stop: takes the marchers out of the long move, deletes it when empty, and edits the last page instead, as one undoable edit", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const first = await timelineOf(db, pages[2]!);
        const second = await timelineOf(db, pages[3]!);
        const range = { start: first.start_beat, end: second.end_beat };
        const atInnerFlag = resolver().positionAt(5, first.end_beat);
        const moves = [{ marcherId: 5, x: 200, y: 210 }];
        const { passThrough } = await moveMarchersInTarget({
            db,
            target: { kind: "range", ...range },
            moves,
        });
        expect(passThrough?.createdTimelineId).toBeDefined();
        const passedThrough = await snapshot(db);

        await moveMarchersFromFlagInstead({
            db,
            range,
            from: second.start_beat,
            marcherIds: [5],
            deleteIfEmpty: passThrough!.createdTimelineId,
        });
        await timelineResolverSettled();
        const long = await db
            .select()
            .from(schema.timelines)
            .where(
                and(
                    eq(schema.timelines.start_beat, range.start),
                    eq(schema.timelines.end_beat, range.end),
                ),
            )
            .all();
        expect(long, "the emptied long move is deleted").toEqual([]);
        expect(resolver().positionAt(5, first.end_beat)).toEqual(atInnerFlag);
        expect(resolver().positionAt(5, range.end)).toEqual([200, 210]);

        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await snapshot(db)).toEqual(passedThrough);
    });

    it("Keep Page N as a stop refuses a flag outside the range, and marchers no longer in the move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const first = await timelineOf(db, pages[2]!);
        const second = await timelineOf(db, pages[3]!);
        const range = { start: first.start_beat, end: second.end_beat };
        await expectRefused(db, /isn't inside/, () =>
            moveMarchersFromFlagInstead({
                db,
                range,
                from: range.end,
                marcherIds: [5],
            }),
        );
        await expectRefused(db, /aren't in that move any more/, () =>
            moveMarchersFromFlagInstead({
                db,
                range,
                from: second.start_beat,
                marcherIds: [5],
            }),
        );
    });
    it("Keep Page N as a stop keeps where the marchers are now, not where the first drag put them", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const first = await timelineOf(db, pages[2]!);
        const second = await timelineOf(db, pages[3]!);
        const range = { start: first.start_beat, end: second.end_beat };
        const target = { kind: "range" as const, ...range };
        const { passThrough } = await moveMarchersInTarget({
            db,
            target,
            moves: [{ marcherId: 5, x: 200, y: 210 }],
        });
        // A later nudge in the same window: already in, so no new pass-through
        const nudge = await moveMarchersInTarget({
            db,
            target,
            moves: [{ marcherId: 5, x: 204, y: 210 }],
        });
        expect(nudge.passThrough).toBeUndefined();

        await moveMarchersFromFlagInstead({
            db,
            range,
            from: second.start_beat,
            marcherIds: [5],
            deleteIfEmpty: passThrough!.createdTimelineId,
        });
        await timelineResolverSettled();
        expect(resolver().positionAt(5, range.end)).toEqual([204, 210]);
    });

    it("Keep Page N as a stop keeps a timeline it didn't create, and other marchers in the long move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const first = await timelineOf(db, pages[2]!);
        const second = await timelineOf(db, pages[3]!);
        const range = { start: first.start_beat, end: second.end_beat };
        const target = { kind: "range" as const, ...range };
        // Marcher 6 is in the long move first; then marcher 5 joins it
        const before = await moveMarchersInTarget({
            db,
            target,
            moves: [{ marcherId: 6, x: 220, y: 230 }],
        });
        const { passThrough } = await moveMarchersInTarget({
            db,
            target,
            moves: [{ marcherId: 5, x: 200, y: 210 }],
        });
        expect(passThrough?.marcherIds).toEqual([5]);
        expect(passThrough?.createdTimelineId).toBeUndefined();

        await moveMarchersFromFlagInstead({
            db,
            range,
            from: second.start_beat,
            marcherIds: passThrough!.marcherIds,
            deleteIfEmpty: before.passThrough?.createdTimelineId,
        });
        await timelineResolverSettled();
        const long = await db
            .select()
            .from(schema.timelines)
            .where(
                and(
                    eq(schema.timelines.start_beat, range.start),
                    eq(schema.timelines.end_beat, range.end),
                ),
            )
            .all();
        expect(long, "marcher 6's long move stays").toHaveLength(1);
        expect(resolver().positionAt(6, range.end)).toEqual([220, 230]);
        expect(resolver().positionAt(5, range.end)).toEqual([200, 210]);
    });

    it("Keep Page N as a stop never deletes an empty timeline the user kept over the range", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const first = await timelineOf(db, pages[2]!);
        const second = await timelineOf(db, pages[3]!);
        const range = { start: first.start_beat, end: second.end_beat };
        // An empty stored timeline over the range, as UI-9 Remove leaves one
        const kept = await transactionWithHistory(
            db,
            "empty",
            async (tx) =>
                (
                    await createTimelinesInTransaction({
                        tx,
                        newTimelines: [
                            { startBeat: range.start, endBeat: range.end },
                        ],
                    })
                )[0]!.id,
        );
        const { passThrough } = await moveMarchersInTarget({
            db,
            target: { kind: "range", ...range },
            moves: [{ marcherId: 5, x: 200, y: 210 }],
        });
        expect(passThrough?.createdTimelineId).toBeUndefined();
        await moveMarchersFromFlagInstead({
            db,
            range,
            from: second.start_beat,
            marcherIds: [5],
            deleteIfEmpty: passThrough?.createdTimelineId,
        });
        const row = await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.id, kept))
            .get();
        expect(row, "the user's empty timeline stays").toBeDefined();
    });
});
