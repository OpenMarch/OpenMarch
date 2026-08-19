import { describeDbTests, schema, transaction } from "@/test/base";
import { describe, expect, it as vitestIt } from "vitest";
import { and, eq } from "drizzle-orm";
import {
    computeInheritedCoordinates,
    recomputeInheritedPagesInTransaction,
    type CoordMap,
    type InheritancePage,
} from "../pageInheritance";
import {
    createPagesInTransaction,
    deletePagesInTransaction,
    deletePageYank,
    updatePagesInTransaction,
} from "../page";
import { updateMarcherPages } from "../marcherPage";
import { _updateChildMarcherPages } from "../shapePages";
import { createMarchersInTransaction } from "../marcher";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { getTestWithHistory } from "@/test/history";

describeDbTests("pageInheritance-schema", (it) => {
    it("new pages default to non-anchor and the flag round-trips", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx
                .insert(schema.beats)
                .values([{ id: 1, duration: 0.5, position: 1 }]);
            await tx
                .insert(schema.pages)
                .values([{ id: 1, start_beat: 1, is_subset: 0 }]);
            const created = await tx.query.pages.findFirst({
                where: eq(schema.pages.id, 1),
            });
            expect(created!.is_coordinate_anchor).toBe(0);

            await tx
                .update(schema.pages)
                .set({ is_coordinate_anchor: 1 })
                .where(eq(schema.pages.id, 1));
            const updated = await tx.query.pages.findFirst({
                where: eq(schema.pages.id, 1),
            });
            expect(updated!.is_coordinate_anchor).toBe(1);
        });
    });
});

const c = (x: number, y: number) => ({ x, y });
const anchorMap = (
    entries: Array<[number, Array<[number, { x: number; y: number }]>]>,
): CoordMap => new Map(entries.map(([pid, ms]) => [pid, new Map(ms)]));

describe("computeInheritedCoordinates", () => {
    vitestIt("holds the last anchor when there is no following anchor", () => {
        const pages: InheritancePage[] = [
            { id: 0, startBeatPosition: 0, isAnchor: true },
            { id: 1, startBeatPosition: 8, isAnchor: false },
            { id: 2, startBeatPosition: 16, isAnchor: false },
        ];
        const result = computeInheritedCoordinates(
            pages,
            anchorMap([[0, [[1, c(5, 7)]]]]),
        );
        expect(result.get(1)!.get(1)).toEqual(c(5, 7));
        expect(result.get(2)!.get(1)).toEqual(c(5, 7));
    });

    vitestIt("interpolates by beat position across uneven page lengths", () => {
        const pages: InheritancePage[] = [
            { id: 0, startBeatPosition: 0, isAnchor: true },
            { id: 1, startBeatPosition: 4, isAnchor: false },
            { id: 2, startBeatPosition: 8, isAnchor: false },
            { id: 3, startBeatPosition: 12, isAnchor: true },
        ];
        const result = computeInheritedCoordinates(
            pages,
            anchorMap([
                [0, [[1, c(0, 0)]]],
                [3, [[1, c(120, 0)]]],
            ]),
        );
        expect(result.get(1)!.get(1)).toEqual(c(40, 0));
        expect(result.get(2)!.get(1)).toEqual(c(80, 0));
        expect(result.has(3)).toBe(false);
    });

    vitestIt(
        "splitting a move at an on-line point leaves other pages identical",
        () => {
            const base: InheritancePage[] = [
                { id: 0, startBeatPosition: 0, isAnchor: true },
                { id: 1, startBeatPosition: 5, isAnchor: false },
                { id: 2, startBeatPosition: 10, isAnchor: false },
                { id: 3, startBeatPosition: 15, isAnchor: false },
                { id: 4, startBeatPosition: 20, isAnchor: true },
            ];
            const before = computeInheritedCoordinates(
                base,
                anchorMap([
                    [0, [[1, c(0, 0)]]],
                    [4, [[1, c(200, 0)]]],
                ]),
            );

            const split = base.map((p) =>
                p.id === 2 ? { ...p, isAnchor: true } : p,
            );
            const after = computeInheritedCoordinates(
                split,
                anchorMap([
                    [0, [[1, c(0, 0)]]],
                    [2, [[1, c(100, 0)]]],
                    [4, [[1, c(200, 0)]]],
                ]),
            );
            expect(after.get(1)!.get(1)).toEqual(before.get(1)!.get(1));
            expect(after.get(3)!.get(1)).toEqual(before.get(3)!.get(1));
        },
    );
});

