import { and, asc, eq, sql } from "drizzle-orm";
import { describe, expect } from "vitest";
import { Path, QuadraticCurve } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { createLastPage, deletePages } from "../page";
import { restoreCarriedRuns, updateMarcherPages } from "../marcherPage";
import { performRedo, performUndo } from "../history";
import { createAllUndoTriggers, dropUndoTriggers } from "../historyTriggers";

// These tests write marcher pages, which only page mode allows
keepFixturesInPageMode("page-mode carry forward writes marcher_pages");

/**
 * Coverage gaps of the defined-coordinates change catalog
 * (docs/timeline/research/defined-coordinates/CHANGES.md section 7) in page mode:
 *
 * - gap 7: **Only Page N** after a carry, then undo and redo, and the edits after it;
 * - B-19: a file without `pathways` history triggers gets them when the app creates its triggers on
 *   open (`createAllUndoTriggers`, `App.tsx`), and a pathway end an edit moves is then undone.
 */

const M = 1;

const orderedPages = async (db: DbConnection) =>
    await db
        .select({ id: schema.pages.id, position: schema.beats.position })
        .from(schema.pages)
        .innerJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .orderBy(asc(schema.beats.position))
        .all();

/** Keeps the first two pages, then adds `extra` pages (each a copy of the one before) */
const showWithPages = async (db: DbConnection, extra: number) => {
    const pages = await orderedPages(db);
    await deletePages({
        db,
        pageIds: new Set(pages.slice(2).map((p) => p.id)),
    });
    for (let i = 0; i < extra; i++)
        await createLastPage({ db, newPageCounts: 4, createNewBeats: true });
    return (await orderedPages(db)).map((p) => p.id);
};

const rowOf = async (db: DbConnection, marcherId: number, pageId: number) =>
    (await db
        .select()
        .from(schema.marcher_pages)
        .where(
            and(
                eq(schema.marcher_pages.marcher_id, marcherId),
                eq(schema.marcher_pages.page_id, pageId),
            ),
        )
        .get())!;

/** "x,y" per page in page order */
const spots = async (db: DbConnection, marcherId = M) => {
    const out: string[] = [];
    for (const page of await orderedPages(db)) {
        const r = await rowOf(db, marcherId, page.id);
        out.push(`${r.x},${r.y}`);
    }
    return out;
};

const edit = (db: DbConnection, pageId: number, x: number, y: number) =>
    updateMarcherPages({
        db,
        modifiedMarcherPages: [{ marcher_id: M, page_id: pageId, x, y }],
    });

const pathEnd = async (db: DbConnection, id: number) =>
    Path.fromJson(
        (await db.query.pathways.findFirst({
            where: eq(schema.pathways.id, id),
        }))!.path_data,
    ).getLastPoint();

describeDbTests("gap 7: Only Page N, then more steps", (it) => {
    it("edit, Only Page 2, then undo, undo, redo, redo: one step each", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ps = await showWithPages(db, 3);
        const before = await spots(db);
        const result = await edit(db, ps[2], 123, 456);
        const carried = await spots(db);
        expect(carried.slice(2)).toEqual(["123,456", "123,456", "123,456"]);

        await restoreCarriedRuns({ db, carried: result.carried });
        const only = await spots(db);
        expect(only.slice(2)).toEqual(["123,456", before[3], before[4]]);

        expect((await performUndo(db)).success).toBe(true);
        expect(await spots(db)).toEqual(carried);
        expect((await performUndo(db)).success).toBe(true);
        expect(await spots(db)).toEqual(before);
        expect((await performRedo(db)).success).toBe(true);
        expect(await spots(db)).toEqual(carried);
        expect((await performRedo(db)).success).toBe(true);
        expect(await spots(db)).toEqual(only);
    });

    it("after Only Page 2, a second edit of page 2 no longer carries into the pages put back", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ps = await showWithPages(db, 3);
        const before = await spots(db);
        const first = await edit(db, ps[2], 123, 456);
        await restoreCarriedRuns({ db, carried: first.carried });

        const second = await edit(db, ps[2], 200, 200);

        // Pages 3 and 4 hold the old spot again, not page 2's: they are no longer copies of it
        expect(second.carried).toEqual([]);
        expect(second.followedPageIds).toEqual([]);
        expect((await spots(db)).slice(2)).toEqual([
            "200,200",
            before[3],
            before[4],
        ]);
    });

    it("after Only Page 2, an edit of page 3 carries to page 4 (still its copy)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ps = await showWithPages(db, 3);
        const first = await edit(db, ps[2], 123, 456);
        await restoreCarriedRuns({ db, carried: first.carried });

        const next = await edit(db, ps[3], 7, 8);

        expect(next.followedPageIds).toEqual([ps[4]]);
        expect((await spots(db)).slice(2)).toEqual(["123,456", "7,8", "7,8"]);
    });

    it("Only Page 2 clicked after the edit was undone restores nothing and writes no step", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ps = await showWithPages(db, 3);
        const before = await spots(db);
        const result = await edit(db, ps[2], 123, 456);
        expect((await performUndo(db)).success).toBe(true);
        const undoRows = (await db.select().from(schema.history_undo).all())
            .length;

        const restored = await restoreCarriedRuns({
            db,
            carried: result.carried,
        });

        expect(restored).toEqual([]);
        expect(await spots(db)).toEqual(before);
        expect((await db.select().from(schema.history_undo).all()).length).toBe(
            undoRows,
        );
    });
});

