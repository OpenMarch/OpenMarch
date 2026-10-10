import { afterEach, describe, expect } from "vitest";
import { getTableName, sql } from "drizzle-orm";
import { createResolver, type Resolver } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/timeline/convert/writePageConversion";
import { readTimelineTables } from "@/timeline/timelineRows";
import { keepPassedFlagsAsStops } from "@/timeline/timelinePassThrough";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { performRedo, performUndo } from "../history";
import { movePageFlag } from "../pageFlags";
import { resizeTimeline } from "../timelineResize";
import { moveMarchersInTarget } from "../timelineMoves";
import { readPageGrid } from "../timelineRipple";

keepFixturesInPageMode(
    "its tests build their own timeline state: a show made in timeline mode",
);

/**
 * Coverage gaps of the defined-coordinates change catalog
 * (docs/timeline/research/defined-coordinates/CHANGES.md section 7) on sparse timeline rows:
 *
 * - gap 13: #111's page flag drag and move resize on a show with no automatic stays: later pages
 *   that hold keep following, no row is written on a page's behalf, and each is one undo step;
 * - B-03's caveat: an isolated-move (`{kind: "timeline"}`) or home write still writes a value it
 *   leaves unchanged, unlike a range write;
 * - gap 7: **Keep as a stop**, then undo and redo, one step at a time.
 *
 * The show is `marchersAndPages` made in timeline mode: page 0 plus pages 1 to 6, 8 counts each, so
 * page N's box is `[8N - 7, 8N + 1)` and its flag is at beat `8N + 1`.
 */

afterEach(() => useTimelineSelectionStore.getState().reset());

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

const snapshot = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const setTimelineFlag = async (db: DbConnection) => {
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: true }),
    });
};

const clearHistory = async (db: DbConnection) => {
    await db.run(sql`DELETE FROM history_undo`);
    await db.run(sql`DELETE FROM history_redo`);
};

/** A show made in timeline mode: no stored moves, so everyone holds at home on every page. */
const madeInTimelineMode = async (db: DbConnection) => {
    await setTimelineFlag(db);
    await convertPagesToTimeline(db);
    for (const table of [
        "timeline_slot_destinations",
        "timeline_assignments",
        "timeline_transitions",
        "timeline_shapes",
        "timelines",
    ])
        await db.run(sql.raw(`DELETE FROM ${table}`));
    await clearHistory(db);
};

const marcherIds = async (db: DbConnection) =>
    (await db.select({ id: schema.marchers.id }).from(schema.marchers).all())
        .map((m) => m.id)
        .sort((a, b) => a - b);

const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);

/** Every assignment as `[marcher, start, end, layer]`, in order. */
const allRows = async (db: DbConnection) =>
    (await db.select().from(schema.timeline_assignments).all())
        .map((r) => [r.marcher_id, r.start_beat, r.end_beat, r.layer])
        .sort(
            (a, b) =>
                a[0]! - b[0]! ||
                a[1]! - b[1]! ||
                a[2]! - b[2]! ||
                a[3]! - b[3]!,
        );

const flags = async (db: DbConnection) =>
    (await db.transaction((tx) => readPageGrid(tx))).pages
        .filter((p) => p.id !== 0)
        .map((p) => p.end);

/** How many undo steps are stored */
const undoSteps = async (db: DbConnection) =>
    new Set(
        (await db.select().from(schema.history_undo).all()).map(
            (r) => r.history_group,
        ),
    ).size;

/** Undo once and check the data is back to `before`; redo once and check it is `after` again. */
const oneUndoStep = async (
    db: DbConnection,
    before: Record<string, unknown[]>,
    after: Record<string, unknown[]>,
) => {
    expect((await performUndo(db)).success).toBe(true);
    expect(await snapshot(db)).toEqual(before);
    expect((await performRedo(db)).success).toBe(true);
    expect(await snapshot(db)).toEqual(after);
};

/**
 * Marcher A moves on page 2 (to 300, 200) and marcher B on page 4 (to 50, 50); everyone else has
 * no move. Pages 3, 5 and 6 are held: nobody has a row over them.
 */
const sparseShow = async (db: DbConnection) => {
    await madeInTimelineMode(db);
    const [a, b, c] = await marcherIds(db);
    await moveMarchersInTarget({
        db,
        target: { kind: "range", start: 9, end: 17 },
        moves: [{ marcherId: a!, x: 300, y: 200 }],
    });
    await moveMarchersInTarget({
        db,
        target: { kind: "range", start: 25, end: 33 },
        moves: [{ marcherId: b!, x: 50, y: 50 }],
    });
    await clearHistory(db);
    expect(await allRows(db)).toEqual([
        [a, 9, 17, 0],
        [b, 25, 33, 0],
    ]);
    return { a: a!, b: b!, c: c! };
};