describeDbTests("recomputeInheritedPages", (it) => {
    it("interpolates non-anchor pages between two anchors and holds after the last", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 0.5, position: 1 },
                { id: 2, duration: 0.5, position: 2 },
                { id: 3, duration: 0.5, position: 3 },
                { id: 4, duration: 0.5, position: 4 },
            ]);
            // page 0 (anchor) already exists at beat 0 position 0
            await tx.insert(schema.pages).values([
                { id: 1, start_beat: 1, is_subset: 0, is_coordinate_anchor: 0 },
                { id: 2, start_beat: 2, is_subset: 0, is_coordinate_anchor: 0 },
                { id: 3, start_beat: 3, is_subset: 0, is_coordinate_anchor: 1 },
                { id: 4, start_beat: 4, is_subset: 0, is_coordinate_anchor: 0 },
            ]);
            await tx.insert(schema.marchers).values([
                {
                    id: 1,
                    section: "Test Section",
                    drill_prefix: "B",
                    drill_order: 1,
                },
            ]);
            await tx.insert(schema.marcher_pages).values([
                { marcher_id: 1, page_id: 0, x: 0, y: 0 },
                { marcher_id: 1, page_id: 1, x: 999, y: 999 },
                { marcher_id: 1, page_id: 2, x: 999, y: 999 },
                { marcher_id: 1, page_id: 3, x: 300, y: 0 },
                { marcher_id: 1, page_id: 4, x: 999, y: 999 },
            ]);

            await recomputeInheritedPagesInTransaction({ tx });

            const read = async (pageId: number) =>
                (await tx.query.marcher_pages.findFirst({
                    where: and(
                        eq(schema.marcher_pages.marcher_id, 1),
                        eq(schema.marcher_pages.page_id, pageId),
                    ),
                }))!;
            expect(await read(1)).toMatchObject({ x: 100, y: 0 });
            expect(await read(2)).toMatchObject({ x: 200, y: 0 });
            expect(await read(4)).toMatchObject({ x: 300, y: 0 });
        });
    });
});

describeDbTests("createPages-inheritance", (it) => {
    it("newly created pages are non-anchor and hold page 0's coordinates", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 0.5, position: 1 },
                { id: 2, duration: 0.5, position: 2 },
                { id: 3, duration: 0.5, position: 3 },
            ]);
            await tx.insert(schema.marchers).values([
                {
                    id: 1,
                    section: "Test Section",
                    drill_prefix: "A",
                    drill_order: 1,
                },
            ]);
            await tx
                .insert(schema.marcher_pages)
                .values([{ marcher_id: 1, page_id: 0, x: 42, y: 24 }]);
            // Pre-existing non-anchor page with a stale value
            // naive copy-forward would propagate the wrong coordinates without the recompute
            await tx.insert(schema.pages).values([
                {
                    id: 10,
                    start_beat: 1,
                    is_subset: 0,
                    is_coordinate_anchor: 0,
                },
            ]);
            await tx
                .insert(schema.marcher_pages)
                .values([{ marcher_id: 1, page_id: 10, x: 999, y: 999 }]);

            await createPagesInTransaction({
                tx,
                newPages: [
                    { start_beat: 2, is_subset: false },
                    { start_beat: 3, is_subset: false },
                ],
            });

            const pages = await tx.query.pages.findMany();
            for (const p of pages)
                if (p.id !== 0) expect(p.is_coordinate_anchor).toBe(0);
            const mps = await tx.query.marcher_pages.findMany();
            for (const mp of mps) expect(mp).toMatchObject({ x: 42, y: 24 });
        });
    });
});

