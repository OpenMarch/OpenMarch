import { afterEach, describe, expect } from "vitest";
import { getTableName, sql } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/timeline/convert/writePageConversion";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { movePageFlag, pageFlagMoveLimits } from "../pageFlags";
import { readPageGrid } from "../timelineRipple";
import { TimelineWriteError } from "../timelineErrors";
import { moveMarchersInRangeInTransaction } from "../timelineMoves";

// These tests set the flag and convert the show themselves
keepFixturesInPageMode(
    "its tests convert the show and set the flag themselves",
);

/**
 * Moving a page flag (docs/timeline/research/move-page-flag), on a converted `marchersAndPages`
 * show: beat 0 plus 96 beats (97 ordinals), page 0 plus pages 1 to 6 starting at beats 1, 9, 17,
 * 25, 33 and 41 (8 counts each, so flags at 9, 17, …, 49). Beat ids equal their ordinals here.
 */

afterEach(() => stopTimelineResolver());

const TIMELINE_TABLES = [
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

const TABLES = [
    schema.beats,
    schema.pages,
    schema.utility,
    schema.marchers,
    schema.marcher_pages,
    ...TIMELINE_TABLES,
];

const snapshot = async (db: DbConnection, tables = TABLES) => {
    const out: Record<string, unknown[]> = {};
    for (const table of tables)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const setTimelineFlag = async (db: DbConnection, on: boolean) => {
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: on }),
    });
};

const setUp = async (db: DbConnection) => {
    await setTimelineFlag(db, true);
    await convertPagesToTimeline(db);
    await startTimelineResolver(db);
};

/** `[id, start, end]` of every page, in show order. */
const grid = async (db: DbConnection) =>
    (await db.transaction((tx) => readPageGrid(tx))).pages.map((p) => [
        p.id,
        p.start,
        p.end,
    ]);

const lastPageCounts = async (db: DbConnection) =>
    (await db.query.utility.findFirst())!.last_page_counts;

/** Every marcher's position at `beat`, from the resolver. */
const positionsAt = async (beat: number) => {
    await timelineResolverSettled();
    const r = useTimelineResolverStore.getState().resolver!;
    return r.marcherIds().map((id) => [id, r.positionAt(id, beat)]);
};

const positionsAtBeats = async (beats: readonly number[]) => {
    const out: unknown[] = [];
    for (const beat of beats) out.push(await positionsAt(beat));
    return out;
};

/** `[start, end]` of every timeline, in start order. */
const timelineRanges = async (db: DbConnection) =>
    (await db.select().from(schema.timelines).all())
        .map((t) => [t.start_beat, t.end_beat])
        .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);

const violations = async (db: DbConnection) =>
    await db.all(
        sql`SELECT code, transition_id, detail FROM timeline_commit_violations`,
    );

const roundTrip = async (
    db: DbConnection,
    before: Record<string, unknown[]>,
    after: Record<string, unknown[]>,
) => {
    const undo = await performUndo(db);
    expect(undo.success, undo.error?.message).toBe(true);
    expect(await snapshot(db)).toEqual(before);
    expect(await violations(db)).toEqual([]);

    const redo = await performRedo(db);
    expect(redo.success, redo.error?.message).toBe(true);
    expect(await snapshot(db)).toEqual(after);
    expect(await violations(db)).toEqual([]);
};

const ORIGINAL = [
    [0, 0, 1],
    [1, 1, 9],
    [2, 9, 17],
    [3, 17, 25],
    [4, 25, 33],
    [5, 33, 41],
    [6, 41, 49],
];

const expectRefused = async (write: Promise<unknown>) => {
    const error = await write.then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe("E-ARGS");
};

/** A UI-10 drag over `[start, end)` of the first marcher, to (x, y): a clip */
const makeClip = async (
    db: DbConnection,
    start: number,
    end: number,
    point: [number, number] = [10, 10],
) => {
    const [marcher] = await db.select().from(schema.marchers).all();
    await transactionWithHistory(db, "makeClip", async (tx) => {
        await moveMarchersInRangeInTransaction({
            tx,
            range: { start, end },
            moves: [{ marcherId: marcher!.id, x: point[0], y: point[1] }],
        });
    });
    await timelineResolverSettled();
};

