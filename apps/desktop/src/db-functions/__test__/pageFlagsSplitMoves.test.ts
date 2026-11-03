import { expect } from "vitest";
import { getTableName, sql } from "drizzle-orm";
import { createResolver, type Resolver } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { lockedMarchersByPage } from "@/timeline/basicSimple";
import { _splitPage } from "@/components/inspector/PageEditorUtils";
import type Page from "@/global/classes/Page";
import { performRedo, performUndo } from "../history";
import { addPageFlag } from "../pageFlags";
import { moveMarchersInTarget } from "../timelineMoves";
import { readBasicRows } from "../basicRows";
import { readPageGrid } from "../timelineRipple";

keepFixturesInPageMode(
    "its tests build their own timeline state: a show made in timeline mode",
);

/**
 * Adding a page in Basic splits each marcher's move at the new flag (README "Basic's panel"):
 * `addPageFlag({ splitMoves: true })` (the timeline's **+**) and `_splitPage({ splitMoves: true })`
 * (the inspector's **Split page**), through `splitMovesAtBeatInTransaction`.
 *
 * The show is `marchersAndPages` in timeline mode: page 0 plus pages 1 to 6, 8 counts each, so
 * page N's box is `[8N - 7, 8N + 1)` and page 2 is `[9, 17)`. Beat ids equal their ordinals.
 */

type XY = [number, number];
const A: XY = [300, 200];
const B: XY = [120, 80];
const C: XY = [200, 260];

const TIMELINE_TABLES = [
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];
const TABLES = [
    schema.pages,
    schema.utility,
    schema.marchers,
    ...TIMELINE_TABLES,
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

const setTimelineMode = async (db: DbConnection) => {
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: true }),
    });
    await convertPagesToTimeline(db);
};

const clearHistory = async (db: DbConnection) => {
    await db.run(sql`DELETE FROM history_undo`);
    await db.run(sql`DELETE FROM history_redo`);
};

/** A show made in timeline mode with no stored moves: everyone holds at home. */
const madeInTimelineMode = async (db: DbConnection) => {
    await setTimelineMode(db);
    for (const table of [
        "timeline_slot_destinations",
        "timeline_assignments",
        "timeline_transitions",
        "timeline_shapes",
        "timelines",
    ])
        await db.run(sql.raw(`DELETE FROM ${table}`));
    await clearHistory(db);
    const ids = (
        await db.select({ id: schema.marchers.id }).from(schema.marchers).all()
    )
        .map((m) => m.id)
        .sort((x, y) => x - y);
    return { a: ids[0]!, b: ids[1]!, c: ids[2]! };
};

const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);

const allMarchers = async (db: DbConnection) =>
    (await db.select({ id: schema.marchers.id }).from(schema.marchers).all())
        .map((m) => m.id)
        .sort((x, y) => x - y);

/** Every marcher's position at every beat of the show. */
const positions = async (db: DbConnection) => {
    const r = await resolverOf(db);
    const beatCount = (await db.transaction((tx) => readPageGrid(tx))).beatIds
        .length;
    const out: XY[][] = [];
    for (const m of await allMarchers(db)) {
        const row: XY[] = [];
        for (let b = 0; b <= beatCount; b++) row.push(r.positionAt(m, b) as XY);
        out.push(row);
    }
    return out;
};

const expectSamePositions = (after: XY[][], before: XY[][]) => {
    expect(after.length).toBe(before.length);
    for (let m = 0; m < before.length; m++)
        for (let b = 0; b < before[m]!.length; b++) {
            expect(after[m]![b]![0]).toBeCloseTo(before[m]![b]![0], 6);
            expect(after[m]![b]![1]).toBeCloseTo(before[m]![b]![1], 6);
        }
};

/** A marcher's rows as `[start, end, layer]`, by start. */
const rowsOf = async (db: DbConnection, marcherId: number) =>
    (await readBasicRows(db, { marcherIds: [marcherId] })).map((r) => [
        r.start,
        r.end,
        r.layer,
    ]);

/** `[start, end]` of every page after home, in show order. */
const boxes = async (db: DbConnection) =>
    (await db.transaction((tx) => readPageGrid(tx))).pages
        .slice(1)
        .map((p) => ({ start: p.start, end: p.end }));

/** Marchers locked (not simple) on any page box, by id. */
const lockedAnywhere = async (db: DbConnection) => {
    const locked = lockedMarchersByPage(
        await readBasicRows(db),
        await boxes(db),
    );
    return [...new Set([...locked.values()].flatMap((m) => [...m.keys()]))];
};

const range = async (
    db: DbConnection,
    marcherId: number,
    start: number,
    end: number,
    [x, y]: XY,
) =>
    await moveMarchersInTarget({
        db,
        target: { kind: "range", start, end },
        moves: [{ marcherId, x, y }],
    });

const point = async (
    db: DbConnection,
    marcherId: number,
    beat: number,
    [x, y]: XY,
) =>
    await moveMarchersInTarget({
        db,
        target: { kind: "point", beat, box: { start: 9, end: 17 } },
        moves: [{ marcherId, x, y }],
    });

/** Undo once: the data is `before`; redo once: it is `after` again. */
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