describeDbTests("edit-funnel-inheritance", (it) => {
    it("an untouched page holds the last set page, not page 0", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 0.5, position: 1 },
                { id: 2, duration: 0.5, position: 2 },
                { id: 3, duration: 0.5, position: 3 },
            ]);
            await tx.insert(schema.pages).values([
                { id: 1, start_beat: 1, is_subset: 0, is_coordinate_anchor: 0 },
                { id: 2, start_beat: 2, is_subset: 0, is_coordinate_anchor: 0 },
                { id: 3, start_beat: 3, is_subset: 0, is_coordinate_anchor: 0 },
            ]);
            await tx.insert(schema.marchers).values([
                {
                    id: 1,
                    section: "Test Section",
                    drill_prefix: "A",
                    drill_order: 1,
                },
            ]);
            await tx.insert(schema.marcher_pages).values([
                { marcher_id: 1, page_id: 0, x: 0, y: 0 },
                { marcher_id: 1, page_id: 1, x: 0, y: 0 },
                { marcher_id: 1, page_id: 2, x: 0, y: 0 },
                { marcher_id: 1, page_id: 3, x: 0, y: 0 },
            ]);
        });

        await updateMarcherPages({
            db,
            modifiedMarcherPages: [{ marcher_id: 1, page_id: 1, x: 50, y: 0 }],
        });
        await updateMarcherPages({
            db,
            modifiedMarcherPages: [{ marcher_id: 1, page_id: 2, x: 150, y: 0 }],
        });

        await transaction(db, async (tx) => {
            const page3 = (await tx.query.marcher_pages.findFirst({
                where: and(
                    eq(schema.marcher_pages.marcher_id, 1),
                    eq(schema.marcher_pages.page_id, 3),
                ),
            }))!;
            expect(page3).toMatchObject({ x: 150, y: 0 });
        });
    });
});

describeDbTests("edit-funnel-inheritance-history", (it) => {
    const testWithHistory = getTestWithHistory(it, [
        schema.pages,
        schema.beats,
        schema.marchers,
        schema.marcher_pages,
    ]);

    testWithHistory(
        "one updateMarcherPages call is a single undo group",
        async ({ db, expectNumberOfChanges }) => {
            await transaction(db, async (tx) => {
                await tx.insert(schema.beats).values([
                    { id: 1, duration: 0.5, position: 1 },
                    { id: 2, duration: 0.5, position: 2 },
                    { id: 3, duration: 0.5, position: 3 },
                ]);
                await tx.insert(schema.pages).values([
                    {
                        id: 1,
                        start_beat: 1,
                        is_subset: 0,
                        is_coordinate_anchor: 0,
                    },
                    {
                        id: 2,
                        start_beat: 2,
                        is_subset: 0,
                        is_coordinate_anchor: 0,
                    },
                    {
                        id: 3,
                        start_beat: 3,
                        is_subset: 0,
                        is_coordinate_anchor: 0,
                    },
                ]);
                await tx.insert(schema.marchers).values([
                    {
                        id: 1,
                        section: "Test Section",
                        drill_prefix: "A",
                        drill_order: 1,
                    },
                ]);
                await tx.insert(schema.marcher_pages).values([
                    { marcher_id: 1, page_id: 0, x: 0, y: 0 },
                    { marcher_id: 1, page_id: 1, x: 0, y: 0 },
                    { marcher_id: 1, page_id: 2, x: 0, y: 0 },
                    { marcher_id: 1, page_id: 3, x: 0, y: 0 },
                ]);
            });

            const databaseState =
                await expectNumberOfChanges.getDatabaseState(db);

            // Anchoring page 2 and recomputing page 1 and page 3 must land in one undo group
            await updateMarcherPages({
                db,
                modifiedMarcherPages: [
                    { marcher_id: 1, page_id: 2, x: 150, y: 0 },
                ],
            });

            await expectNumberOfChanges.test(db, 1, databaseState);
        },
    );
});

describeDbTests("delete-page-inheritance", (it) => {
    it("deleting the middle anchor re-flows the surrounding pages onto the remaining anchors", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 0.5, position: 1 },
                { id: 2, duration: 0.5, position: 2 },
                { id: 3, duration: 0.5, position: 3 },
                { id: 4, duration: 0.5, position: 4 },
            ]);
            await tx.insert(schema.pages).values([
                { id: 1, start_beat: 1, is_subset: 0, is_coordinate_anchor: 0 },
                { id: 2, start_beat: 2, is_subset: 0, is_coordinate_anchor: 1 },
                { id: 3, start_beat: 3, is_subset: 0, is_coordinate_anchor: 0 },
                { id: 4, start_beat: 4, is_subset: 0, is_coordinate_anchor: 1 },
            ]);
            await tx.insert(schema.marchers).values([
                {
                    id: 1,
                    section: "Test Section",
                    drill_prefix: "A",
                    drill_order: 1,
                },
            ]);
            // page1 and page3 are seeded at their pre-delete interpolated
            // values, off the 0->4 line, so a missing recompute is a genuine failure
            await tx.insert(schema.marcher_pages).values([
                { marcher_id: 1, page_id: 0, x: 0, y: 0 },
                { marcher_id: 1, page_id: 1, x: 100, y: 250 },
                { marcher_id: 1, page_id: 2, x: 200, y: 500 },
                { marcher_id: 1, page_id: 3, x: 300, y: 250 },
                { marcher_id: 1, page_id: 4, x: 400, y: 0 },
            ]);
        });

        await transaction(db, async (tx) => {
            await deletePagesInTransaction({ tx, pageIds: new Set([2]) });
        });

        await transaction(db, async (tx) => {
            const read = async (pageId: number) =>
                (await tx.query.marcher_pages.findFirst({
                    where: and(
                        eq(schema.marcher_pages.marcher_id, 1),
                        eq(schema.marcher_pages.page_id, pageId),
                    ),
                }))!;
            expect(await read(1)).toMatchObject({ x: 100, y: 0 });
            expect(await read(3)).toMatchObject({ x: 300, y: 0 });
        });
    });
});

