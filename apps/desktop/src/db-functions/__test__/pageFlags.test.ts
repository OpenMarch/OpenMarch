import { afterEach, describe, expect, test } from "vitest";
import { eq, getTableName, sql } from "drizzle-orm";
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
import { performRedo, performUndo } from "../history";
import {
    addPageFlag,
    deletePageFlags,
    pageFlagGrid,
    planPageFlagInsertion,
} from "../pageFlags";
import { readPageGrid } from "../timelineRipple";
import { TimelineWriteError } from "../timelineErrors";

// These tests set the flag and convert the show themselves
keepFixturesInPageMode(
    "its tests convert the show and set the flag themselves",
);

/**
 * Page flags in timeline mode (docs/timeline/ui.md UI-9 **+** and Deleting a flag, P8.13), on a
 * converted `marchersAndPages` show: beat 0 plus 96 beats (97 ordinals), page 0 plus pages 1 to 6
 * starting at beats 1, 9, 17, 25, 33 and 41 (8 counts each, so flags at 9, 17, …, 49). Beat ids
 * equal their ordinals here.
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

const setUp = async (db: DbConnection, flag = true) => {
    await setTimelineFlag(db, flag);
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

/** Every marcher's position at every beat up to `upTo`, from the resolver. */
const positions = async (db: DbConnection, upTo = 60) => {
    await timelineResolverSettled();
    const r = useTimelineResolverStore.getState().resolver!;
    const out: unknown[] = [];
    for (const id of r.marcherIds())
        for (let beat = 0; beat <= upTo; beat++)
            out.push([id, beat, r.positionAt(id, beat)]);
    return out;
};

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

describe("planPageFlagInsertion", () => {
    const pages = [
        { id: 0, start: 0, end: 1 },
        { id: 1, start: 1, end: 9 },
        { id: 2, start: 9, end: 17 },
    ];
    const plan = (beat: number, beatCount = 30) =>
        planPageFlagInsertion({ beatCount, pages }, beat);

    test("inside a page it splits that page", () => {
        expect(plan(5)).toEqual({
            kind: "split",
            beat: 5,
            page: pages[1],
            last: false,
        });
        expect(plan(16)).toEqual({
            kind: "split",
            beat: 16,
            page: pages[2],
            last: true,
        });
    });

    test("past the last flag it appends, while the show has the beats", () => {
        expect(plan(18)).toEqual({
            kind: "append",
            beat: 18,
            lastPage: pages[2],
        });
        expect(plan(30)).toMatchObject({ kind: "append", beat: 30 });
        expect(plan(31)).toBeNull();
    });

    test("nothing on a flag, at home, or at a fractional beat", () => {
        for (const beat of [0, 1, 9, 17, 4.5, -1, Number.NaN])
            expect(plan(beat), `beat ${beat}`).toBeNull();
        expect(planPageFlagInsertion({ beatCount: 30, pages: [] }, 5)).toBe(
            null,
        );
    });

    test("pageFlagGrid reads the renderer's pages", () => {
        const beats = (from: number, to: number) =>
            Array.from({ length: to - from }, (_, i) => ({ index: from + i }));
        expect(
            pageFlagGrid(
                [
                    { id: 2, beats: beats(9, 17) },
                    { id: 0, beats: beats(0, 1) },
                    { id: 1, beats: beats(1, 9) },
                    { id: 9, beats: [] },
                ],
                30,
            ),
        ).toEqual({ beatCount: 30, pages });
    });
});

