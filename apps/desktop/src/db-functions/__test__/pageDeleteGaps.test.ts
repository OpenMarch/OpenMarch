import { describe, expect } from "vitest";
import { getTableName, sql } from "drizzle-orm";
import { createResolver, type Resolver } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/timeline/convert/writePageConversion";
import { readTimelineTables } from "@/timeline/timelineRows";
import { performHistoryAction, performRedo, performUndo } from "../history";
import { deletePageFlags } from "../pageFlags";
import { deletePagesWithMoves } from "../pageDelete";
import { moveMarchersInTarget } from "../timelineMoves";
import { readPageGrid } from "../timelineRipple";

keepFixturesInPageMode(
    "its tests build their own timeline state: a show made in timeline mode",
);

/**
 * Coverage gaps 5 and 8 of the defined-coordinates change catalog
 * (docs/timeline/research/defined-coordinates/CHANGES.md section 7): a window move that ends at a
 * deleted page's flag (B-07), and the delete toast's **Undo** after a later edit (B-10).
 *
 * The show is `marchersAndPages`: page 0 plus pages 1 to 6 (ids 1 to 6), 8 counts each, so page N's
 * box is `[8N - 7, 8N + 1)` and its flag is at beat `8N + 1`.
 */

const TABLES = [
    schema.beats,
    schema.pages,
    schema.utility,
    schema.marchers,
    schema.marcher_pages,
    schema.tag_appearances,
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

const pageIds = async (db: DbConnection) =>
    (await db.transaction((tx) => readPageGrid(tx))).pages.map((p) => p.id);

/** Marcher `id`'s rows as `[start, end, layer]`, in order. */
const rowsOf = async (db: DbConnection, id: number) =>
    (await db.select().from(schema.timeline_assignments).all())
        .filter((r) => r.marcher_id === id)
        .map((r) => [r.start_beat, r.end_beat, r.layer])
        .sort((a, b) => a[0]! - b[0]! || a[2]! - b[2]!);

const timelineRanges = async (db: DbConnection) =>
    (await db.select().from(schema.timelines).all())
        .map((t) => [t.start_beat, t.end_beat])
        .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);

