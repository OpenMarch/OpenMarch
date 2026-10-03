import { afterEach, expect } from "vitest";
import { and, eq, getTableName } from "drizzle-orm";
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
import { moveMarchersInTarget } from "../timelineMoves";
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
        await expectRefused(db, /higher layer/, () =>
            moveMarchersInTarget({
                db,
                target: { kind: "timeline", timelineId: timeline.id },
                moves: [{ marcherId: 6, x: 10, y: 10 }],
            }),
        );
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
            /ends at beat .* before the timeline's end/,
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
