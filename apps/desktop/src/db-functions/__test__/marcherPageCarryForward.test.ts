import { and, asc, eq, sql } from "drizzle-orm";
import { describe, expect } from "vitest";
import { Path, QuadraticCurve, Line } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { createLastPage, createPages, deletePages } from "../page";
import {
    restoreCarriedRuns,
    swapMarchers,
    updateMarcherPages,
} from "../marcherPage";
import { createMarchers } from "../marcher";
import { createShapePages } from "../shapePages";
import {
    performHistoryAction,
    performRedo,
    performUndo,
    rowIdFromSql,
} from "../history";
import { createAllUndoTriggers, dropUndoTriggers } from "../historyTriggers";
import { carryForwardMessage } from "@/utilities/carryForwardToast";

// These tests write marcher pages, which only page mode allows
keepFixturesInPageMode("page-mode carry forward writes marcher_pages");

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

/** "x,y" per page in page order, with "~P<id>" for a pathway */
const spots = async (db: DbConnection, marcherId = M) => {
    const out: string[] = [];
    for (const page of await orderedPages(db)) {
        const r = await rowOf(db, marcherId, page.id);
        out.push(
            `${r.x},${r.y}${r.path_data_id != null ? `~P${r.path_data_id}` : ""}`,
        );
    }
    return out;
};

const edit = (
    db: DbConnection,
    pageId: number,
    x: number,
    y: number,
    options: { marcherId?: number; carryForward?: boolean } = {},
) =>
    updateMarcherPages({
        db,
        modifiedMarcherPages: [
            { marcher_id: options.marcherId ?? M, page_id: pageId, x, y },
        ],
        carryForward: options.carryForward,
    });

const undoRowCount = async (db: DbConnection) =>
    (await db.select({ n: sql<number>`count(*)` }).from(schema.history_undo))[0]
        .n;

const pathData = async (db: DbConnection, id: number) =>
    Path.fromJson(
        (await db.query.pathways.findFirst({
            where: eq(schema.pathways.id, id),
        }))!.path_data,
    );

/** Gives marcher M on `pageId` a curved move to (x, y) from where it was on the page before */
const curveTo = async (
    db: DbConnection,
    previousPageId: number,
    pageId: number,
    x: number,
    y: number,
) => {
    const from = await rowOf(db, M, previousPageId);
    const path = new Path([
        new QuadraticCurve(
            { x: from.x, y: from.y },
            { x: from.x, y },
            { x, y },
        ),
    ]);
    const pathway = (await db
        .insert(schema.pathways)
        .values({ path_data: path.toJson() })
        .returning()
        .get())!;
    await db
        .update(schema.marcher_pages)
        .set({ x, y, path_data_id: pathway.id })
        .where(
            and(
                eq(schema.marcher_pages.marcher_id, M),
                eq(schema.marcher_pages.page_id, pageId),
            ),
        );
    return pathway.id;
};