describeDbTests("Basic + splits moves at the new flag", (it) => {
    it("with no moves, writes only the page rows", async ({
        db,
        marchersAndPages: _,
    }) => {
        await madeInTimelineMode(db);
        const before = await snapshot(db, TIMELINE_TABLES);
        const added = await addPageFlag({ db, beat: 13, splitMoves: true });
        expect(added.splitMoves).toEqual({ split: [], leftAlone: [] });
        expect(await snapshot(db, TIMELINE_TABLES)).toEqual(before);
        expect((await boxes(db)).slice(0, 3)).toEqual([
            { start: 1, end: 9 },
            { start: 9, end: 13 },
            { start: 13, end: 17 },
        ]);
    });

    it("splits own moves in two at the flag; every position is unchanged", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b, c } = await madeInTimelineMode(db);
        await range(db, a, 1, 9, B);
        await range(db, a, 9, 17, A);
        await range(db, b, 9, 17, B);
        await point(db, b, 11, C);
        // Ends on the new flag: nothing to split
        await range(db, c, 9, 17, C);
        await point(db, c, 13, A);
        const cRows = await rowsOf(db, c);
        await clearHistory(db);
        const positionsBefore = await positions(db);
        const before = await snapshot(db);

        const added = await addPageFlag({ db, beat: 13, splitMoves: true });

        expect(added.splitMoves).toEqual({ split: [a, b], leftAlone: [] });
        expect(await rowsOf(db, a)).toEqual([
            [1, 9, 0],
            [9, 13, 0],
            [13, 17, 0],
        ]);
        expect(await rowsOf(db, b)).toEqual([
            [9, 11, 0],
            [11, 13, 0],
            [13, 17, 0],
        ]);
        expect(await rowsOf(db, c)).toEqual(cRows);
        expectSamePositions(await positions(db), positionsBefore);
        const r = await resolverOf(db);
        expect(r.positionAt(a, 17)).toEqual(A);
        expect(r.positionAt(b, 17)).toEqual(B);
        expect(await lockedAnywhere(db)).toEqual([]);
        expect(await violations(db)).toEqual([]);
        // One undo step restores the pages and the moves
        await oneUndoStep(db, before, await snapshot(db));
    });

    it("splits a converted show's shared transition, every marcher in it", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setTimelineMode(db);
        await clearHistory(db);
        const rows = await readBasicRows(db);
        const shared = rows.find((r) => r.slotCount > 1 && r.start > 1);
        expect(shared).toBeDefined();
        const box = { start: shared!.start, end: shared!.end };
        const members = rows
            .filter((r) => r.transitionId === shared!.transitionId)
            .map((r) => r.marcherId)
            .sort((x, y) => x - y);
        const mid = box.start + Math.floor((box.end - box.start) / 2);
        const lockedBefore = await lockedAnywhere(db);
        const positionsBefore = await positions(db);
        const before = await snapshot(db);

        const added = await addPageFlag({ db, beat: mid, splitMoves: true });

        expect(added.splitMoves?.split).toEqual(members);
        for (const m of members)
            expect(
                (await rowsOf(db, m)).filter(
                    ([s, e]) => s! >= box.start && e! <= box.end,
                ),
            ).toEqual([
                [box.start, mid, expect.any(Number)],
                [mid, box.end, expect.any(Number)],
            ]);
        expectSamePositions(await positions(db), positionsBefore);
        expect(await lockedAnywhere(db)).toEqual(lockedBefore);
        expect(await violations(db)).toEqual([]);
        await oneUndoStep(db, before, await snapshot(db));
    });

    it("leaves a marcher that isn't simple on the page alone", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a, b } = await madeInTimelineMode(db);
        // a crosses page 2's flag (17)
        await range(db, a, 13, 21, A);
        await range(db, b, 9, 17, B);
        const aRows = await rowsOf(db, a);
        const positionsBefore = await positions(db);

        const added = await addPageFlag({ db, beat: 15, splitMoves: true });

        expect(added.splitMoves).toEqual({ split: [b], leftAlone: [a] });
        expect(await rowsOf(db, a)).toEqual(aRows);
        expect(await rowsOf(db, b)).toEqual([
            [9, 15, 0],
            [15, 17, 0],
        ]);
        expectSamePositions(await positions(db), positionsBefore);
        expect(await violations(db)).toEqual([]);
    });

    it("Expert (splitMoves off) writes only the page rows; the move then crosses the flag", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { a } = await madeInTimelineMode(db);
        await range(db, a, 9, 17, A);
        const before = await snapshot(db, TIMELINE_TABLES);

        const added = await addPageFlag({ db, beat: 13 });

        expect(added.splitMoves).toBeUndefined();
        expect(await snapshot(db, TIMELINE_TABLES)).toEqual(before);
        expect(await rowsOf(db, a)).toEqual([[9, 17, 0]]);
        expect(await lockedAnywhere(db)).toEqual([a]);
    });
});

describeDbTests(
    "Basic Split page (inspector) splits moves at the new page",
    (it) => {
        /** Page 2: beats 9 to 16, so Split page starts the new page at beat 13 */
        const page2 = {
            beats: [9, 10, 11, 12, 13, 14, 15, 16].map((id) => ({ id })),
            nextPageId: 3,
        } as unknown as Pick<Page, "beats" | "nextPageId">;

        it("splits own moves at the new page's start; every position is unchanged", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await madeInTimelineMode(db);
            await range(db, a, 9, 17, A);
            await range(db, b, 1, 9, B);
            await clearHistory(db);
            const positionsBefore = await positions(db);
            const before = await snapshot(db);

            await _splitPage({ page: page2, splitMoves: true, database: db });

            expect((await boxes(db)).slice(0, 3)).toEqual([
                { start: 1, end: 9 },
                { start: 9, end: 13 },
                { start: 13, end: 17 },
            ]);
            expect(await rowsOf(db, a)).toEqual([
                [9, 13, 0],
                [13, 17, 0],
            ]);
            expect(await rowsOf(db, b)).toEqual([[1, 9, 0]]);
            expectSamePositions(await positions(db), positionsBefore);
            expect(await lockedAnywhere(db)).toEqual([]);
            expect(await violations(db)).toEqual([]);
            await oneUndoStep(db, before, await snapshot(db));
        });
    },
);