describeDbTests("update-page-timing-inheritance", (it) => {
    it("moving a non-anchor page's start_beat re-flows it to the new beat position", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 0.5, position: 1 },
                { id: 2, duration: 0.5, position: 2 },
                { id: 3, duration: 0.5, position: 3 },
                { id: 4, duration: 0.5, position: 4 },
                { id: 5, duration: 0.5, position: 5 },
            ]);
            // beat 2 (position 2) is left free for page 2 to move onto
            await tx.insert(schema.pages).values([
                { id: 1, start_beat: 1, is_subset: 0, is_coordinate_anchor: 0 },
                { id: 2, start_beat: 3, is_subset: 0, is_coordinate_anchor: 0 },
                { id: 3, start_beat: 4, is_subset: 0, is_coordinate_anchor: 0 },
                { id: 4, start_beat: 5, is_subset: 0, is_coordinate_anchor: 1 },
            ]);
            await tx.insert(schema.marchers).values([
                {
                    id: 1,
                    section: "Test Section",
                    drill_prefix: "A",
                    drill_order: 1,
                },
            ]);
            await tx.insert(schema.marcher_pages).values([
                { marcher_id: 1, page_id: 0, x: 0, y: 0 },
                { marcher_id: 1, page_id: 1, x: 999, y: 999 },
                { marcher_id: 1, page_id: 2, x: 999, y: 999 },
                { marcher_id: 1, page_id: 3, x: 999, y: 999 },
                { marcher_id: 1, page_id: 4, x: 500, y: 0 },
            ]);
        });

        await transaction(db, async (tx) => {
            await updatePagesInTransaction({
                tx,
                modifiedPages: [{ id: 2, start_beat: 2 }],
            });
        });

        await transaction(db, async (tx) => {
            const read = async (pageId: number) =>
                (await tx.query.marcher_pages.findFirst({
                    where: and(
                        eq(schema.marcher_pages.marcher_id, 1),
                        eq(schema.marcher_pages.page_id, pageId),
                    ),
                }))!;
            // page 2 moved from beat position 3 to 2, so it now interpolates at 200 instead of 300
            expect(await read(2)).toMatchObject({ x: 200, y: 0 });
            expect(await read(1)).toMatchObject({ x: 100, y: 0 });
            expect(await read(3)).toMatchObject({ x: 400, y: 0 });
        });
    });
});

describeDbTests("shape-page-anchoring", (it) => {
    it("anchors the shape page so a later recompute preserves its coordinates", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx
                .insert(schema.beats)
                .values([{ id: 1, duration: 0.5, position: 1 }]);
            await tx.insert(schema.pages).values([
                {
                    id: 1,
                    start_beat: 1,
                    is_subset: 0,
                    is_coordinate_anchor: 0,
                },
            ]);
            await tx.insert(schema.marchers).values([
                {
                    id: 1,
                    section: "Test Section",
                    drill_prefix: "A",
                    drill_order: 1,
                },
            ]);
            await tx.insert(schema.marcher_pages).values([
                { marcher_id: 1, page_id: 0, x: 0, y: 0 },
                { marcher_id: 1, page_id: 1, x: 0, y: 0 },
            ]);

            await _updateChildMarcherPages({
                tx,
                pageId: 1,
                marcherCoordinates: [{ marcher_id: 1, x: 55, y: 66 }],
            });

            const page1 = (await tx.query.pages.findFirst({
                where: eq(schema.pages.id, 1),
            }))!;
            expect(page1.is_coordinate_anchor).toBe(1);

            // without anchoring, recompute would flatten the shape page onto page 0
            await recomputeInheritedPagesInTransaction({ tx });

            const mp = (await tx.query.marcher_pages.findFirst({
                where: and(
                    eq(schema.marcher_pages.marcher_id, 1),
                    eq(schema.marcher_pages.page_id, 1),
                ),
            }))!;
            expect(mp).toMatchObject({ x: 55, y: 66 });
        });
    });
});