describeDbTests(
    "gap 5: a cross-page window move ending at a deleted page's flag (B-07)",
    (it) => {
        /**
         * Marcher `a` moved in a window over pages 1 and 2 (`[1, 17)`), drawn over held pages, so
         * it is the marcher's only row there and sits at layer 0: the shape of a page move.
         */
        const windowOverPages1And2 = async (db: DbConnection) => {
            await madeInTimelineMode(db);
            const [a, b] = await marcherIds(db);
            await moveMarchersInTarget({
                db,
                target: { kind: "range", start: 1, end: 17 },
                moves: [{ marcherId: a!, x: 300, y: 200 }],
            });
            await clearHistory(db);
            expect(await rowsOf(db, a!)).toEqual([[1, 17, 0]]);
            return { a: a!, b: b! };
        };

        it("Delete page and its moves on page 2 keeps the user's window move over pages 1-2 (V-149)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await windowOverPages1And2(db);

            const result = await deletePagesWithMoves({
                db,
                pageIds: new Set([2]),
            });

            // It starts before page 2's box, so it isn't page 2's move: it stays, and still ends at
            // beat 17, now page 1's flag
            expect(await rowsOf(db, a)).toEqual([[1, 17, 0]]);
            expect(await timelineRanges(db)).toEqual([[1, 17]]);
            const after = await resolverOf(db);
            for (const beat of [17, 25, 49])
                expect(after.positionAt(a, beat)).toEqual([300, 200]);
            // Page 1's flag (9 before, 17 now) went from partway along the move to its end; later
            // pages keep their look
            expect(result.changedPages.map((p) => p.id)).toEqual([1]);
        });

        it("a window over pages 1-3 stays when page 3 is deleted with its moves", async ({
            db,
            marchersAndPages: _,
        }) => {
            await madeInTimelineMode(db);
            const [a] = await marcherIds(db);
            await moveMarchersInTarget({
                db,
                target: { kind: "range", start: 1, end: 25 },
                moves: [{ marcherId: a!, x: 300, y: 200 }],
            });
            expect(await rowsOf(db, a!)).toEqual([[1, 25, 0]]);

            await deletePagesWithMoves({ db, pageIds: new Set([3]) });

            expect(await rowsOf(db, a!)).toEqual([[1, 25, 0]]);
            expect((await resolverOf(db)).positionAt(a!, 49)).toEqual([
                300, 200,
            ]);
        });

        it("a move inside the deleted page's box still goes with it, next to a kept window", async ({
            db,
            marchersAndPages: _,
        }) => {
            await madeInTimelineMode(db);
            const [a, b] = await marcherIds(db);
            await moveMarchersInTarget({
                db,
                target: { kind: "range", start: 1, end: 17 },
                moves: [{ marcherId: a!, x: 300, y: 200 }],
            });
            await moveMarchersInTarget({
                db,
                target: { kind: "range", start: 9, end: 17 },
                moves: [{ marcherId: b!, x: 50, y: 50 }],
            });
            const homeB = (await resolverOf(db)).positionAt(b!, 0);

            await deletePagesWithMoves({ db, pageIds: new Set([2]) });

            expect(await rowsOf(db, a!)).toEqual([[1, 17, 0]]);
            expect(await rowsOf(db, b!)).toEqual([]);
            expect((await resolverOf(db)).positionAt(b!, 25)).toEqual(homeB);
        });

        it("deleting a page inside the window (not at its end) keeps the move, which ends a page earlier", async ({
            db,
            marchersAndPages: _,
        }) => {
            await madeInTimelineMode(db);
            const [a] = await marcherIds(db);
            await moveMarchersInTarget({
                db,
                target: { kind: "range", start: 1, end: 25 },
                moves: [{ marcherId: a!, x: 300, y: 200 }],
            });

            await deletePagesWithMoves({ db, pageIds: new Set([2]) });

            // Page 1 takes page 2's beats; the window's end flag (page 3's) stays at 25
            expect(await rowsOf(db, a!)).toEqual([[1, 25, 0]]);
            expect((await resolverOf(db)).positionAt(a!, 25)).toEqual([
                300, 200,
            ]);
        });

        it("Delete page (the flag delete) keeps the window move and every later page's look", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await windowOverPages1And2(db);
            await deletePageFlags({ db, pageIds: new Set([2]) });
            expect(await rowsOf(db, a)).toEqual([[1, 17, 0]]);
            expect((await resolverOf(db)).positionAt(a, 25)).toEqual([
                300, 200,
            ]);
        });

        it("drawn over stored page moves, the window sits at layer 1 and stays", async ({
            db,
            marchersAndPages: _,
        }) => {
            await madeInTimelineMode(db);
            const [a] = await marcherIds(db);
            // Page moves on pages 1 and 2 first
            await moveMarchersInTarget({
                db,
                target: { kind: "range", start: 1, end: 9 },
                moves: [{ marcherId: a!, x: 100, y: 100 }],
            });
            await moveMarchersInTarget({
                db,
                target: { kind: "range", start: 9, end: 17 },
                moves: [{ marcherId: a!, x: 150, y: 150 }],
            });
            await moveMarchersInTarget({
                db,
                target: { kind: "range", start: 1, end: 17 },
                moves: [{ marcherId: a!, x: 300, y: 200 }],
            });
            expect(await rowsOf(db, a!)).toEqual([
                [1, 9, 0],
                [1, 17, 1],
                [9, 17, 0],
            ]);

            await deletePagesWithMoves({ db, pageIds: new Set([2]) });

            // Page 2's own page move goes; the window (a track) stays
            expect(await rowsOf(db, a!)).toEqual([
                [1, 17, 0],
                [1, 17, 1],
            ]);
            expect((await resolverOf(db)).positionAt(a!, 17)).toEqual([
                300, 200,
            ]);
        });

        it("Undo brings the window move back", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a } = await windowOverPages1And2(db);
            const before = await snapshot(db);
            await deletePagesWithMoves({ db, pageIds: new Set([2]) });
            expect((await performUndo(db)).success).toBe(true);
            expect(await snapshot(db)).toEqual(before);
            expect(await rowsOf(db, a)).toEqual([[1, 17, 0]]);
        });
    },
);

