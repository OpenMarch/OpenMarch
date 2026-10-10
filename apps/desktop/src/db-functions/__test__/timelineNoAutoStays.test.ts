import { afterEach, describe, expect } from "vitest";
import { asc, getTableName, sql } from "drizzle-orm";
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
import { compareConversion } from "@/timeline/__test__/conversionEquality";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { performRedo, performUndo } from "../history";
import { createLastPage, createPages, deletePages } from "../page";
import { addPageFlag } from "../pageFlags";
import { moveMarchersInTarget } from "../timelineMoves";
import { createMarchers } from "../marcher";

// These tests set up timeline mode themselves
keepFixturesInPageMode(
    "its tests trim the show, convert it or write timeline rows, and set the flag, themselves",
);

/**
 * No automatic stays (docs/timeline/research/defined-coordinates, owner decision 2026-10-08;
 * ADR 0001 C-12): a marcher has a move on a page only where the designer moved it, and otherwise
 * holds where it last was, so an edit carries forward until that marcher's next own move. These
 * are the regression tests for the validator's scenarios (07a): adding pages by any path writes
 * no rows, so a later edit to an earlier page shows on the added pages (owner scenario S1).
 *
 * The `marchersAndPages` show is trimmed to page 0 and page 1 (beats [1, 9)); beat ids equal
 * their ordinals.
 */

afterEach(() => stopTimelineResolver());

type XY = [number, number];

const P1: XY = [50, 50];
const X: XY = [123, 456];
const Y: XY = [300, 300];

const TABLES = [
    schema.beats,
    schema.pages,
    schema.utility,
    schema.marchers,
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

const TIMELINE_TABLES = [
    schema.timelines,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

const snapshot = async (db: DbConnection, tables = TABLES) => {
    const out: Record<string, unknown[]> = {};
    for (const table of tables)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const violations = async (db: DbConnection) =>
    await db.all(
        sql`SELECT code, transition_id, detail FROM timeline_commit_violations`,
    );

const setTimelineFlag = async (db: DbConnection, on: boolean) => {
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: on }),
    });
};

const pagesInOrder = async (db: DbConnection): Promise<Page[]> =>
    [...(await readShowTiming(db)).pages].sort((a, b) => a.order - b.order);

/** Each page's flag beat: 0 for page 0, else where the page ends. */
const flagBeats = async (db: DbConnection) =>
    (await pagesInOrder(db)).map((p) => (p.id === 0 ? 0 : pageEndBeat(p)));

const resolver = () => {
    const r = useTimelineResolverStore.getState().resolver;
    expect(r, "the resolver store is ready").not.toBeNull();
    return r!;
};

const positionAt = (marcherId: number, beat: number): XY =>
    resolver().positionAt(marcherId, beat) as XY;

/** The marcher's position at every flag, in page order. */
const atFlags = async (db: DbConnection, marcherId: number) => {
    await timelineResolverSettled();
    return (await flagBeats(db)).map((b) => positionAt(marcherId, b));
};

const moveInRange = async (
    db: DbConnection,
    marcherId: number,
    [start, end]: [number, number],
    [x, y]: XY,
) => {
    await moveMarchersInTarget({
        db,
        target: { kind: "range", start, end },
        moves: [{ marcherId, x, y }],
    });
    await timelineResolverSettled();
};

/** Deletes every page after page 1, in page mode. */
const trimToPage1 = async (db: DbConnection) => {
    const pages = await pagesInOrder(db);
    await deletePages({
        db,
        pageIds: new Set(pages.filter((p) => p.order >= 2).map((p) => p.id)),
    });
};

/**
 * A show made in timeline mode: page 0 and page 1 (beats [1, 9)), and the first marcher moved
 * home to (10, 10) and then to `P1` on page 1. Returns the first two marchers.
 */
const timelineShow = async (db: DbConnection) => {
    await trimToPage1(db);
    await setTimelineFlag(db, true);
    await startTimelineResolver(db);
    const [m, other] = resolver().marcherIds();
    await moveMarchersInTarget({
        db,
        target: { kind: "home" },
        moves: [{ marcherId: m!, x: 10, y: 10 }],
    });
    await moveInRange(db, m!, [1, 9], P1);
    return { m: m!, other: other! };
};