describeDbTests("page mode carries an edit forward", (it) => {
    it("owner scenario: pages copied from page 2 follow an edit of page 2", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ps = await showWithPages(db, 3);
        const before = await spots(db);
        const otherBefore = await spots(db, 2);

        const result = await edit(db, ps[2], 123, 456);

        const after = await spots(db);
        expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
        expect(after.slice(2)).toEqual(["123,456", "123,456", "123,456"]);
        expect(result.followedPageIds).toEqual([ps[3], ps[4]]);
        expect(result.carried).toHaveLength(1);
        expect(result.carried[0]).toMatchObject({
            marcherId: M,
            pageId: ps[2],
            x: 123,
            y: 456,
        });
        expect(result.carried[0].rows.map((r) => r.pageId)).toEqual([
            ps[3],
            ps[4],
        ]);
        // Other marchers aren't touched
        expect(await spots(db, 2)).toEqual(otherBefore);
    });

    it("back to the opening set: a later page on the same spot after real moves doesn't follow", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ps = await showWithPages(db, 3);
        const opening = await rowOf(db, M, ps[1]);
        await edit(db, ps[2], 200, 200);
        await edit(db, ps[3], 300, 300);
        // Back to the opening set on the last page
        await edit(db, ps[4], opening.x, opening.y);
        const before = await spots(db);

        const result = await edit(db, ps[1], 11, 11);

        const after = await spots(db);
        expect(after[1]).toBe("11,11");
        expect(after.slice(2)).toEqual(before.slice(2));
        expect(result.followedPageIds).toEqual([]);
    });

    it("a marcher standing still for 41 pages moves on all of them", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ps = await showWithPages(db, 40);
        expect(ps).toHaveLength(42);

        const result = await edit(db, ps[1], 10, 20);

        const after = await spots(db);
        expect(after.slice(1).every((s) => s === "10,20")).toBe(true);
        expect(result.followedPageIds).toEqual(ps.slice(2));
    });

    it("known limit (merge leak): a page moved onto the same spot on purpose follows too", async ({
        db,
        marchersAndPages: _,
    }) => {
        // 07b §1d. Equality can't tell a copy from a deliberate move back onto the same spot, so
        // page 4's own 400 is lost when page 2 (which arrived there early) is edited again. The
        // toast's "Only Page N" and undo are the way back. This asserts the current behavior.
        const ps = await showWithPages(db, 4);
        await edit(db, ps[2], 200, 200);
        await edit(db, ps[4], 400, 400);
        await edit(db, ps[2], 400, 400); // arrives early: page 3 follows, page 4 already there
        expect((await spots(db)).slice(2)).toEqual([
            "400,400",
            "400,400",
            "400,400",
            "400,400",
        ]);

        const result = await edit(db, ps[2], 250, 250);

        expect((await spots(db)).slice(2)).toEqual([
            "250,250",
            "250,250",
            "250,250",
            "250,250",
        ]);
        expect(result.followedPageIds).toEqual([ps[3], ps[4], ps[5]]);
    });

    it("a write within the tolerance is skipped, and drift doesn't break a run", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ps = await showWithPages(db, 3);
        await edit(db, ps[1], 100.1, 200.2);
        const held = await rowOf(db, M, ps[2]);

        // A click that "moves" a marcher by fabric's round-trip drift writes nothing
        const historyBefore = await undoRowCount(db);
        const noop = await edit(db, ps[2], held.x + 1e-9, held.y - 1e-9);
        expect(noop.updatedIds).toEqual([]);
        expect(await undoRowCount(db)).toBe(historyBefore);
        expect((await rowOf(db, M, ps[2])).x).toBe(held.x);

        // Drift already stored (an older app wrote it) still counts as the same spot
        await db
            .update(schema.marcher_pages)
            .set({ x: held.x + 1e-9 })
            .where(eq(schema.marcher_pages.id, held.id));

        const result = await edit(db, ps[1], 50, 50);
        expect((await spots(db)).slice(1)).toEqual([
            "50,50",
            "50,50",
            "50,50",
            "50,50",
        ]);
        expect(result.followedPageIds).toEqual([ps[2], ps[3], ps[4]]);
    });

    it("a page where the marcher is in a shape stops the run", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ps = await showWithPages(db, 4);
        const v = await rowOf(db, M, ps[3]);
        await createShapePages({
            db,
            newItems: [
                {
                    page_id: ps[3],
                    marcher_coordinates: [{ marcher_id: M, x: v.x, y: v.y }],
                    svg_path: `M ${v.x} ${v.y} L ${v.x + 1} ${v.y + 1}`,
                },
            ],
        });
        const before = await spots(db);

        const result = await edit(db, ps[2], 222, 222);

        const after = await spots(db);
        expect(after[2]).toBe("222,222");
        expect(after.slice(3)).toEqual(before.slice(3));
        expect(result.followedPageIds).toEqual([]);
    });

    it("a shape edit carries forward to later pages that aren't in a shape (lead default)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ps = await showWithPages(db, 3);
        await createShapePages({
            db,
            newItems: [
                {
                    page_id: ps[2],
                    marcher_coordinates: [{ marcher_id: M, x: 333, y: 444 }],
                    svg_path: "M 333 444 L 334 445",
                },
            ],
        });
        expect((await spots(db)).slice(2)).toEqual([
            "333,444",
            "333,444",
            "333,444",
        ]);
    });

    it("carryForward: false writes only the given page", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ps = await showWithPages(db, 3);
        const before = await spots(db);
        const result = await edit(db, ps[2], 1, 2, { carryForward: false });
        const after = await spots(db);
        expect(after[2]).toBe("1,2");
        expect(after.slice(3)).toEqual(before.slice(3));
        expect(result.carried).toEqual([]);
    });

    it("Only Page N puts the followed pages back as its own undoable edit", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ps = await showWithPages(db, 3);
        const before = await spots(db);
        const result = await edit(db, ps[2], 123, 456);
        const carried = await spots(db);

        const restored = await restoreCarriedRuns({
            db,
            carried: result.carried,
        });

        expect(new Set(restored)).toEqual(new Set([ps[3], ps[4]]));
        const after = await spots(db);
        expect(after[2]).toBe("123,456");
        expect(after.slice(3)).toEqual(before.slice(3));

        // Undo takes back only the restore
        await performUndo(db);
        expect(await spots(db)).toEqual(carried);
        await performUndo(db);
        expect(await spots(db)).toEqual(before);
    });

    it("Only Page N leaves a page alone that changed since", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ps = await showWithPages(db, 3);
        const before = await spots(db);
        const result = await edit(db, ps[2], 123, 456);
        await edit(db, ps[4], 9, 9);

        await restoreCarriedRuns({ db, carried: result.carried });

        const after = await spots(db);
        expect(after[3]).toBe(before[3]);
        expect(after[4]).toBe("9,9");
    });

    it("swap carries both marchers forward", async ({
        db,
        marchersAndPages: _,
    }) => {
        const ps = await showWithPages(db, 2);
        const m1 = await rowOf(db, 1, ps[2]);
        const m2 = await rowOf(db, 2, ps[2]);

        const result = await swapMarchers({
            db,
            pageId: ps[2],
            marcher1Id: 1,
            marcher2Id: 2,
        });

        expect((await spots(db, 1)).slice(2)).toEqual([
            `${m2.x},${m2.y}`,
            `${m2.x},${m2.y}`,
        ]);
        expect((await spots(db, 2)).slice(2)).toEqual([
            `${m1.x},${m1.y}`,
            `${m1.x},${m1.y}`,
        ]);
        expect(result.followedPageIds).toEqual([ps[3]]);
    });

    describe("inserting and deleting pages", () => {
        it("a page inserted inside a run joins it", async ({
            db,
            marchersAndPages: _,
        }) => {
            const ps = await showWithPages(db, 3);
            const positions = await orderedPages(db);
            const between = await db
                .select()
                .from(schema.beats)
                .where(
                    and(
                        sql`${schema.beats.position} > ${positions[2].position}`,
                        sql`${schema.beats.position} < ${positions[3].position}`,
                    ),
                )
                .orderBy(asc(schema.beats.position))
                .get();
            expect(between).toBeDefined();
            const [inserted] = await createPages({
                db,
                newPages: [{ start_beat: between!.id, is_subset: false }],
            });

            const result = await edit(db, ps[2], 77, 77);

            expect(result.followedPageIds).toEqual([inserted.id, ps[3], ps[4]]);
        });

        it("deleting a copy inside a run keeps the run", async ({
            db,
            marchersAndPages: _,
        }) => {
            const ps = await showWithPages(db, 3);
            await deletePages({ db, pageIds: new Set([ps[3]]) });

            const result = await edit(db, ps[2], 66, 66);

            expect(result.followedPageIds).toEqual([ps[4]]);
        });
    });

    describe("pathways", () => {
        it("a new page holds: it doesn't copy the previous page's pathway", async ({
            db,
            marchersAndPages: _,
        }) => {
            const ps = await showWithPages(db, 1);
            const pathwayId = await curveTo(db, ps[1], ps[2], 300, 300);
            await createLastPage({
                db,
                newPageCounts: 4,
                createNewBeats: true,
            });
            const after = await spots(db);
            expect(after[2]).toBe(`300,300~P${pathwayId}`);
            expect(after[3]).toBe("300,300");
            const copy = await rowOf(db, M, (await orderedPages(db))[3].id);
            expect(copy.path_start_position).toBeNull();
            expect(copy.path_end_position).toBeNull();
        });

        it("editing page 2 doesn't bend page 2's own curve through a copy that shares it", async ({
            db,
            marchersAndPages: _,
        }) => {
            const ps = await showWithPages(db, 3);
            const pathwayId = await curveTo(db, ps[1], ps[2], 300, 300);
            // A file an older app wrote: pages 3 and 4 copied page 2's pathway
            await db
                .update(schema.marcher_pages)
                .set({ x: 300, y: 300, path_data_id: pathwayId })
                .where(
                    and(
                        eq(schema.marcher_pages.marcher_id, M),
                        sql`${schema.marcher_pages.page_id} IN (${ps[3]}, ${ps[4]})`,
                    ),
                );
            const start = (await pathData(db, pathwayId)).getStartPoint();

            await edit(db, ps[2], 310, 320);

            const path = await pathData(db, pathwayId);
            expect(path.getStartPoint()).toEqual(start);
            expect(path.getLastPoint()).toEqual({ x: 310, y: 320 });
            // The copies follow and hold (no copied pathway)
            expect((await spots(db)).slice(2)).toEqual([
                `310,320~P${pathwayId}`,
                "310,320",
                "310,320",
            ]);
        });

        it("Only Page 2 (no carry) leaves a shared pathway's start alone", async ({
            db,
            marchersAndPages: _,
        }) => {
            const ps = await showWithPages(db, 2);
            const pathwayId = await curveTo(db, ps[1], ps[2], 300, 300);
            await db
                .update(schema.marcher_pages)
                .set({ x: 300, y: 300, path_data_id: pathwayId })
                .where(
                    and(
                        eq(schema.marcher_pages.marcher_id, M),
                        eq(schema.marcher_pages.page_id, ps[3]),
                    ),
                );
            const start = (await pathData(db, pathwayId)).getStartPoint();

            await edit(db, ps[2], 310, 320, { carryForward: false });

            expect((await pathData(db, pathwayId)).getStartPoint()).toEqual(
                start,
            );
        });

        it("editing a copy that shares the previous page's pathway leaves that curve alone", async ({
            db,
            marchersAndPages: _,
        }) => {
            const ps = await showWithPages(db, 2);
            const pathwayId = await curveTo(db, ps[1], ps[2], 300, 300);
            await db
                .update(schema.marcher_pages)
                .set({ x: 300, y: 300, path_data_id: pathwayId })
                .where(
                    and(
                        eq(schema.marcher_pages.marcher_id, M),
                        eq(schema.marcher_pages.page_id, ps[3]),
                    ),
                );

            await edit(db, ps[3], 500, 100);

            expect((await pathData(db, pathwayId)).getLastPoint()).toEqual({
                x: 300,
                y: 300,
            });
            expect((await spots(db))[3]).toBe("500,100");
        });

        it("the run stops at a page with its own pathway, whose start moves with the run", async ({
            db,
            marchersAndPages: _,
        }) => {
            const ps = await showWithPages(db, 3);
            const held = await rowOf(db, M, ps[2]);
            // Page 4 curves away from where page 3 held, back onto the same spot
            const pathway = (await db
                .insert(schema.pathways)
                .values({
                    path_data: new Path([
                        new Line(
                            { x: held.x, y: held.y },
                            { x: held.x, y: held.y },
                        ),
                    ]).toJson(),
                })
                .returning()
                .get())!;
            await db
                .update(schema.marcher_pages)
                .set({ path_data_id: pathway.id })
                .where(
                    and(
                        eq(schema.marcher_pages.marcher_id, M),
                        eq(schema.marcher_pages.page_id, ps[4]),
                    ),
                );

            const result = await edit(db, ps[2], 42, 43);

            expect(result.followedPageIds).toEqual([ps[3]]);
            expect((await spots(db))[4]).toBe(
                `${held.x},${held.y}~P${pathway.id}`,
            );
            expect((await pathData(db, pathway.id)).getStartPoint()).toEqual({
                x: 42,
                y: 43,
            });
            expect(result.carried[0].nextPathwayId).toBe(pathway.id);
            expect(result.pathwayPageIds).toEqual([ps[4]]);
        });
    });

    describe("undo and redo", () => {
        it("undo puts back every carried row and both pathway ends in one step; redo reapplies", async ({
            db,
            marchersAndPages: _,
        }) => {
            const ps = await showWithPages(db, 4);
            const ownId = await curveTo(db, ps[1], ps[2], 300, 300);
            // Pages 3 and 4 hold there
            await db
                .update(schema.marcher_pages)
                .set({ x: 300, y: 300 })
                .where(
                    and(
                        eq(schema.marcher_pages.marcher_id, M),
                        sql`${schema.marcher_pages.page_id} IN (${ps[3]}, ${ps[4]})`,
                    ),
                );
            // Page 5 has its own move, starting where pages 2-4 hold
            const nextId = (await db
                .insert(schema.pathways)
                .values({
                    path_data: new Path([
                        new Line({ x: 300, y: 300 }, { x: 10, y: 10 }),
                    ]).toJson(),
                })
                .returning()
                .get())!.id;
            await db
                .update(schema.marcher_pages)
                .set({ x: 10, y: 10, path_data_id: nextId })
                .where(
                    and(
                        eq(schema.marcher_pages.marcher_id, M),
                        eq(schema.marcher_pages.page_id, ps[5]),
                    ),
                );
            const before = await spots(db);
            const ownBefore = (await pathData(db, ownId)).toJson();
            const nextBefore = (await pathData(db, nextId)).toJson();

            await edit(db, ps[2], 111, 222);
            const edited = await spots(db);
            const ownEdited = (await pathData(db, ownId)).toJson();
            const nextEdited = (await pathData(db, nextId)).toJson();
            expect(edited.slice(2, 5)).toEqual([
                `111,222~P${ownId}`,
                "111,222",
                "111,222",
            ]);
            expect(nextEdited).not.toEqual(nextBefore);

            const undo = await performHistoryAction("undo", db);
            expect(await spots(db)).toEqual(before);
            expect((await pathData(db, ownId)).toJson()).toEqual(ownBefore);
            expect((await pathData(db, nextId)).toJson()).toEqual(nextBefore);
            // Focus goes to the edited page (the earliest one changed), not the last
            expect(undo.pageIdToGoTo).toBe(ps[2]);
            expect(undo.marcherIdsToSelect).toEqual(new Set([M]));

            await performRedo(db);
            expect(await spots(db)).toEqual(edited);
            expect((await pathData(db, ownId)).toJson()).toEqual(ownEdited);
            expect((await pathData(db, nextId)).toJson()).toEqual(nextEdited);
        });

        it("rowIdFromSql reads the row id", () => {
            expect(
                rowIdFromSql(
                    `UPDATE "marcher_pages" SET "x"=1 WHERE rowid=305`,
                ),
            ).toBe(305);
            expect(
                rowIdFromSql(`DELETE FROM "marcher_pages" WHERE rowid=7`),
            ).toBe(7);
            expect(
                rowIdFromSql(`INSERT INTO "marcher_pages" ("id") VALUES (1)`),
            ).toBe(-1);
        });

        it("a file without pathway history triggers gets them", async ({
            db,
            marchersAndPages: _,
        }) => {
            await dropUndoTriggers(db, "pathways");
            const names = async () =>
                (
                    (await db.all(
                        sql`SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'pathways'`,
                    )) as unknown[]
                )
                    // The proxy returns rows as arrays
                    .map((r) =>
                        String(
                            Array.isArray(r)
                                ? r[0]
                                : (r as { name: string }).name,
                        ),
                    )
                    .filter((n) => /_(it|ut|dt)$/.test(n))
                    .sort();
            expect(await names()).toEqual([]);
            await createAllUndoTriggers(db);
            expect(await names()).toEqual([
                "pathways_dt",
                "pathways_it",
                "pathways_ut",
            ]);
        });
    });

    it("timing: 200 marchers x 100 pages, edit page 2 for everyone, then undo and redo", async ({
        db,
        marchersAndPages: _,
    }) => {
        await showWithPages(db, 0);
        const existing = (await db.select().from(schema.marchers).all()).length;
        await createMarchers({
            db,
            newMarchers: Array.from({ length: 200 - existing }, (_, i) => ({
                section: "Trumpet",
                drill_prefix: "Q",
                drill_order: i + 1,
            })),
        });
        for (let i = 0; i < 98; i++)
            await createLastPage({
                db,
                newPageCounts: 4,
                createNewBeats: true,
            });
        const ps = (await orderedPages(db)).map((p) => p.id);
        expect(ps).toHaveLength(100);
        const marchers = await db.select().from(schema.marchers).all();
        expect(marchers).toHaveLength(200);

        const measure = async (carryForward: boolean) => {
            const historyBefore = await undoRowCount(db);
            let t = performance.now();
            const result = await updateMarcherPages({
                db,
                modifiedMarcherPages: marchers.map((m, i) => ({
                    marcher_id: m.id,
                    page_id: ps[2],
                    x: 1000 + i,
                    y: 500,
                })),
                carryForward,
            });
            const editMs = performance.now() - t;
            const historyRows = (await undoRowCount(db)) - historyBefore;
            t = performance.now();
            const undo = await performHistoryAction("undo", db);
            const undoMs = performance.now() - t;
            t = performance.now();
            await performRedo(db);
            const redoMs = performance.now() - t;
            t = performance.now();
            await performUndo(db);
            const plainUndoMs = performance.now() - t;
            // Reported, not asserted: test-environment numbers vary by machine. Only with
            // OM_REPORT_TIMING=1 (stderr: the test setup quiets console.log)
            if (process.env.OM_REPORT_TIMING)
                process.stderr.write(
                    `carry-forward timing ${JSON.stringify({
                        carryForward,
                        editMs: Math.round(editMs),
                        undoMsWithFocus: Math.round(undoMs),
                        undoMsWithoutFocus: Math.round(plainUndoMs),
                        redoMs: Math.round(redoMs),
                        historyRows,
                    })}\n`,
                );
            return { result, undo };
        };

        const off = await measure(false);
        expect(off.result.followedPageIds).toHaveLength(0);
        const on = await measure(true);
        expect(on.result.followedPageIds).toHaveLength(97);
        expect(on.undo.pageIdToGoTo).toBe(ps[2]);
    }, 600_000);
});

describe("carryForwardMessage", () => {
    const t = (
        _key: string,
        message: string,
        params?: Record<string, string>,
    ) => message.replace(/\{(\w+)\}/g, (_, k: string) => params?.[k] ?? "");

    it("names the first and last page carried to, and the edited page", () => {
        expect(carryForwardMessage(["3", "4", "7"], ["2"], t)).toEqual({
            message: "Pages 3–7 followed (they were copies)",
            actionLabel: "Only Page 2",
        });
    });

    it("names one page", () => {
        expect(carryForwardMessage(["3"], ["2"], t)).toEqual({
            message: "Page 3 followed (it was a copy)",
            actionLabel: "Only Page 2",
        });
    });

    it("edits on several pages", () => {
        expect(carryForwardMessage(["3", "5"], ["2", "4"], t).actionLabel).toBe(
            "Only the edited pages",
        );
    });
});
