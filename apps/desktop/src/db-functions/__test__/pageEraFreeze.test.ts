import { describe, expect } from "vitest";
import { eq } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { sql } from "drizzle-orm";
import {
    keepFixturesInPageMode,
    setTimelineModeFlag,
    withPageEraFreezeLifted,
} from "@/test/timelineMode";
import { swapMarchers, updateMarcherPages } from "../marcherPage";
import { createMarchers, deleteMarchers } from "../marcher";
import { createPages, deletePages } from "../page";
import {
    getRedoStackLength,
    getUndoStackLength,
    performHistoryAction,
    performRedo,
    performUndo,
} from "../history";
import { PAGE_ERA_FROZEN_MESSAGE } from "../pageEraFreeze";
import { TimelineWriteError } from "../timelineErrors";

/**
 * P9.5: in timeline mode the page-era position writers refuse with a message (`E-ARGS`) before
 * writing, and the marcher and page procedures stop writing `marcher_pages`, which the freeze
 * triggers would refuse. Deleting a marcher or a page still takes its frozen rows with it, and
 * undo and redo of that delete put them back and take them away again. With the flag off
 * (page mode) every writer works as before.
 */

// The tests pick the mode themselves; in timeline mode they need no converted show
keepFixturesInPageMode("each test sets the timeline flag itself");

const marcherPages = (db: DbConnection) =>
    db
        .select()
        .from(schema.marcher_pages)
        .orderBy(schema.marcher_pages.id)
        .all();

const marcherPagesOf = async (
    db: DbConnection,
    where: { marcherId?: number; pageId?: number },
) =>
    (await marcherPages(db)).filter(
        (mp) =>
            (where.marcherId == null || mp.marcher_id === where.marcherId) &&
            (where.pageId == null || mp.page_id === where.pageId),
    );

const expectFrozenRefusal = async (write: () => Promise<unknown>) => {
    const error = await write().then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe("E-ARGS");
    expect((error as Error).message).toBe(`E-ARGS: ${PAGE_ERA_FROZEN_MESSAGE}`);
};

/** The undo group on top of the stack (0 when it's empty) */
const topUndoGroup = async (db: DbConnection) =>
    (
        await db
            .select({
                g: sql<number>`max(${schema.history_undo.history_group})`,
            })
            .from(schema.history_undo)
            .get()
    )?.g ?? 0;

const NEW_MARCHER = { section: "Brass", drill_prefix: "Z", drill_order: 1 };
/** After the fixture's last page (page 6 starts on beat 41). */
const NEW_PAGE = { start_beat: 49, is_subset: false };

