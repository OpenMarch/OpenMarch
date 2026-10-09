import { afterEach, describe, expect, it } from "vitest";
import { eq, getTableName, sql } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import type Page from "@/global/classes/Page";
import { keepFixturesInPageMode } from "@/test/timelineMode";
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
import {
    getUndoStackLength,
    performUndo,
    transactionWithHistory,
} from "../history";
import { createTimelinesInTransaction } from "../timelines";
import { createTimelineShapesInTransaction } from "../timelineShapes";
import { createTimelineTransitionsInTransaction } from "../timelineTransitions";
import { TimelineWriteError } from "../timelineErrors";
import {
    MOVE_NAME_MAX_LENGTH,
    normalizeMoveName,
} from "@/timeline/timelineViewModel";
import {
    deleteTimeline,
    readMovePath,
    renameTimeline,
    setMovePath,
} from "../timelineCommands";
import { updateTimelineTransition } from "../timelineTransitions";
import { moveMarchersInTarget } from "../timelineMoves";

keepFixturesInPageMode("its tests convert the show themselves");

/**
 * UI-14: a move (a clip's timeline) is deleted as one undoable edit, and the moves it passed
 * through come back; renaming stores a trimmed name, clears it when empty, and writes nothing
 * when it doesn't change.
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

/** How many edits Undo can step back through */
const undoSteps = async (db: DbConnection) =>
    (await db
        .select({
            steps: sql<number>`count(distinct ${schema.history_undo.history_group})`,
        })
        .from(schema.history_undo)
        .get())!.steps;

const resolver = () => useTimelineResolverStore.getState().resolver!;

const setUp = async (db: DbConnection): Promise<Page[]> => {
    await convertPagesToTimeline(db);
    await startTimelineResolver(db);
    const { pages } = await readShowTiming(db);
    return [...pages].sort((a, b) => a.order - b.order);
};

/** The stored timeline ending on `page`'s flag (its page timeline). */
const timelineOf = async (db: DbConnection, page: Page) =>
    (await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.end_beat, pageEndBeat(page)))
        .get())!;

const nameOf = async (db: DbConnection, id: number) =>
    (await db
        .select({ name: schema.timelines.name })
        .from(schema.timelines)
        .where(eq(schema.timelines.id, id))
        .get())!.name;

describe("normalizeMoveName", () => {
    it("trims, clears an empty name and cuts a long one", () => {
        expect(normalizeMoveName("  Company front  ")).toBe("Company front");
        expect(normalizeMoveName("   ")).toBeNull();
        expect(normalizeMoveName(null)).toBeNull();
        expect(normalizeMoveName("x".repeat(100))).toHaveLength(
            MOVE_NAME_MAX_LENGTH,
        );
    });
});

describeDbTests("deleting a move (UI-14)", (it) => {
    it("deletes a mid-page move as one undoable edit, and the page's move comes back", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const page = await timelineOf(db, pages[3]!);
        const mid = page.start_beat + 3;
        const before = await snapshot(db);
        const atMid = resolver().positionAt(5, mid);
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: page.start_beat, end: mid },
            moves: [{ marcherId: 5, x: 200, y: 210 }],
        });
        const move = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.end_beat, mid))
            .get())!;
        await timelineResolverSettled();
        expect(resolver().positionAt(5, mid)).toEqual([200, 210]);
        const edited = await snapshot(db);

        const deleted = await deleteTimeline({ db, timelineId: move.id });
        expect(deleted.id).toBe(move.id);
        await timelineResolverSettled();
        // Exactly the rows from before the move: the page's own move is back
        expect(await snapshot(db)).toEqual(before);
        expect(resolver().positionAt(5, mid)).toEqual(atMid);

        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await snapshot(db)).toEqual(edited);
    });

    it("brings back the pages a move passed through", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const first = await timelineOf(db, pages[2]!);
        const second = await timelineOf(db, pages[3]!);
        const onFlag = resolver().positionAt(5, first.end_beat);
        const before = await snapshot(db);
        const { passThrough } = await moveMarchersInTarget({
            db,
            target: {
                kind: "range",
                start: first.start_beat,
                end: second.end_beat,
            },
            moves: [{ marcherId: 5, x: 200, y: 210 }],
        });
        await timelineResolverSettled();
        expect(resolver().positionAt(5, first.end_beat)).not.toEqual(onFlag);

        await deleteTimeline({
            db,
            timelineId: passThrough!.createdTimelineId!,
        });
        await timelineResolverSettled();
        expect(resolver().positionAt(5, first.end_beat)).toEqual(onFlag);
        expect(await snapshot(db)).toEqual(before);
    });

    it("refuses a timeline that doesn't exist, and writes nothing", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const before = await snapshot(db);
        const undoBefore = await getUndoStackLength(db);
        const error = await deleteTimeline({ db, timelineId: 9999 }).catch(
            (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(TimelineWriteError);
        expect((error as TimelineWriteError).code).toBe("E-ARGS");
        expect(await snapshot(db)).toEqual(before);
        expect(await getUndoStackLength(db)).toBe(undoBefore);
    });
});