describeDbTests(
    "B-19: pathway undo triggers created on open for an existing file",
    (it) => {
        /** Marcher M curves to (300, 300) on page 2; pages 3 and 4 hold there. */
        const curvedShow = async (db: DbConnection) => {
            const ps = await showWithPages(db, 3);
            const from = await rowOf(db, M, ps[1]);
            const pathway = (await db
                .insert(schema.pathways)
                .values({
                    path_data: new Path([
                        new QuadraticCurve(
                            { x: from.x, y: from.y },
                            { x: from.x, y: 300 },
                            { x: 300, y: 300 },
                        ),
                    ]).toJson(),
                })
                .returning()
                .get())!;
            await db
                .update(schema.marcher_pages)
                .set({ x: 300, y: 300, path_data_id: pathway.id })
                .where(
                    and(
                        eq(schema.marcher_pages.marcher_id, M),
                        eq(schema.marcher_pages.page_id, ps[2]),
                    ),
                );
            await db
                .update(schema.marcher_pages)
                .set({ x: 300, y: 300 })
                .where(
                    and(
                        eq(schema.marcher_pages.marcher_id, M),
                        sql`${schema.marcher_pages.page_id} IN (${ps[3]}, ${ps[4]})`,
                    ),
                );
            return { ps, pathwayId: pathway.id };
        };

        const triggerNames = async (db: DbConnection) =>
            (
                (await db.all(
                    sql`SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'pathways'`,
                )) as unknown[]
            )
                .map((r) =>
                    String(
                        Array.isArray(r) ? r[0] : (r as { name: string }).name,
                    ),
                )
                .filter((n) => /_(it|ut|dt)$/.test(n))
                .sort();

        it("without them (an older file), undo puts the marcher back but leaves the curve's end where the edit put it", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { ps, pathwayId } = await curvedShow(db);
            await dropUndoTriggers(db, "pathways");
            expect(await triggerNames(db)).toEqual([]);

            await edit(db, ps[2], 111, 222);
            expect(await pathEnd(db, pathwayId)).toEqual({ x: 111, y: 222 });
            expect((await performUndo(db)).success).toBe(true);

            expect((await spots(db)).slice(2)).toEqual([
                "300,300",
                "300,300",
                "300,300",
            ]);
            expect(await pathEnd(db, pathwayId)).toEqual({ x: 111, y: 222 });
        });

        it("opening the file creates them, and the next edit's curve end is undone and redone with it", async ({
            db,
            marchersAndPages: _,
        }) => {
            const { ps, pathwayId } = await curvedShow(db);
            await dropUndoTriggers(db, "pathways");

            // What the app runs once the database is ready (App.tsx), and a new show does too
            await createAllUndoTriggers(db);
            expect(await triggerNames(db)).toEqual([
                "pathways_dt",
                "pathways_it",
                "pathways_ut",
            ]);
            // Creating them again (every open) is harmless
            await createAllUndoTriggers(db);

            await edit(db, ps[2], 111, 222);
            expect(await pathEnd(db, pathwayId)).toEqual({ x: 111, y: 222 });

            expect((await performUndo(db)).success).toBe(true);
            expect(await pathEnd(db, pathwayId)).toEqual({ x: 300, y: 300 });
            expect((await spots(db)).slice(2)).toEqual([
                "300,300",
                "300,300",
                "300,300",
            ]);
            expect((await performRedo(db)).success).toBe(true);
            expect(await pathEnd(db, pathwayId)).toEqual({ x: 111, y: 222 });
            expect((await spots(db)).slice(2)).toEqual([
                "111,222",
                "111,222",
                "111,222",
            ]);
        });
    },
);

describe("history", () => {
    describeDbTests("page-mode follow-up chains", (it) => {
        const testWithHistory = getTestWithHistory(it, [
            schema.marcher_pages,
            schema.pathways,
        ]);
        testWithHistory(
            "an edit, Only Page N and a later edit undo one at a time",
            async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
                // Pages 3 to 5 are added as copies of page 2 (in history, as the app adds them)
                const ids = await showWithPages(db, 3);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                const result = await edit(db, ids[1]!, 123, 456);
                await restoreCarriedRuns({ db, carried: result.carried });
                await edit(db, ids[2]!, 7, 8);
                await expectNumberOfChanges.test(db, 3, state);
            },
        );
    });
});