describeDbTests("page flags in timeline mode (UI-9)", (it) => {
    describe("+", () => {
        it("inside a page: the split page keeps its flag, id and notes; the new page comes before it", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            await db
                .update(schema.pages)
                .set({ notes: "page two" })
                .where(eq(schema.pages.id, 2));
            const timelineBefore = await snapshot(db, TIMELINE_TABLES);
            const motionBefore = await positions(db);
            const countsBefore = await lastPageCounts(db);
            const before = await snapshot(db);

            const added = await addPageFlag({ db, beat: 13 });

            expect(added.startBeat).toBe(9);
            expect(added.endBeat).toBe(13);
            expect(added.page.is_subset).toBe(false);
            expect(added.page.notes).toBeNull();
            const id = added.page.id;
            expect(await grid(db)).toEqual([
                [0, 0, 1],
                [1, 1, 9],
                [id, 9, 13],
                [2, 13, 17],
                [3, 17, 25],
                [4, 25, 33],
                [5, 33, 41],
                [6, 41, 49],
            ]);
            const two = await db.query.pages.findFirst({
                where: eq(schema.pages.id, 2),
            });
            expect(two!.notes).toBe("page two");
            expect(await lastPageCounts(db)).toBe(countsBefore);
            // Only page rows changed: motion is the same everywhere
            expect(await snapshot(db, TIMELINE_TABLES)).toEqual(timelineBefore);
            expect(await positions(db)).toEqual(motionBefore);
            await roundTrip(db, before, await snapshot(db));
        });

        it("in the last page: the last flag stays, through last_page_counts", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const timelineBefore = await snapshot(db, TIMELINE_TABLES);
            const before = await snapshot(db);

            const added = await addPageFlag({ db, beat: 45 });

            expect([added.startBeat, added.endBeat]).toEqual([41, 45]);
            expect(await grid(db)).toEqual([
                ...ORIGINAL.slice(0, 6),
                [added.page.id, 41, 45],
                [6, 45, 49],
            ]);
            expect(await lastPageCounts(db)).toBe(4);
            expect(await snapshot(db, TIMELINE_TABLES)).toEqual(timelineBefore);
            await roundTrip(db, before, await snapshot(db));
        });

        it("past the last flag: appends a page ending at the beat", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const timelineBefore = await snapshot(db, TIMELINE_TABLES);
            const motionBefore = await positions(db);
            const before = await snapshot(db);

            const added = await addPageFlag({ db, beat: 60 });

            expect([added.startBeat, added.endBeat]).toEqual([49, 60]);
            expect(await grid(db)).toEqual([
                ...ORIGINAL,
                [added.page.id, 49, 60],
            ]);
            expect(await lastPageCounts(db)).toBe(11);
            expect(await snapshot(db, TIMELINE_TABLES)).toEqual(timelineBefore);
            expect(await positions(db)).toEqual(motionBefore);
            await roundTrip(db, before, await snapshot(db));
        });

        it("refuses on a flag, at home, past the show's beats, at a fractional beat, and in page mode, writing nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const before = await snapshot(db);
            for (const beat of [0, 1, 9, 17, 49, 98, 12.5])
                await expectRefused(addPageFlag({ db, beat }));
            expect(await snapshot(db)).toEqual(before);

            await setTimelineFlag(db, false);
            await expectRefused(addPageFlag({ db, beat: 13 }));
            expect(await snapshot(db)).toEqual(before);
        });
    });

    describe("deleting a flag", () => {
        it("removes only that flag: the next page takes its start and keeps its own flag", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            await db
                .update(schema.pages)
                .set({ notes: "page four" })
                .where(eq(schema.pages.id, 4));
            const timelineBefore = await snapshot(db, TIMELINE_TABLES);
            const motionBefore = await positions(db);
            const before = await snapshot(db);

            const deleted = await deletePageFlags({
                db,
                pageIds: new Set([3]),
            });

            expect(deleted.map((p) => p.id)).toEqual([3]);
            expect(await grid(db)).toEqual([
                ...ORIGINAL.slice(0, 3),
                [4, 17, 33],
                ...ORIGINAL.slice(5),
            ]);
            const four = await db.query.pages.findFirst({
                where: eq(schema.pages.id, 4),
            });
            expect(four!.notes).toBe("page four");
            expect(
                await db
                    .select()
                    .from(schema.marcher_pages)
                    .where(eq(schema.marcher_pages.page_id, 3))
                    .all(),
            ).toEqual([]);
            expect(await snapshot(db, TIMELINE_TABLES)).toEqual(timelineBefore);
            expect(await positions(db)).toEqual(motionBefore);
            await roundTrip(db, before, await snapshot(db));
        });

        it("the first page after home: the next page starts at home's flag", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const before = await snapshot(db);
            await deletePageFlags({ db, pageIds: new Set([1]) });
            expect(await grid(db)).toEqual([
                [0, 0, 1],
                [2, 1, 17],
                ...ORIGINAL.slice(3),
            ]);
            await roundTrip(db, before, await snapshot(db));
        });

        it("the last page: the page before becomes the last, ending at its own flag", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            // Page 5 becomes [37, 41), so the counts after the delete are 4
            await addPageFlag({ db, beat: 37 });
            const timelineBefore = await snapshot(db, TIMELINE_TABLES);
            const before = await snapshot(db);

            await deletePageFlags({ db, pageIds: new Set([6]) });

            expect((await grid(db)).at(-1)).toEqual([5, 37, 41]);
            expect(await lastPageCounts(db)).toBe(4);
            expect(await snapshot(db, TIMELINE_TABLES)).toEqual(timelineBefore);
            await roundTrip(db, before, await snapshot(db));
        });

        it("several flags at once, adjacent ones included; home is skipped", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const before = await snapshot(db);
            const deleted = await deletePageFlags({
                db,
                pageIds: new Set([0, 3, 4, 6]),
            });
            expect(deleted.map((p) => p.id).sort()).toEqual([3, 4, 6]);
            expect(await grid(db)).toEqual([
                ...ORIGINAL.slice(0, 3),
                [5, 17, 41],
            ]);
            // Page 5 ends at its own flag, 41
            expect(await lastPageCounts(db)).toBe(24);
            await roundTrip(db, before, await snapshot(db));
        });

        it("undoes +: deleting the added page's flag puts the page rows back", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const rows = async () =>
                (await db.select().from(schema.pages).all())
                    .map((p) => [p.id, p.start_beat, p.notes, p.is_subset])
                    .sort((a, b) => (a[0] as number) - (b[0] as number));
            const pagesBefore = await rows();
            const countsBefore = await lastPageCounts(db);

            const middle = await addPageFlag({ db, beat: 20 });
            await deletePageFlags({ db, pageIds: new Set([middle.page.id]) });
            const last = await addPageFlag({ db, beat: 44 });
            await deletePageFlags({ db, pageIds: new Set([last.page.id]) });

            expect(await rows()).toEqual(pagesBefore);
            expect(await lastPageCounts(db)).toBe(countsBefore);
            expect(await grid(db)).toEqual(ORIGINAL);
        });

        it("refuses an unknown page and page mode, writing nothing; home alone is a no-op", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setUp(db);
            const before = await snapshot(db);
            await expectRefused(
                deletePageFlags({ db, pageIds: new Set([99]) }),
            );
            expect(
                await deletePageFlags({ db, pageIds: new Set([0]) }),
            ).toEqual([]);
            expect(await snapshot(db)).toEqual(before);

            await setTimelineFlag(db, false);
            await expectRefused(deletePageFlags({ db, pageIds: new Set([3]) }));
            expect(await snapshot(db)).toEqual(before);
        });
    });

    describe("history", () => {
        const testWithHistory = getTestWithHistory(it, TABLES);

        testWithHistory(
            "+ and deleting a flag are one undoable edit each",
            async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
                await setUp(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                await addPageFlag({ db, beat: 13 });
                await addPageFlag({ db, beat: 60 });
                await deletePageFlags({ db, pageIds: new Set([3, 5]) });
                await expectNumberOfChanges.test(db, 3, state);
            },
        );
    });
});