describeDbTests("renaming a move (UI-14)", (it) => {
    /** A mid-page move on page 4, made by a drag: it is "Move 1" from the start */
    const makeMove = async (db: DbConnection, pages: Page[]) => {
        const page = await timelineOf(db, pages[3]!);
        const mid = page.start_beat + 3;
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: page.start_beat, end: mid },
            moves: [{ marcherId: 5, x: 200, y: 210 }],
        });
        return (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.end_beat, mid))
            .get())!;
    };

    it("stores the trimmed name as one undoable edit; cleared, it takes the next free number", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const { id } = await makeMove(db, pages);
        expect(await nameOf(db, id)).toBe("Move 1");

        const renamed = await renameTimeline({
            db,
            timelineId: id,
            name: "  Company front ",
        });
        expect(renamed?.name).toBe("Company front");
        expect(await nameOf(db, id)).toBe("Company front");

        // UI-14 round-2 review: a move always has a name, so its label never shifts. Cleared,
        // it takes the next number not on screen; its own "Move 1" went with the typed name
        await renameTimeline({ db, timelineId: id, name: "" });
        expect(await nameOf(db, id)).toBe("Move 1");

        let undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await nameOf(db, id)).toBe("Company front");
        undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await nameOf(db, id)).toBe("Move 1");
    });

    it("writes nothing when the name doesn't change, or when an automatic name is cleared", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const { id } = await makeMove(db, pages);
        const undoAuto = await getUndoStackLength(db);
        expect(
            await renameTimeline({ db, timelineId: id, name: "  " }),
        ).toBeNull();
        expect(await nameOf(db, id)).toBe("Move 1");
        expect(await getUndoStackLength(db)).toBe(undoAuto);

        await renameTimeline({ db, timelineId: id, name: "Opener" });
        const undoBefore = await getUndoStackLength(db);
        expect(
            await renameTimeline({ db, timelineId: id, name: " Opener " }),
        ).toBeNull();
        expect(await getUndoStackLength(db)).toBe(undoBefore);
    });

    it("compares with the committed name: the same rename sent twice is one edit", async ({
        db,
        marchersAndPages: _,
    }) => {
        const pages = await setUp(db);
        const { id } = await makeMove(db, pages);
        const undoBefore = await undoSteps(db);
        // Sent together, as a field's blur and its unmount can: the second sees the first's name
        const [first, second] = await Promise.all([
            renameTimeline({ db, timelineId: id, name: "Opener" }),
            renameTimeline({ db, timelineId: id, name: "Opener" }),
        ]);
        expect(first?.name).toBe("Opener");
        expect(second).toBeNull();
        expect(await undoSteps(db)).toBe(undoBefore + 1);
    });

    it("a timeline that no longer exists has nothing to rename: no edit, no error", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const undoBefore = await getUndoStackLength(db);
        expect(
            await renameTimeline({ db, timelineId: 9999, name: "x" }),
        ).toBeNull();
        expect(await getUndoStackLength(db)).toBe(undoBefore);
    });
});