describeDbTests("create-marcher-inheritance", (it) => {
    it("a new marcher holds its anchor coordinates on non-anchor pages", async ({
        db,
    }) => {
        const fp = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
        const start = 8 * fp.pixelsPerStep;

        await transaction(db, async (tx) => {
            await tx
                .update(schema.field_properties)
                .set({ json_data: JSON.stringify(fp) })
                .where(eq(schema.field_properties.id, 1));
            await tx
                .insert(schema.beats)
                .values([{ id: 1, duration: 0.5, position: 1 }]);
            await tx.insert(schema.pages).values([
                {
                    id: 1,
                    start_beat: 1,
                    is_subset: 0,
                    is_coordinate_anchor: 0,
                },
            ]);
            // existing marcher occupies the default start point on page 1 only
            // so a new marcher is bumped there but not on the anchor page 0
            await tx.insert(schema.marchers).values([
                {
                    id: 100,
                    section: "Test Section",
                    drill_prefix: "Z",
                    drill_order: 1,
                },
            ]);
            await tx.insert(schema.marcher_pages).values([
                { marcher_id: 100, page_id: 0, x: 500, y: 500 },
                { marcher_id: 100, page_id: 1, x: start, y: start },
            ]);

            const created = await createMarchersInTransaction({
                tx,
                newMarchers: [
                    {
                        section: "Test Section",
                        drill_prefix: "A",
                        drill_order: 2,
                    },
                ],
            });
            const newId = created[0].id;

            const read = async (pageId: number) =>
                (await tx.query.marcher_pages.findFirst({
                    where: and(
                        eq(schema.marcher_pages.marcher_id, newId),
                        eq(schema.marcher_pages.page_id, pageId),
                    ),
                }))!;
            const onPage0 = await read(0);
            const onPage1 = await read(1);
            expect(onPage1).toMatchObject({ x: onPage0.x, y: onPage0.y });
        });
    });
});

describeDbTests("delete-page-yank-inheritance", (it) => {
    it("re-interpolates a yanked non-anchor page at its new beat position", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 0.5, position: 1 },
                { id: 2, duration: 0.5, position: 2 },
                { id: 3, duration: 0.5, position: 3 },
                { id: 4, duration: 0.5, position: 4 },
                { id: 5, duration: 0.5, position: 5 },
                { id: 6, duration: 0.5, position: 6 },
                { id: 7, duration: 0.5, position: 7 },
            ]);
            // page 1 sits on the second-lowest beat so ensureSecondBeatHasPage stays a no-op
            await tx.insert(schema.pages).values([
                { id: 1, start_beat: 1, is_subset: 0, is_coordinate_anchor: 0 },
                { id: 2, start_beat: 3, is_subset: 0, is_coordinate_anchor: 0 },
                { id: 3, start_beat: 5, is_subset: 0, is_coordinate_anchor: 0 },
                { id: 4, start_beat: 7, is_subset: 0, is_coordinate_anchor: 1 },
            ]);
            await tx.insert(schema.marchers).values([
                {
                    id: 1,
                    section: "Test Section",
                    drill_prefix: "A",
                    drill_order: 1,
                },
            ]);
            await tx.insert(schema.marcher_pages).values([
                { marcher_id: 1, page_id: 0, x: 0, y: 0 },
                { marcher_id: 1, page_id: 1, x: 999, y: 999 },
                { marcher_id: 1, page_id: 2, x: 999, y: 999 },
                { marcher_id: 1, page_id: 3, x: 999, y: 999 },
                { marcher_id: 1, page_id: 4, x: 700, y: 0 },
            ]);
        });

        await deletePageYank({ db, pageId: 2 });

        await transaction(db, async (tx) => {
            const read = async (pageId: number) =>
                (await tx.query.marcher_pages.findFirst({
                    where: and(
                        eq(schema.marcher_pages.marcher_id, 1),
                        eq(schema.marcher_pages.page_id, pageId),
                    ),
                }))!;
            // deleting page 2 yanks page 4 onto beat position 5, so the line is x = 140 * position
            // page 3 yanks onto beat position 3, so its stale pre-yank value would be wrong
            expect(await read(1)).toMatchObject({ x: 140, y: 0 });
            expect(await read(3)).toMatchObject({ x: 420, y: 0 });
        });
    });
});