type AddPages = "createLastPage" | "createPages" | "split" | "plusFlag";

/** Adds pages 2, 3 and 4 over beats [9, 17), [17, 25) and [25, 33) by one of the app's paths. */
const addThreePages = async (db: DbConnection, how: AddPages) => {
    if (how === "split") {
        // One long last page, then split twice
        await createLastPage({ db, newPageCounts: 24 });
        await createPages({
            db,
            newPages: [{ start_beat: 17, is_subset: false }],
        });
        await createPages({
            db,
            newPages: [{ start_beat: 25, is_subset: false }],
        });
        return;
    }
    for (const beat of [9, 17, 25]) {
        if (how === "createLastPage")
            await createLastPage({ db, newPageCounts: 8 });
        else if (how === "createPages")
            await createPages({
                db,
                newPages: [{ start_beat: beat, is_subset: false }],
            });
        // A + flag marks where a page ends
        else await addPageFlag({ db, beat: beat + 8 });
    }
};

describeDbTests("no automatic stays in timeline mode", (it) => {
    describe("owner scenario S1: an edit to page 2 carries through the added pages", () => {
        for (const how of [
            "createLastPage",
            "createPages",
            "split",
            "plusFlag",
        ] as AddPages[])
            it(`pages added by ${how}`, async ({ db, marchersAndPages: _ }) => {
                const { m, other } = await timelineShow(db);
                const rowsBefore = await snapshot(db, TIMELINE_TABLES);
                const before = await snapshot(db);

                await addThreePages(db, how);
                await timelineResolverSettled();
                // Pages 2 to 4 over [9, 17), [17, 25), [25, 33) (a split leaves the last page
                // running on), and no timeline row was written for them
                expect((await flagBeats(db)).slice(0, 4)).toEqual([
                    0, 9, 17, 25,
                ]);
                expect(await snapshot(db, TIMELINE_TABLES)).toEqual(rowsBefore);
                expect(await violations(db)).toEqual([]);
                // The added pages hold page 1's position
                for (const p of (await atFlags(db, m)).slice(1))
                    expect(p).toEqual(P1);

                // Each path is three edits; undo takes them back and redo replays them
                const after = await snapshot(db);
                for (let i = 0; i < 3; i++)
                    expect((await performUndo(db)).success).toBe(true);
                expect(await snapshot(db)).toEqual(before);
                for (let i = 0; i < 3; i++)
                    expect((await performRedo(db)).success).toBe(true);
                expect(await snapshot(db)).toEqual(after);
                expect(await violations(db)).toEqual([]);
                await timelineResolverSettled();

                // Drag on page 2: pages 3 and 4 follow
                const othersBefore = await atFlags(db, other);
                await moveInRange(db, m, [9, 17], X);
                const flags = await atFlags(db, m);
                expect(flags[0]).toEqual([10, 10]);
                expect(flags[1]).toEqual(P1);
                for (const p of flags.slice(2)) expect(p).toEqual(X);
                expect(await atFlags(db, other)).toEqual(othersBefore);
                expect(await violations(db)).toEqual([]);
            });
    });

    it("a page's own move stops the carry: an edit to page 2 stops at page 4's move", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { m } = await timelineShow(db);
        await addThreePages(db, "createLastPage");
        await moveInRange(db, m, [25, 33], Y);
        await moveInRange(db, m, [9, 17], X);
        expect(await atFlags(db, m)).toEqual([[10, 10], P1, X, X, Y]);
    });

    it("a new marcher moved on page 2 stays there on pages 3 and 4", async ({
        db,
        marchersAndPages: _,
    }) => {
        await timelineShow(db);
        await addThreePages(db, "createLastPage");
        const rowsBefore = await snapshot(db, TIMELINE_TABLES);
        const [created] = await createMarchers({
            db,
            newMarchers: [
                { section: "Trumpet", drill_prefix: "T", drill_order: 99 },
            ],
        });
        const id = created!.id;
        expect(await snapshot(db, TIMELINE_TABLES)).toEqual(rowsBefore);
        await timelineResolverSettled();
        const [home] = await atFlags(db, id);

        await moveInRange(db, id, [9, 17], X);
        expect(await atFlags(db, id)).toEqual([home, home, X, X, X]);
    });

    it("a window ending partway into a page holds its point through the later pages", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { m } = await timelineShow(db);
        await addThreePages(db, "createLastPage");
        await moveInRange(db, m, [9, 21], X);
        expect(positionAt(m, 21)).toEqual(X);
        // Before, a stay on page 3 caught up and took it back to page 1's point at beat 25
        const flags = await atFlags(db, m);
        expect(flags.slice(3)).toEqual([X, X]);
    });

    it("adding a page after a move stolen from a longer track leaves the marcher on the track", async ({
        db,
        marchersAndPages: _,
    }) => {
        // 07a "False 1": a layer-0 track over [1, 41) with a layer-1 move over [9, 17) stolen
        // from it. A hold over the new page [17, 25) at layer 1 used to freeze the marcher off
        // the track there.
        await trimToPage1(db);
        await setTimelineFlag(db, true);
        await startTimelineResolver(db);
        const [m] = resolver().marcherIds();
        await createLastPage({ db, newPageCounts: 8 });
        await moveInRange(db, m!, [1, 41], Y);
        await moveInRange(db, m!, [9, 17], [100, 500]);
        const layers = async () =>
            (
                await db
                    .select()
                    .from(schema.timeline_assignments)
                    .orderBy(asc(schema.timeline_assignments.start_beat))
                    .all()
            )
                .filter((a) => a.marcher_id === m)
                .map((a) => [a.start_beat, a.end_beat, a.layer]);
        expect(await layers()).toEqual([
            [1, 41, 0],
            [9, 17, 1],
        ]);
        const beats = [13, 17, 21, 25, 33, 41];
        const before = beats.map((b) => positionAt(m!, b));

        await createLastPage({ db, newPageCounts: 8 });
        await timelineResolverSettled();

        expect(await layers()).toEqual([
            [1, 41, 0],
            [9, 17, 1],
        ]);
        expect(beats.map((b) => positionAt(m!, b))).toEqual(before);
        // Back on the track after the stolen move, not held at its end
        expect(positionAt(m!, 21)).not.toEqual([100, 500]);
        expect(positionAt(m!, 41)).toEqual(Y);
    });

    it("converting copied pages writes rows only where marchers move, and every position stays the same", async ({
        db,
        marchersAndPages: _,
    }) => {
        // Page mode: pages 2 to 4 copy page 1
        await trimToPage1(db);
        for (let i = 0; i < 3; i++)
            await createLastPage({ db, newPageCounts: 8 });
        const pageRows = (await db.select().from(schema.marcher_pages).all())
            .length;
        const marchers = (await db.select().from(schema.marchers).all()).length;
        expect(pageRows).toBe(5 * marchers);

        await setTimelineFlag(db, true);
        const { report, timelineIds } = await convertPagesToTimeline(db);
        await startTimelineResolver(db);
        // Only page 1 has a move; the copies are not reported as losses
        const pages = await pagesInOrder(db);
        expect([...timelineIds.keys()]).toEqual([pages[1]!.id]);
        expect(report.pages.every((p) => p.skipped === null)).toBe(true);
        expect(
            (await db.select().from(schema.timeline_transitions).all()).length,
        ).toBe(1);
        const assignments = (
            await db.select().from(schema.timeline_assignments).all()
        ).length;
        expect(assignments).toBeGreaterThan(0);
        expect(assignments).toBeLessThanOrEqual(marchers);

        // Bit for bit page mode's positions at every flag
        const equality = await compareConversion(db, { interiorSamples: 3 });
        expect(equality.pageEnd.samples).toBeGreaterThan(0);
        expect(equality.pageEnd.exact).toBe(equality.pageEnd.samples);

        // And an edit to page 2 carries through the copies
        const [m] = resolver().marcherIds();
        const p1 = positionAt(m!, 9);
        await moveInRange(db, m!, [9, 17], X);
        expect((await atFlags(db, m!)).slice(1)).toEqual([p1, X, X, X]);
    });
});