describeDbTests("a move's path (UI-14 Move card)", (it) => {
    /** A mid-page move of marchers 5 and 6 on page 4: two one-slot transitions */
    const makeMove = async (db: DbConnection) => {
        const pages = await setUp(db);
        const page = await timelineOf(db, pages[3]!);
        const end = page.start_beat + 3;
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: page.start_beat, end },
            moves: [
                { marcherId: 5, x: 200, y: 210 },
                { marcherId: 6, x: 220, y: 230 },
            ],
        });
        return (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.end_beat, end))
            .get())!.id;
    };

    it("bends every member transition as one undoable edit", async ({
        db,
        marchersAndPages: _,
    }) => {
        const id = await makeMove(db);
        expect(await readMovePath(db, id)).toEqual({
            style: "direct",
            bulge: null,
            transitions: 2,
        });
        const before = await snapshot(db);
        expect(
            await setMovePath({ db, timelineId: id, style: "arc", bulge: 0.3 }),
        ).toBe(2);
        expect(await readMovePath(db, id)).toEqual({
            style: "arc",
            bulge: 0.3,
            transitions: 2,
        });
        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        expect(await snapshot(db)).toEqual(before);
    });

    it("says Mixed when members differ, and only changes the ones that differ", async ({
        db,
        marchersAndPages: _,
    }) => {
        const id = await makeMove(db);
        const [first] = await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.timeline_id, id))
            .all();
        await updateTimelineTransition({
            db,
            modified: {
                id: first!.id,
                pathStyle: "arc",
                pathParams: { bulge: 0.25 },
            },
        });
        expect((await readMovePath(db, id)).style).toBe("mixed");
        expect(await setMovePath({ db, timelineId: id, style: "arc" })).toBe(1);
        expect(await readMovePath(db, id)).toEqual({
            style: "arc",
            bulge: 0.25,
            transitions: 2,
        });
    });

    it("all following the leader is that path, not Mixed, and Direct changes them all as one edit", async ({
        db,
        marchersAndPages: _,
    }) => {
        // Two one-slot transitions following the leader onto a line (follow the leader needs a
        // shape), of one timeline, as the shape editor can leave a move
        const id = await transactionWithHistory(db, "setUp", async (tx) => {
            const [line] = await createTimelineShapesInTransaction({
                tx,
                newShapes: [
                    {
                        kind: "line",
                        geometry: {
                            points: [
                                [0, 0],
                                [60, 0],
                            ],
                        },
                    },
                ],
            });
            const [timeline] = await createTimelinesInTransaction({
                tx,
                newTimelines: [{ startBeat: 0, endBeat: 8 }],
            });
            await createTimelineTransitionsInTransaction({
                tx,
                newTransitions: [0, 1].map(() => ({
                    timelineId: timeline!.id,
                    startBeat: 0,
                    endBeat: 8,
                    slotCount: 1,
                    destination: { kind: "shape" as const, shapeId: line!.id },
                    pathStyle: "follow_the_leader" as const,
                    pathParams: { waypoints: [] },
                })),
            });
            return timeline!.id;
        });
        expect(await readMovePath(db, id)).toEqual({
            style: "follow_the_leader",
            bulge: null,
            transitions: 2,
        });
        const before = await undoSteps(db);
        expect(await setMovePath({ db, timelineId: id, style: "direct" })).toBe(
            2,
        );
        expect(await undoSteps(db)).toBe(before + 1);
        expect((await readMovePath(db, id)).style).toBe("direct");
    });

    it("judges what changes on the committed paths: the same path sent twice is one edit", async ({
        db,
        marchersAndPages: _,
    }) => {
        const id = await makeMove(db);
        const undoBefore = await undoSteps(db);
        // Sent together, as two quick presses do: the second sees the first's arcs
        const [first, second] = await Promise.all([
            setMovePath({ db, timelineId: id, style: "arc", bulge: 0.3 }),
            setMovePath({ db, timelineId: id, style: "arc", bulge: 0.3 }),
        ]);
        expect(first).toBe(2);
        expect(second).toBeNull();
        expect(await undoSteps(db)).toBe(undoBefore + 1);
    });

    it("opens no edit when nothing changes, and refuses a bulge out of range", async ({
        db,
        marchersAndPages: _,
    }) => {
        const id = await makeMove(db);
        const undoBefore = await getUndoStackLength(db);
        expect(
            await setMovePath({ db, timelineId: id, style: "direct" }),
        ).toBeNull();
        expect(await getUndoStackLength(db)).toBe(undoBefore);
        const before = await snapshot(db);
        const error = await setMovePath({
            db,
            timelineId: id,
            style: "arc",
            bulge: 2,
        }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(TimelineWriteError);
        expect(await snapshot(db)).toEqual(before);
    });
});