describeDbTests(
    "gap 13: page flag drags and move resizes on sparse rows",
    (it) => {
        it("dragging page 2's flag later: its move follows, the held pages after it keep following, no rows are added", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b, c } = await sparseShow(db);
            const homeC = (await resolverOf(db)).positionAt(c, 0);
            const before = await snapshot(db);

            await movePageFlag({ db, pageId: 2, beat: 20 });

            expect(await flags(db)).toEqual([9, 20, 25, 33, 41, 49]);
            // The move's end was on the flag, so it follows; nothing is written for page 3 or anyone
            expect(await allRows(db)).toEqual([
                [a, 9, 20, 0],
                [b, 25, 33, 0],
            ]);
            const r = await resolverOf(db);
            for (const beat of [20, 25, 33, 41, 49])
                expect(r.positionAt(a, beat)).toEqual([300, 200]);
            expect(r.positionAt(b, 49)).toEqual([50, 50]);
            expect(r.positionAt(c, 49)).toEqual(homeC);
            await oneUndoStep(db, before, await snapshot(db));
        });

        it("dragging a held page's flag (page 5, nobody moves there) writes no timeline row at all", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await sparseShow(db);
            const timelineBefore = await allRows(db);
            const destinationsBefore = await db
                .select()
                .from(schema.timeline_slot_destinations)
                .all();
            const before = await snapshot(db);

            await movePageFlag({ db, pageId: 5, beat: 44 });

            expect(await flags(db)).toEqual([9, 17, 25, 33, 44, 49]);
            expect(await allRows(db)).toEqual(timelineBefore);
            expect(
                await db.select().from(schema.timeline_slot_destinations).all(),
            ).toEqual(destinationsBefore);
            const r = await resolverOf(db);
            expect(r.positionAt(a, 44)).toEqual([300, 200]);
            expect(r.positionAt(b, 44)).toEqual([50, 50]);
            await oneUndoStep(db, before, await snapshot(db));
        });

        it("dragging held page 3's flag later moves the start of page 4's move with it; the hold before it follows page 2", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await sparseShow(db);
            const before = await snapshot(db);

            await movePageFlag({ db, pageId: 3, beat: 28 });

            // B's page 4 move started on the flag, so its start follows; its end stays
            expect(await allRows(db)).toEqual([
                [a, 9, 17, 0],
                [b, 28, 33, 0],
            ]);
            const r = await resolverOf(db);
            expect(r.positionAt(a, 28)).toEqual([300, 200]);
            expect(r.positionAt(b, 28)).toEqual(r.positionAt(b, 0));
            expect(r.positionAt(b, 33)).toEqual([50, 50]);
            await oneUndoStep(db, before, await snapshot(db));
        });

        it("resizing page 2's move to end inside page 3: later held pages keep following, no rows are added", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await sparseShow(db);
            const timeline = (
                await db.select().from(schema.timelines).all()
            ).find((t) => t.start_beat === 9 && t.end_beat === 17)!;
            const home = (await resolverOf(db)).positionAt(a, 0);
            const before = await snapshot(db);

            await resizeTimeline({
                db,
                timelineId: timeline.id,
                start: 9,
                end: 21,
            });

            expect(await allRows(db)).toEqual([
                [a, 9, 21, 0],
                [b, 25, 33, 0],
            ]);
            const r = await resolverOf(db);
            // Page 2's flag is now partway along the move; every later flag still holds its set
            expect(r.positionAt(a, 17)).not.toEqual([300, 200]);
            expect(r.positionAt(a, 17)).not.toEqual(home);
            for (const beat of [21, 25, 33, 41, 49])
                expect(r.positionAt(a, beat)).toEqual([300, 200]);
            await oneUndoStep(db, before, await snapshot(db));
        });

        it("resizing page 2's move to start earlier: it still ends at its flag, and the held pages after it follow", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await sparseShow(db);
            const timeline = (
                await db.select().from(schema.timelines).all()
            ).find((t) => t.start_beat === 9)!;
            const before = await snapshot(db);

            await resizeTimeline({
                db,
                timelineId: timeline.id,
                start: 5,
                end: 17,
            });

            const r = await resolverOf(db);
            for (const beat of [17, 25, 49])
                expect(r.positionAt(a, beat)).toEqual([300, 200]);
            expect((await allRows(db)).filter((row) => row[0] === a)).toEqual([
                [a, 5, 17, 0],
            ]);
            await oneUndoStep(db, before, await snapshot(db));
        });

        it("an edit of page 2 after the flag drag still carries through the held pages", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await sparseShow(db);
            await movePageFlag({ db, pageId: 2, beat: 20 });
            await moveMarchersInTarget({
                db,
                target: { kind: "range", start: 9, end: 20 },
                moves: [{ marcherId: a, x: 123, y: 45 }],
            });
            const r = await resolverOf(db);
            for (const beat of [20, 25, 33, 49])
                expect(r.positionAt(a, beat)).toEqual([123, 45]);
            expect((await allRows(db)).filter((row) => row[0] === a)).toEqual([
                [a, 9, 20, 0],
            ]);
        });
    },
);