describeDbTests("moving a page flag (roll edit)", (it) => {
    describe("movePageFlag", () => {
        it("later: page 2 gains what page 3 loses, the sets stay, nothing else moves", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const setsBefore = await positionsAtBeats([1, 9, 17, 25, 33, 49]);
            const outsideBefore = await positionsAtBeats([3, 9, 27, 40]);
            const countsBefore = await lastPageCounts(db);
            const before = await snapshot(db);

            const moved = await movePageFlag({ db, pageId: 2, beat: 20 });

            expect(moved).toEqual({ pageId: 2, from: 17, to: 20 });
            expect(await grid(db)).toEqual([
                ...ORIGINAL.slice(0, 2),
                [2, 9, 20],
                [3, 20, 25],
                ...ORIGINAL.slice(4),
            ]);
            // The page timelines follow their boxes
            expect(await timelineRanges(db)).toEqual([
                [1, 9],
                [9, 20],
                [20, 25],
                [25, 33],
                [33, 41],
                [41, 49],
            ]);
            // Page 2's set is now reached at 20; every set keeps its coordinates
            expect(await positionsAtBeats([1, 9, 20, 25, 33, 49])).toEqual(
                setsBefore,
            );
            // Outside the two pages, motion is untouched
            expect(await positionsAtBeats([3, 9, 27, 40])).toEqual(
                outsideBefore,
            );
            expect(await lastPageCounts(db)).toBe(countsBefore);
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("earlier, and page 1's flag down to one count", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const sets = await positionsAtBeats([9, 17]);
            const before = await snapshot(db);

            await movePageFlag({ db, pageId: 1, beat: 2 });

            expect(await grid(db)).toEqual([
                [0, 0, 1],
                [1, 1, 2],
                [2, 2, 17],
                ...ORIGINAL.slice(3),
            ]);
            expect(await positionsAtBeats([2, 17])).toEqual(sets);
            await roundTrip(db, before, await snapshot(db));
        });

        it("the last flag writes last_page_counts; the second-to-last keeps the last flag", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const lastSet = await positionsAt(49);
            await movePageFlag({ db, pageId: 6, beat: 53 });
            expect((await grid(db)).at(-1)).toEqual([6, 41, 53]);
            expect(await lastPageCounts(db)).toBe(12);
            expect(await positionsAt(53)).toEqual(lastSet);

            const before = await snapshot(db);
            await movePageFlag({ db, pageId: 5, beat: 38 });
            expect((await grid(db)).slice(-2)).toEqual([
                [5, 33, 38],
                [6, 38, 53],
            ]);
            expect(await lastPageCounts(db)).toBe(15);
            await roundTrip(db, before, await snapshot(db));
        });

        it("on its own beat is a no-op that writes nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const before = await snapshot(db);
            expect(await movePageFlag({ db, pageId: 3, beat: 25 })).toEqual({
                pageId: 3,
                from: 25,
                to: 25,
            });
            expect(await snapshot(db)).toEqual(before);
        });

        it("refuses home, unknown pages, passing a neighbor, the show's end and page mode, writing nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const before = await snapshot(db);
            await expectRefused(movePageFlag({ db, pageId: 0, beat: 2 }));
            await expectRefused(movePageFlag({ db, pageId: 99, beat: 20 }));
            // Onto or past the next flag (25), onto or before the previous one (9)
            await expectRefused(movePageFlag({ db, pageId: 2, beat: 25 }));
            await expectRefused(movePageFlag({ db, pageId: 2, beat: 30 }));
            await expectRefused(movePageFlag({ db, pageId: 2, beat: 9 }));
            await expectRefused(movePageFlag({ db, pageId: 2, beat: 18.5 }));
            // Past the show's 96 counts
            await expectRefused(movePageFlag({ db, pageId: 6, beat: 98 }));
            expect(await snapshot(db)).toEqual(before);

            await setTimelineFlag(db, false);
            await expectRefused(movePageFlag({ db, pageId: 2, beat: 20 }));
            expect(await snapshot(db)).toEqual(before);
        });
    });

    describe("pageFlagMoveLimits", () => {
        it("stops one count short of each neighbor, and the last flag at the show's end", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            expect(await pageFlagMoveLimits({ db, pageId: 3 })).toEqual({
                pageId: 3,
                flag: 25,
                min: 18,
                max: 32,
                minBlock: { kind: "flag", pageId: 2 },
                maxBlock: { kind: "flag", pageId: 4 },
                holes: [],
            });
            expect(await pageFlagMoveLimits({ db, pageId: 1 })).toMatchObject({
                min: 2,
                minBlock: { kind: "flag", pageId: 0 },
            });
            expect(await pageFlagMoveLimits({ db, pageId: 6 })).toMatchObject({
                max: 97,
                maxBlock: { kind: "show-end" },
            });
            expect(await pageFlagMoveLimits({ db, pageId: 0 })).toBeNull();
            expect(await pageFlagMoveLimits({ db, pageId: 99 })).toBeNull();
        });

        it("a clip ending on the flag goes with it, but the flag can't pass the clip's start", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            // A breakaway from count 12 arriving on page 2's flag (17)
            await makeClip(db, 12, 17);
            const clipId = (
                await db.select().from(schema.timelines).all()
            ).find((t) => t.start_beat === 12)!.id;

            const limits = await pageFlagMoveLimits({ db, pageId: 2 });
            expect(limits).toMatchObject({
                min: 13,
                minBlock: { kind: "move", timelineId: clipId },
                max: 24,
            });
            await expectRefused(movePageFlag({ db, pageId: 2, beat: 12 }));

            const before = await snapshot(db);
            await movePageFlag({ db, pageId: 2, beat: 14 });
            expect(await timelineRanges(db)).toContainEqual([12, 14]);
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("passes over the one beat that would give the page timeline a clip's range (C-12)", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            // A move from page 3's start (17) arriving mid page 4, at 29
            await makeClip(db, 17, 29);
            const clipId = (
                await db.select().from(schema.timelines).all()
            ).find((t) => t.start_beat === 17 && t.end_beat === 29)!.id;
            // Page 3's flag (25) at 29 would make page 3's timeline [17, 29) too: a hole
            const limits = await pageFlagMoveLimits({ db, pageId: 3 });
            expect(limits).toMatchObject({
                max: 32,
                maxBlock: { kind: "flag", pageId: 4 },
                holes: [
                    { beat: 29, block: { kind: "move", timelineId: clipId } },
                ],
            });
            const before = await snapshot(db);
            await expectRefused(movePageFlag({ db, pageId: 3, beat: 29 }));
            expect(await snapshot(db)).toEqual(before);
            // Past it is fine
            await movePageFlag({ db, pageId: 3, beat: 30 });
            expect(await timelineRanges(db)).toContainEqual([17, 29]);
            expect(await timelineRanges(db)).toContainEqual([17, 30]);
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("a flag may land inside a clip that doesn't touch it: the clip keeps its beats", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            await makeClip(db, 19, 23);
            const [marcher] = await db.select().from(schema.marchers).all();
            const clipEnd = (await positionsAt(23)).find(
                ([id]) => id === marcher!.id,
            );
            const limits = await pageFlagMoveLimits({ db, pageId: 3 });
            expect(limits).toMatchObject({ min: 18, max: 32 });

            const before = await snapshot(db);
            await movePageFlag({ db, pageId: 2, beat: 21 });
            expect(await timelineRanges(db)).toContainEqual([19, 23]);
            // The clip still arrives where it was drawn to
            expect(
                (await positionsAt(23)).find(([id]) => id === marcher!.id),
            ).toEqual(clipEnd);
            expect(await violations(db)).toEqual([]);
            await roundTrip(db, before, await snapshot(db));
        });
    });

    describe("history", () => {
        const testWithHistory = getTestWithHistory(it, TABLES);

        testWithHistory(
            "each move is one undoable edit",
            async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
                await setUp(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                await movePageFlag({ db, pageId: 2, beat: 20 });
                await movePageFlag({ db, pageId: 6, beat: 45 });
                await movePageFlag({ db, pageId: 5, beat: 36 });
                await expectNumberOfChanges.test(db, 3, state);
            },
        );
    });
});