describeDbTests(
    "gap 8: the delete toast's Undo after a later edit (B-10)",
    (it) => {
        /** The owner's S4: marchers A and B move on page 2; pages 3 and 4 hold there. */
        const S4 = async (db: DbConnection) => {
            await madeInTimelineMode(db);
            const [a, b] = await marcherIds(db);
            await moveMarchersInTarget({
                db,
                target: { kind: "range", start: 9, end: 17 },
                moves: [
                    { marcherId: a!, x: 300, y: 200 },
                    { marcherId: b!, x: 320, y: 220 },
                ],
            });
            await clearHistory(db);
            return { a: a!, b: b! };
        };

        // The toast's Undo is `usePerformHistoryAction("undo")`, i.e. `performHistoryAction("undo")`:
        // the app's normal undo, which takes back the latest edit, whatever it is
        const toastUndo = (db: DbConnection) =>
            performHistoryAction("undo", db);

        // Why the toast closes on the next history change (usePageFlags `toastDeleteWithMoves`)
        it("after another edit, the app's undo takes back that edit, not the delete", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { a, b } = await S4(db);
            const beforeDelete = await snapshot(db);
            await deletePagesWithMoves({ db, pageIds: new Set([2]) });
            const afterDelete = await snapshot(db);
            expect(await pageIds(db)).toEqual([0, 1, 3, 4, 5, 6]);

            // A later edit: B moves on the page now covering beats 25-33
            await moveMarchersInTarget({
                db,
                target: { kind: "range", start: 25, end: 33 },
                moves: [{ marcherId: b, x: 10, y: 10 }],
            });

            expect((await toastUndo(db)).failure).toBeUndefined();
            // The later edit is gone; page 2 is still deleted
            expect(await snapshot(db)).toEqual(afterDelete);
            expect(await pageIds(db)).toEqual([0, 1, 3, 4, 5, 6]);

            // A second Undo is the one that brings page 2 back
            expect((await toastUndo(db)).failure).toBeUndefined();
            expect(await snapshot(db)).toEqual(beforeDelete);
            expect((await resolverOf(db)).positionAt(a, 25)).toEqual([
                300, 200,
            ]);
        });

        it("with no edit in between, Undo takes back exactly the delete; redo deletes again", async ({
            db,
            marchersAndPages: _,
        }) => {
            await S4(db);
            const beforeDelete = await snapshot(db);
            await deletePagesWithMoves({ db, pageIds: new Set([2]) });
            const afterDelete = await snapshot(db);
            expect((await toastUndo(db)).failure).toBeUndefined();
            expect(await snapshot(db)).toEqual(beforeDelete);
            expect((await performRedo(db)).success).toBe(true);
            expect(await snapshot(db)).toEqual(afterDelete);
        });
    },
);

describe("history", () => {
    describeDbTests("gap 5 and 8 edits", (it) => {
        const testWithHistory = getTestWithHistory(it, TABLES);
        testWithHistory(
            "a window move, Delete page and its moves on its end page, and a later edit undo one at a time",
            async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
                await setTimelineFlag(db);
                await convertPagesToTimeline(db);
                const [a, b] = await marcherIds(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                await moveMarchersInTarget({
                    db,
                    target: { kind: "range", start: 1, end: 17 },
                    moves: [{ marcherId: a!, x: 300, y: 200 }],
                });
                await deletePagesWithMoves({ db, pageIds: new Set([2]) });
                await moveMarchersInTarget({
                    db,
                    target: { kind: "range", start: 25, end: 33 },
                    moves: [{ marcherId: b!, x: 10, y: 10 }],
                });
                await expectNumberOfChanges.test(db, 3, state);
            },
        );
    });
});