describeDbTests("page-era writes (P9.5)", (it) => {
    describe("in timeline mode", () => {
        it("updateMarcherPages refuses with a message and writes nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineModeFlag(db, true);
            const before = await marcherPages(db);
            await expectFrozenRefusal(() =>
                updateMarcherPages({
                    db,
                    modifiedMarcherPages: [
                        { marcher_id: 1, page_id: 1, x: 1, y: 2 },
                    ],
                }),
            );
            expect(await marcherPages(db)).toEqual(before);
        });

        it("swapMarchers refuses with a message and writes nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineModeFlag(db, true);
            const before = await marcherPages(db);
            await expectFrozenRefusal(() =>
                swapMarchers({ db, pageId: 1, marcher1Id: 1, marcher2Id: 2 }),
            );
            expect(await marcherPages(db)).toEqual(before);
        });

        it("createMarchers adds the marcher with a home and no marcher pages", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineModeFlag(db, true);
            const before = await marcherPages(db);
            const [created] = await createMarchers({
                db,
                newMarchers: [NEW_MARCHER],
            });
            expect(created).toBeDefined();
            expect(await marcherPages(db)).toEqual(before);
            const marcher = await db.query.marchers.findFirst({
                where: eq(schema.marchers.id, created!.id),
            });
            expect(marcher).toBeDefined();
        });

        it("createPages adds the page with no marcher pages", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineModeFlag(db, true);
            const before = await marcherPages(db);
            const [created] = await createPages({ db, newPages: [NEW_PAGE] });
            expect(created).toBeDefined();
            expect(await marcherPages(db)).toEqual(before);
        });

        it("deleteMarchers takes the marcher's frozen rows; undo puts them back, redo removes them", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineModeFlag(db, true);
            const before = await marcherPages(db);
            const own = await marcherPagesOf(db, { marcherId: 1 });
            expect(own.length).toBeGreaterThan(0);

            await deleteMarchers({ db, marcherIds: new Set([1]) });
            expect(await marcherPagesOf(db, { marcherId: 1 })).toEqual([]);
            expect(await marcherPages(db)).toHaveLength(
                before.length - own.length,
            );

            await performUndo(db);
            expect(await marcherPages(db)).toEqual(before);

            await performRedo(db);
            expect(await marcherPagesOf(db, { marcherId: 1 })).toEqual([]);
            expect(await marcherPages(db)).toHaveLength(
                before.length - own.length,
            );
        });

        it("deletePages takes the page's frozen rows; undo puts them back, redo removes them", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineModeFlag(db, true);
            const before = await marcherPages(db);
            const own = await marcherPagesOf(db, { pageId: 3 });
            expect(own.length).toBeGreaterThan(0);

            await deletePages({ db, pageIds: new Set([3]) });
            expect(await marcherPagesOf(db, { pageId: 3 })).toEqual([]);
            expect(await marcherPages(db)).toHaveLength(
                before.length - own.length,
            );

            await performUndo(db);
            expect(await marcherPages(db)).toEqual(before);

            await performRedo(db);
            expect(await marcherPagesOf(db, { pageId: 3 })).toEqual([]);
        });
    });

    describe("undo and redo the freeze refuses", () => {
        it("an undo that would delete frozen rows (a page created with marcher pages before P9.5) is skipped and dropped", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineModeFlag(db, true);
            // What a timeline-mode file from before P9.5 can hold: a page created with marcher
            // pages, whose undo deletes them while the page still exists
            const [page] = await withPageEraFreezeLifted(db, () =>
                createPages({ db, newPages: [NEW_PAGE] }),
            );
            const rows = await marcherPagesOf(db, { pageId: page!.id });
            expect(rows.length).toBeGreaterThan(0);
            const topGroup = await topUndoGroup(db);
            const topGroupSize = (
                await db
                    .select()
                    .from(schema.history_undo)
                    .where(eq(schema.history_undo.history_group, topGroup))
                    .all()
            ).length;
            expect(topGroupSize).toBeGreaterThan(0);
            const undoBefore = await getUndoStackLength(db);
            const redoBefore = await getRedoStackLength(db);

            const response = await performHistoryAction("undo", db);

            expect(response.failure).toEqual({ kind: "page-era-frozen" });
            expect(await topUndoGroup(db)).toBeLessThan(topGroup);
            // Nothing applied, and the step is gone from the undo stack, with no redo for it
            expect(await marcherPagesOf(db, { pageId: page!.id })).toEqual(
                rows,
            );
            expect(
                await db.query.pages.findFirst({
                    where: eq(schema.pages.id, page!.id),
                }),
            ).toBeDefined();
            expect(await getUndoStackLength(db)).toBe(
                undoBefore - topGroupSize,
            );
            expect(await getRedoStackLength(db)).toBe(redoBefore);

            // The next undo isn't stuck behind it
            const next = await performHistoryAction("undo", db);
            expect(next.failure).not.toEqual({ kind: "page-era-frozen" });
        });

        it("any other failed undo is reported and leaves both stacks alone", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineModeFlag(db, true);
            const group = (await topUndoGroup(db)) + 1;
            await db.insert(schema.history_undo).values({
                history_group: group,
                sql: `UPDATE "marchers" SET "no_such_column" = 1 WHERE rowid = 1`,
            });
            const undoBefore = await getUndoStackLength(db);
            const redoBefore = await getRedoStackLength(db);

            const response = await performHistoryAction("undo", db);

            expect(response.failure?.kind).toBe("error");
            expect(await getUndoStackLength(db)).toBe(undoBefore);
            expect(await getRedoStackLength(db)).toBe(redoBefore);
        });
    });

    // Guard: page mode is unchanged
    describe("in page mode", () => {
        it("updateMarcherPages and swapMarchers write marcher pages", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineModeFlag(db, false);
            await updateMarcherPages({
                db,
                modifiedMarcherPages: [
                    { marcher_id: 1, page_id: 1, x: 1, y: 2 },
                ],
            });
            expect(
                await marcherPagesOf(db, { marcherId: 1, pageId: 1 }),
            ).toEqual([expect.objectContaining({ x: 1, y: 2 })]);
            const [m2] = await marcherPagesOf(db, { marcherId: 2, pageId: 1 });

            await swapMarchers({ db, pageId: 1, marcher1Id: 1, marcher2Id: 2 });
            expect(
                await marcherPagesOf(db, { marcherId: 1, pageId: 1 }),
            ).toEqual([expect.objectContaining({ x: m2!.x, y: m2!.y })]);
            expect(
                await marcherPagesOf(db, { marcherId: 2, pageId: 1 }),
            ).toEqual([expect.objectContaining({ x: 1, y: 2 })]);
        });

        it("createMarchers and createPages add marcher pages; deletes remove them", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineModeFlag(db, false);
            const pageCount = (await db.select().from(schema.pages).all())
                .length;
            const [marcher] = await createMarchers({
                db,
                newMarchers: [NEW_MARCHER],
            });
            expect(
                await marcherPagesOf(db, { marcherId: marcher!.id }),
            ).toHaveLength(pageCount);

            const marcherCount = (await db.select().from(schema.marchers).all())
                .length;
            const [page] = await createPages({ db, newPages: [NEW_PAGE] });
            expect(await marcherPagesOf(db, { pageId: page!.id })).toHaveLength(
                marcherCount,
            );

            await deletePages({ db, pageIds: new Set([page!.id]) });
            expect(await marcherPagesOf(db, { pageId: page!.id })).toEqual([]);
            await deleteMarchers({ db, marcherIds: new Set([marcher!.id]) });
            expect(
                await marcherPagesOf(db, { marcherId: marcher!.id }),
            ).toEqual([]);
        });
    });
});