describeDbTests(
    "B-03 caveat: isolated-move and home writes still write unchanged values",
    (it) => {
        it("a range write that leaves everyone where they are writes nothing and opens no undo step (contrast)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await sparseShow(db);
            const before = await snapshot(db);
            const steps = await undoSteps(db);
            const result = await moveMarchersInTarget({
                db,
                target: { kind: "range", start: 9, end: 17 },
                moves: [{ marcherId: a, x: 300, y: 200 }],
            });
            expect(result.slots).toEqual([]);
            expect(await snapshot(db)).toEqual(before);
            expect(await undoSteps(db)).toBe(steps);
        });

        it("documents current behavior: an isolated move's write to where the marcher already ends writes its slot and opens an undo step", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await sparseShow(db);
            const timeline = (
                await db.select().from(schema.timelines).all()
            ).find((t) => t.start_beat === 9)!;
            const before = await snapshot(db);
            const steps = await undoSteps(db);

            const result = await moveMarchersInTarget({
                db,
                target: { kind: "timeline", timelineId: timeline.id },
                moves: [{ marcherId: a, x: 300, y: 200 }],
            });

            // The slot is written (same values), so the data reads the same, but it is an undo step
            expect(result.slots.map((s) => s.marcherId)).toEqual([a]);
            expect(await snapshot(db)).toEqual(before);
            expect(await undoSteps(db)).toBe(steps + 1);
            expect(
                (await db.select().from(schema.history_undo).all()).some((r) =>
                    /timeline_slot_destinations/.test(r.sql),
                ),
            ).toBe(true);
        });

        it("documents current behavior: a home write to the marcher's home writes it and opens an undo step", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { c } = await sparseShow(db);
            const [x, y] = (await resolverOf(db)).positionAt(c, 0);
            const before = await snapshot(db);
            const steps = await undoSteps(db);

            const result = await moveMarchersInTarget({
                db,
                target: { kind: "home" },
                moves: [{ marcherId: c, x, y }],
            });

            expect(result.homes).toEqual([c]);
            expect(await undoSteps(db)).toBe(steps + 1);
            // Nothing a user can see changed: same rows, apart from bookkeeping columns
            const strip = (s: Record<string, unknown[]>) =>
                JSON.stringify(s, (k, v) =>
                    k === "updated_at" ? undefined : v,
                );
            expect(strip(await snapshot(db))).toEqual(strip(before));
        });
    },
);

describeDbTests("gap 7: Keep as a stop, then undo and redo", (it) => {
    it("each step undoes on its own: Keep, then the window move", async ({
        db,
        marchersAndPages: _,
    }) => {
        await madeInTimelineMode(db);
        const [a] = await marcherIds(db);
        const home = (await resolverOf(db)).positionAt(a!, 0);
        const start = await snapshot(db);

        // A window over pages 2 and 3 passes page 2's flag (17)
        const { passThrough } = await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 9, end: 25 },
            moves: [{ marcherId: a!, x: 300, y: 200 }],
        });
        expect(passThrough?.flags).toEqual([17]);
        const passed = await snapshot(db);
        expect((await resolverOf(db)).positionAt(a!, 17)).not.toEqual(home);

        await keepPassedFlagsAsStops(passThrough!, 17);
        const kept = await snapshot(db);
        let r = await resolverOf(db);
        // Page 2 is a stop again (A holds home there), and A arrives at page 3's flag
        expect(r.positionAt(a!, 17)).toEqual(home);
        expect(r.positionAt(a!, 25)).toEqual([300, 200]);
        expect(await allRows(db)).toEqual([[a, 17, 25, 0]]);

        // Undo takes back Keep only: the window move is back
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(passed);
        r = await resolverOf(db);
        expect(r.positionAt(a!, 17)).not.toEqual(home);
        // A second undo takes back the window move
        expect((await performUndo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(start);
        // Redo twice gets back to after Keep
        expect((await performRedo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(passed);
        expect((await performRedo(db)).success).toBe(true);
        expect(await snapshot(db)).toEqual(kept);
    });
});

describe("history", () => {
    describeDbTests("sparse flag drags, resizes and Keep as a stop", (it) => {
        const testWithHistory = getTestWithHistory(it, TABLES);
        testWithHistory(
            "a move, a flag drag, a resize and Keep as a stop undo one at a time",
            async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
                await setTimelineFlag(db);
                await convertPagesToTimeline(db);
                for (const table of [
                    "timeline_slot_destinations",
                    "timeline_assignments",
                    "timeline_transitions",
                    "timeline_shapes",
                    "timelines",
                ])
                    await db.run(sql.raw(`DELETE FROM ${table}`));
                const [a, b] = await marcherIds(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                await moveMarchersInTarget({
                    db,
                    target: { kind: "range", start: 9, end: 17 },
                    moves: [{ marcherId: a!, x: 300, y: 200 }],
                });
                await movePageFlag({ db, pageId: 2, beat: 20 });
                const timeline = (
                    await db.select().from(schema.timelines).all()
                )[0]!;
                await resizeTimeline({
                    db,
                    timelineId: timeline.id,
                    start: 9,
                    end: 22,
                });
                const { passThrough } = await moveMarchersInTarget({
                    db,
                    target: { kind: "range", start: 25, end: 41 },
                    moves: [{ marcherId: b!, x: 40, y: 40 }],
                });
                await keepPassedFlagsAsStops(passThrough!, 33);
                await expectNumberOfChanges.test(db, 5, state);
            },
        );
    });
});
