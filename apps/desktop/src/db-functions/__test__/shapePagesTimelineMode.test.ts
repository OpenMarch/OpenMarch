import { describe, expect } from "vitest";
import { getTableName } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import {
    copyShapePageToPage,
    createShapePages,
    deleteShapePages,
    PAGE_SHAPES_TIMELINE_MESSAGE,
    updateShapePages,
} from "../shapePages";
import { TimelineWriteError } from "../timelineErrors";
import { createShapes, deleteShapes, updateShapes } from "../shapes";
import {
    createShapePageMarchers,
    deleteShapePageMarchers,
    swapPositionOrder,
    updateShapePageMarchers,
} from "../shapePageMarchers";

/**
 * P7.11: in timeline mode the page-era shape writers (`createShapePages`, `updateShapePages`,
 * `deleteShapePages`, `copyShapePageToPage`) refuse before writing anything, with an `E-ARGS`
 * message that says why. They write shape pages, their marchers and `marcher_pages`, which the
 * timeline doesn't read. With the flag off they work as before.
 */

const TABLES = [
    schema.shapes,
    schema.shape_pages,
    schema.shape_page_marchers,
    schema.marcher_pages,
    schema.history_undo,
    schema.history_redo,
];

const snapshot = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
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

const LINE = "M 0 0 L 100 0";

/** A shape page on page 1 with marchers 1 and 2 on it, made in page mode. */
const createLineOnPage1 = async (db: DbConnection) => {
    const [shapePage] = await createShapePages({
        db,
        newItems: [
            {
                page_id: 1,
                svg_path: LINE,
                marcher_coordinates: [
                    { marcher_id: 1, x: 0, y: 0 },
                    { marcher_id: 2, x: 100, y: 0 },
                ],
            },
        ],
    });
    return shapePage!;
};

const expectRefusal = async (write: () => Promise<unknown>) => {
    const error = await write().then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe("E-ARGS");
    expect((error as Error).message).toBe(
        `E-ARGS: ${PAGE_SHAPES_TIMELINE_MESSAGE}`,
    );
};

describeDbTests("page shapes in timeline mode", (it) => {
    describe("with the flag off", () => {
        it("creates, updates, copies and deletes shape pages as before", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineFlag(db, false);
            const shapePage = await createLineOnPage1(db);
            const marcher2 = await db.query.marcher_pages.findFirst({
                where: (t, { and, eq }) =>
                    and(eq(t.marcher_id, 2), eq(t.page_id, 1)),
            });
            expect(marcher2).toMatchObject({ x: 100, y: 0 });

            await updateShapePages({
                db,
                modifiedItems: [
                    {
                        id: shapePage.id,
                        svg_path: "M 0 0 L 0 50",
                        marcher_coordinates: [
                            { marcher_id: 1, x: 0, y: 0 },
                            { marcher_id: 2, x: 0, y: 50 },
                        ],
                    },
                ],
            });
            const copy = await copyShapePageToPage({
                db,
                shapePageId: shapePage.id,
                targetPageId: 2,
            });
            expect(copy.page_id).toBe(2);
            await deleteShapePages({ db, itemIds: new Set([copy.id]) });
            expect(await db.select().from(schema.shape_pages).all()).toEqual([
                expect.objectContaining({ id: shapePage.id, page_id: 1 }),
            ]);
        });
    });

    describe("with the flag on", () => {
        it("refuses a new shape page and writes nothing, not even an undo entry", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineFlag(db, true);
            const before = await snapshot(db);
            await expectRefusal(() => createLineOnPage1(db));
            expect(await snapshot(db)).toEqual(before);
        });

        it("refuses updates, copies and deletes of a shape page made before the flag was on", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineFlag(db, false);
            const shapePage = await createLineOnPage1(db);
            await setTimelineFlag(db, true);
            const before = await snapshot(db);

            await expectRefusal(() =>
                updateShapePages({
                    db,
                    modifiedItems: [
                        {
                            id: shapePage.id,
                            svg_path: "M 0 0 L 0 50",
                            marcher_coordinates: [
                                { marcher_id: 1, x: 0, y: 0 },
                                { marcher_id: 2, x: 0, y: 50 },
                            ],
                        },
                    ],
                }),
            );
            await expectRefusal(() =>
                copyShapePageToPage({
                    db,
                    shapePageId: shapePage.id,
                    targetPageId: 2,
                }),
            );
            await expectRefusal(() =>
                deleteShapePages({ db, itemIds: new Set([shapePage.id]) }),
            );
            expect(await snapshot(db)).toEqual(before);

            // Back in page mode the same shape page can be deleted
            await setTimelineFlag(db, false);
            await deleteShapePages({ db, itemIds: new Set([shapePage.id]) });
            expect(await db.select().from(schema.shape_pages).all()).toEqual(
                [],
            );
        });

        it("refuses the shape and shape page marcher writers too, and writes nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            await setTimelineFlag(db, false);
            const shapePage = await createLineOnPage1(db);
            const spms = await db.select().from(schema.shape_page_marchers);
            expect(spms).toHaveLength(2);
            await setTimelineFlag(db, true);
            const before = await snapshot(db);

            await expectRefusal(() => createShapes({ db, newItems: [{}] }));
            await expectRefusal(() =>
                updateShapes({
                    db,
                    modifiedItems: [{ id: shapePage.shape_id, name: "A" }],
                }),
            );
            await expectRefusal(() =>
                deleteShapes({ db, itemIds: new Set([shapePage.shape_id]) }),
            );
            await expectRefusal(() =>
                createShapePageMarchers({
                    db,
                    newItems: [
                        {
                            shape_page_id: shapePage.id,
                            marcher_id: 3,
                            position_order: 2,
                        },
                    ],
                }),
            );
            await expectRefusal(() =>
                updateShapePageMarchers({
                    db,
                    modifiedItems: [{ id: spms[0]!.id, notes: "x" }],
                }),
            );
            await expectRefusal(() =>
                deleteShapePageMarchers({
                    db,
                    itemIds: new Set([spms[0]!.id]),
                }),
            );
            await expectRefusal(() =>
                swapPositionOrder({
                    db,
                    spmId1: spms[0]!.id,
                    spmId2: spms[1]!.id,
                }),
            );
            expect(await snapshot(db)).toEqual(before);

            // Page mode is unchanged: the same swap works with the flag off
            await setTimelineFlag(db, false);
            await swapPositionOrder({
                db,
                spmId1: spms[0]!.id,
                spmId2: spms[1]!.id,
            });
        });
    });
});
