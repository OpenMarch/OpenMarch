import { describeDbTests, schema, transaction } from "@/test/base";
import { describe, expect, it as vitestIt } from "vitest";
import { and, eq } from "drizzle-orm";
import {
    COORDINATE_MODE,
    computeMarcherTimeline,
    recomputeMarcherCoordinates,
} from "../pageInheritance";
import {
    createPagesInTransaction,
    deletePages,
    deletePageYank,
    updatePagesInTransaction,
} from "../page";
import { swapMarchers, updateMarcherPages } from "../marcherPage";
import { _updateChildMarcherPages } from "../shapePages";
import { createMarchersInTransaction } from "../marcher";
import { getTestWithHistory } from "@/test/history";

describeDbTests("pageInheritance-schema-coordinate-mode", (it) => {
    it("new marcher pages default to MANUAL and the mode round-trips", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx
                .insert(schema.beats)
                .values([{ id: 1, duration: 0.5, position: 1 }]);
            await tx
                .insert(schema.pages)
                .values([{ id: 1, start_beat: 1, is_subset: 0 }]);
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
                .values([{ marcher_id: 1, page_id: 1, x: 0, y: 0 }]);
            const created = await tx.query.marcher_pages.findFirst({
                where: and(
                    eq(schema.marcher_pages.marcher_id, 1),
                    eq(schema.marcher_pages.page_id, 1),
                ),
            });
            expect(created!.coordinate_mode).toBe(0);

            await tx
                .update(schema.marcher_pages)
                .set({ coordinate_mode: 2 })
                .where(eq(schema.marcher_pages.marcher_id, 1));
            const updated = await tx.query.marcher_pages.findFirst({
                where: eq(schema.marcher_pages.marcher_id, 1),
            });
            expect(updated!.coordinate_mode).toBe(2);
        });
    });
});

const row = (
    pageId: number,
    startBeatPosition: number,
    mode: number,
    x = 0,
    y = 0,
): {
    pageId: number;
    startBeatPosition: number;
    mode: number;
    x: number;
    y: number;
} => ({ pageId, startBeatPosition, mode, x, y });

describe("computeMarcherTimeline", () => {
    vitestIt("HOLD copies the previous keyframe", () => {
        const out = computeMarcherTimeline([
            row(0, 0, COORDINATE_MODE.MANUAL, 5, 7),
            row(1, 8, COORDINATE_MODE.HOLD),
            row(2, 16, COORDINATE_MODE.HOLD),
        ]);
        expect(out.get(1)).toEqual({ x: 5, y: 7 });
        expect(out.get(2)).toEqual({ x: 5, y: 7 });
    });

    vitestIt("MOVE interpolates by beat position between keyframes", () => {
        const out = computeMarcherTimeline([
            row(0, 0, COORDINATE_MODE.MANUAL, 0, 0),
            row(1, 4, COORDINATE_MODE.MOVE),
            row(2, 8, COORDINATE_MODE.MANUAL, 8, 16),
        ]);
        expect(out.get(1)).toEqual({ x: 4, y: 8 });
    });

    vitestIt("MOVE with no following keyframe holds the last keyframe", () => {
        const out = computeMarcherTimeline([
            row(0, 0, COORDINATE_MODE.MANUAL, 3, 3),
            row(1, 4, COORDINATE_MODE.MOVE),
        ]);
        expect(out.get(1)).toEqual({ x: 3, y: 3 });
    });

    vitestIt("MANUAL rows are never emitted", () => {
        const out = computeMarcherTimeline([
            row(0, 0, COORDINATE_MODE.MANUAL, 1, 1),
            row(1, 4, COORDINATE_MODE.MANUAL, 2, 2),
        ]);
        expect(out.has(0)).toBe(false);
        expect(out.has(1)).toBe(false);
    });

    vitestIt("guards a zero-length span", () => {
        const out = computeMarcherTimeline([
            row(0, 4, COORDINATE_MODE.MANUAL, 0, 0),
            row(1, 4, COORDINATE_MODE.MOVE),
            row(2, 4, COORDINATE_MODE.MANUAL, 10, 10),
        ]);
        expect(out.get(1)).toEqual({ x: 0, y: 0 });
    });

    vitestIt(
        "falls back to the first page when no preceding keyframe exists",
        () => {
            const out = computeMarcherTimeline([
                row(0, 0, COORDINATE_MODE.HOLD, 5, 5),
                row(1, 4, COORDINATE_MODE.MOVE),
            ]);
            // first row has no preceding MANUAL so it stays put, later rows anchor to it
            expect(out.has(0)).toBe(false);
            expect(out.get(1)).toEqual({ x: 5, y: 5 });
        },
    );
});

describeDbTests("shape pages author marchers", (it) => {
    it("placing a marcher on a shape authors that page row as MANUAL and keeps the placed coordinate", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 0.5, position: 0 },
                { id: 2, duration: 0.5, position: 1 },
            ]);
            // page 0 (beat 0) is pre-seeded by the blank DB
            await tx
                .insert(schema.pages)
                .values([{ id: 1, start_beat: 2, is_subset: 0 }]);

            const created = await createMarchersInTransaction({
                tx,
                newMarchers: [
                    {
                        section: "Test Section",
                        drill_prefix: "A",
                        drill_order: 1,
                    },
                ],
            });
            const marcherId = created[0].id;

            const beforeRow = (await tx.query.marcher_pages.findFirst({
                where: and(
                    eq(schema.marcher_pages.marcher_id, marcherId),
                    eq(schema.marcher_pages.page_id, 1),
                ),
            }))!;
            expect(beforeRow.coordinate_mode).toBe(COORDINATE_MODE.HOLD);

            await _updateChildMarcherPages({
                tx,
                pageId: 1,
                marcherCoordinates: [{ marcher_id: marcherId, x: 55, y: 66 }],
            });

            const afterRow = (await tx.query.marcher_pages.findFirst({
                where: and(
                    eq(schema.marcher_pages.marcher_id, marcherId),
                    eq(schema.marcher_pages.page_id, 1),
                ),
            }))!;
            expect(afterRow.coordinate_mode).toBe(COORDINATE_MODE.MANUAL);
            expect(afterRow).toMatchObject({ x: 55, y: 66 });
        });
    });
});

describeDbTests("new marchers", (it) => {
    it("a new marcher's HOLD rows inherit the previous MANUAL page's coordinate", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 0.5, position: 0 },
                { id: 2, duration: 0.5, position: 1 },
            ]);
            // page 0 (beat 0) is pre-seeded by the blank DB
            await tx
                .insert(schema.pages)
                .values([{ id: 1, start_beat: 2, is_subset: 0 }]);

            const created = await createMarchersInTransaction({
                tx,
                newMarchers: [
                    {
                        section: "Test Section",
                        drill_prefix: "A",
                        drill_order: 1,
                    },
                ],
            });
            const newId = created[0].id;

            const rowsBeforeRecompute = await tx.query.marcher_pages.findMany({
                where: eq(schema.marcher_pages.marcher_id, newId),
            });
            const byPageBefore = new Map(
                rowsBeforeRecompute.map((r) => [r.page_id, r]),
            );
            expect(byPageBefore.get(1)!.coordinate_mode).toBe(
                COORDINATE_MODE.HOLD,
            );

            // set page 0 to a known MANUAL coordinate
            await tx
                .update(schema.marcher_pages)
                .set({ x: 42, y: 24, coordinate_mode: COORDINATE_MODE.MANUAL })
                .where(
                    and(
                        eq(schema.marcher_pages.marcher_id, newId),
                        eq(schema.marcher_pages.page_id, 0),
                    ),
                );

            await recomputeMarcherCoordinates({ tx, marcherIds: [newId] });

            const rows = await tx.query.marcher_pages.findMany({
                where: eq(schema.marcher_pages.marcher_id, newId),
            });
            const byPage = new Map(rows.map((r) => [r.page_id, r]));
            expect(byPage.get(1)).toMatchObject({ x: 42, y: 24 });
        });
    });
});

describeDbTests("recomputeMarcherCoordinates", (it) => {
    it("interpolates a MOVE row and leaves MANUAL rows untouched", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 1, position: 0 },
                { id: 2, duration: 1, position: 4 },
                { id: 3, duration: 1, position: 8 },
            ]);
            // page 0 (anchor) already exists at beat 0 position 0
            await tx.insert(schema.pages).values([
                { id: 1, start_beat: 2, is_subset: 0 },
                { id: 2, start_beat: 3, is_subset: 0 },
            ]);
            await tx.insert(schema.marchers).values([
                {
                    id: 1,
                    section: "Test Section",
                    drill_prefix: "A",
                    drill_order: 1,
                },
                {
                    id: 2,
                    section: "Test Section",
                    drill_prefix: "A",
                    drill_order: 2,
                },
            ]);
            await tx.insert(schema.marcher_pages).values([
                { marcher_id: 1, page_id: 0, x: 0, y: 0, coordinate_mode: 0 },
                {
                    marcher_id: 1,
                    page_id: 1,
                    x: 99,
                    y: 99,
                    coordinate_mode: 2,
                },
                { marcher_id: 1, page_id: 2, x: 8, y: 16, coordinate_mode: 0 },
                {
                    marcher_id: 2,
                    page_id: 1,
                    x: 50,
                    y: 50,
                    coordinate_mode: 0,
                },
            ]);

            await recomputeMarcherCoordinates({ tx, marcherIds: [1] });

            const moved = await tx.query.marcher_pages.findFirst({
                where: and(
                    eq(schema.marcher_pages.marcher_id, 1),
                    eq(schema.marcher_pages.page_id, 1),
                ),
            });
            expect({ x: moved!.x, y: moved!.y }).toEqual({ x: 4, y: 8 });

            const untouched = await tx.query.marcher_pages.findFirst({
                where: eq(schema.marcher_pages.marcher_id, 2),
            });
            expect({ x: untouched!.x, y: untouched!.y }).toEqual({
                x: 50,
                y: 50,
            });
        });
    });
});

describeDbTests("drag authoring", (it) => {
    it("authoring a downstream page flips held in-between pages to MOVE", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 1, position: 0 },
                { id: 2, duration: 1, position: 4 },
                { id: 3, duration: 1, position: 8 },
            ]);
            await tx.insert(schema.pages).values([
                { id: 1, start_beat: 2, is_subset: 0 },
                { id: 2, start_beat: 3, is_subset: 0 },
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
                { marcher_id: 1, page_id: 0, x: 0, y: 0, coordinate_mode: 0 },
                { marcher_id: 1, page_id: 1, x: 0, y: 0, coordinate_mode: 1 },
                { marcher_id: 1, page_id: 2, x: 0, y: 0, coordinate_mode: 1 },
            ]);
        });

        await updateMarcherPages({
            db,
            modifiedMarcherPages: [{ marcher_id: 1, page_id: 2, x: 8, y: 8 }],
        });

        await transaction(db, async (tx) => {
            const rows = await tx.query.marcher_pages.findMany({
                where: eq(schema.marcher_pages.marcher_id, 1),
            });
            const byPage = new Map(rows.map((r) => [r.page_id, r]));
            expect(byPage.get(2)!.coordinate_mode).toBe(0);
            expect(byPage.get(1)!.coordinate_mode).toBe(2);
            expect({ x: byPage.get(1)!.x, y: byPage.get(1)!.y }).toEqual({
                x: 4,
                y: 4,
            });
        });
    });
});

describeDbTests("non-drag coordinate set", (it) => {
    it("a multi-marcher updateMarcherPages authors every affected marcher", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 1, position: 0 },
                { id: 2, duration: 1, position: 4 },
            ]);
            await tx
                .insert(schema.pages)
                .values([{ id: 1, start_beat: 2, is_subset: 0 }]);
            await tx.insert(schema.marchers).values([
                {
                    id: 1,
                    section: "Test Section",
                    drill_prefix: "A",
                    drill_order: 1,
                },
                {
                    id: 2,
                    section: "Test Section",
                    drill_prefix: "A",
                    drill_order: 2,
                },
            ]);
            await tx.insert(schema.marcher_pages).values([
                { marcher_id: 1, page_id: 0, x: 0, y: 0, coordinate_mode: 0 },
                { marcher_id: 2, page_id: 0, x: 0, y: 0, coordinate_mode: 0 },
                { marcher_id: 1, page_id: 1, x: 0, y: 0, coordinate_mode: 1 },
                { marcher_id: 2, page_id: 1, x: 0, y: 0, coordinate_mode: 1 },
            ]);
        });

        // Simulates an align/circle action: several marchers set on one page at once
        await updateMarcherPages({
            db,
            modifiedMarcherPages: [
                { marcher_id: 1, page_id: 1, x: 10, y: 0 },
                { marcher_id: 2, page_id: 1, x: 20, y: 0 },
            ],
        });

        await transaction(db, async (tx) => {
            const rows = await tx.query.marcher_pages.findMany({
                where: eq(schema.marcher_pages.page_id, 1),
            });
            for (const r of rows) {
                expect(r.coordinate_mode).toBe(0);
            }
        });
    });
});

describeDbTests("new page holds", (it) => {
    it("a newly created page's marcher_page row defaults to HOLD and copies page 0's coordinate", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx
                .insert(schema.beats)
                .values([{ id: 1, duration: 0.5, position: 1 }]);
            await tx.insert(schema.marchers).values([
                {
                    id: 1,
                    section: "Test Section",
                    drill_prefix: "A",
                    drill_order: 1,
                },
            ]);
            // page 0 is pre-seeded by the blank DB
            await tx.insert(schema.marcher_pages).values([
                {
                    marcher_id: 1,
                    page_id: 0,
                    x: 42,
                    y: 24,
                    coordinate_mode: COORDINATE_MODE.MANUAL,
                },
            ]);
        });

        let newPageId: number;
        await transaction(db, async (tx) => {
            const created = await createPagesInTransaction({
                tx,
                newPages: [{ start_beat: 1, is_subset: false }],
            });
            newPageId = created[0].id;
        });

        await transaction(db, async (tx) => {
            const mp = (await tx.query.marcher_pages.findFirst({
                where: and(
                    eq(schema.marcher_pages.marcher_id, 1),
                    eq(schema.marcher_pages.page_id, newPageId),
                ),
            }))!;
            expect(mp.coordinate_mode).toBe(COORDINATE_MODE.HOLD);
            expect(mp).toMatchObject({ x: 42, y: 24 });
        });
    });
});

describeDbTests("deleting a page reflows remaining derived rows", (it) => {
    it("deleting a MANUAL keyframe re-interpolates the MOVE row onto the next remaining MANUAL row", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 1, position: 4 },
                { id: 2, duration: 1, position: 8 },
                { id: 3, duration: 1, position: 12 },
            ]);
            await tx.insert(schema.pages).values([
                { id: 1, start_beat: 1, is_subset: 0 },
                { id: 2, start_beat: 2, is_subset: 0 },
                { id: 3, start_beat: 3, is_subset: 0 },
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
                {
                    marcher_id: 1,
                    page_id: 0,
                    x: 0,
                    y: 0,
                    coordinate_mode: COORDINATE_MODE.MANUAL,
                },
                {
                    marcher_id: 1,
                    page_id: 1,
                    x: 999,
                    y: 999,
                    coordinate_mode: COORDINATE_MODE.MOVE,
                },
                // page 2 is the MANUAL keyframe that gets deleted
                {
                    marcher_id: 1,
                    page_id: 2,
                    x: 80,
                    y: 0,
                    coordinate_mode: COORDINATE_MODE.MANUAL,
                },
                {
                    marcher_id: 1,
                    page_id: 3,
                    x: 120,
                    y: 0,
                    coordinate_mode: COORDINATE_MODE.MANUAL,
                },
            ]);
        });

        await deletePages({ db, pageIds: new Set([2]) });

        await transaction(db, async (tx) => {
            const read = async (pageId: number) =>
                (await tx.query.marcher_pages.findFirst({
                    where: and(
                        eq(schema.marcher_pages.marcher_id, 1),
                        eq(schema.marcher_pages.page_id, pageId),
                    ),
                }))!;
            // page 2 is gone, so page 1 (MOVE, beat pos 4) now interpolates
            // between page 0 (0,0 at pos 0) and page 3 (120,0 at pos 12): t = 1/3
            const moveRow = await read(1);
            expect(moveRow.coordinate_mode).toBe(COORDINATE_MODE.MOVE);
            expect({ x: moveRow.x, y: moveRow.y }).toEqual({ x: 40, y: 0 });

            const manualRow = await read(3);
            expect(manualRow.coordinate_mode).toBe(COORDINATE_MODE.MANUAL);
            expect({ x: manualRow.x, y: manualRow.y }).toEqual({
                x: 120,
                y: 0,
            });
        });
    });
});

describeDbTests("deleting a page by yank reflows derived rows", (it) => {
    it("yanking a page shifts later start_beats and reinterpolates the MOVE row", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 1, position: 4 },
                { id: 2, duration: 1, position: 8 },
                { id: 3, duration: 1, position: 12 },
            ]);
            await tx.insert(schema.pages).values([
                { id: 1, start_beat: 1, is_subset: 0 },
                { id: 2, start_beat: 2, is_subset: 0 },
                { id: 3, start_beat: 3, is_subset: 0 },
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
                {
                    marcher_id: 1,
                    page_id: 0,
                    x: 0,
                    y: 0,
                    coordinate_mode: COORDINATE_MODE.MANUAL,
                },
                // page 1 (beat pos 4) is yank-deleted
                {
                    marcher_id: 1,
                    page_id: 1,
                    x: 0,
                    y: 0,
                    coordinate_mode: COORDINATE_MODE.MANUAL,
                },
                {
                    marcher_id: 1,
                    page_id: 2,
                    x: 999,
                    y: 999,
                    coordinate_mode: COORDINATE_MODE.MOVE,
                },
                {
                    marcher_id: 1,
                    page_id: 3,
                    x: 120,
                    y: 0,
                    coordinate_mode: COORDINATE_MODE.MANUAL,
                },
            ]);
        });

        await deletePageYank({ db, pageId: 1 });

        await transaction(db, async (tx) => {
            const read = async (pageId: number) =>
                (await tx.query.marcher_pages.findFirst({
                    where: and(
                        eq(schema.marcher_pages.marcher_id, 1),
                        eq(schema.marcher_pages.page_id, pageId),
                    ),
                }))!;
            // yanking page 1 shifts page 2 to beat pos 4 and page 3 to beat pos 8
            // so page 2 (MOVE) interpolates between page 0 (0,0 at 0) and page 3 (120,0 at 8): t = 0.5
            const moveRow = await read(2);
            expect(moveRow.coordinate_mode).toBe(COORDINATE_MODE.MOVE);
            expect({ x: moveRow.x, y: moveRow.y }).toEqual({ x: 60, y: 0 });

            const manualRow = await read(3);
            expect(manualRow.coordinate_mode).toBe(COORDINATE_MODE.MANUAL);
            expect({ x: manualRow.x, y: manualRow.y }).toEqual({
                x: 120,
                y: 0,
            });
        });
    });
});

describeDbTests("shape placement flips holds", (it) => {
    it("placing on a later page flips an intervening HOLD to MOVE and interpolates it", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 1, position: 0 },
                { id: 2, duration: 1, position: 4 },
                { id: 3, duration: 1, position: 8 },
            ]);
            await tx.insert(schema.pages).values([
                { id: 1, start_beat: 2, is_subset: 0 },
                { id: 2, start_beat: 3, is_subset: 0 },
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
                {
                    marcher_id: 1,
                    page_id: 0,
                    x: 0,
                    y: 0,
                    coordinate_mode: COORDINATE_MODE.MANUAL,
                },
                {
                    marcher_id: 1,
                    page_id: 1,
                    x: 0,
                    y: 0,
                    coordinate_mode: COORDINATE_MODE.HOLD,
                },
                {
                    marcher_id: 1,
                    page_id: 2,
                    x: 0,
                    y: 0,
                    coordinate_mode: COORDINATE_MODE.HOLD,
                },
            ]);
        });

        // Mirrors createShapePagesInTransaction: place the marcher, then recompute
        await transaction(db, async (tx) => {
            await _updateChildMarcherPages({
                tx,
                pageId: 2,
                marcherCoordinates: [{ marcher_id: 1, x: 8, y: 8 }],
            });
            await recomputeMarcherCoordinates({ tx, marcherIds: [1] });
        });

        await transaction(db, async (tx) => {
            const read = async (pageId: number) =>
                (await tx.query.marcher_pages.findFirst({
                    where: and(
                        eq(schema.marcher_pages.marcher_id, 1),
                        eq(schema.marcher_pages.page_id, pageId),
                    ),
                }))!;

            const targetRow = await read(2);
            expect(targetRow.coordinate_mode).toBe(COORDINATE_MODE.MANUAL);
            expect({ x: targetRow.x, y: targetRow.y }).toEqual({
                x: 8,
                y: 8,
            });

            const heldRow = await read(1);
            expect(heldRow.coordinate_mode).toBe(COORDINATE_MODE.MOVE);
            // page 0 (0,0 at pos 0) to page 2 (8,8 at pos 8): t = 4/8 = 0.5
            expect({ x: heldRow.x, y: heldRow.y }).toEqual({ x: 4, y: 4 });
        });
    });
});

describeDbTests("swap authors and preserves on derived pages", (it) => {
    it("swapping two marchers authors both rows as MANUAL and survives a recompute", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 1, position: 0 },
                { id: 2, duration: 1, position: 4 },
            ]);
            await tx
                .insert(schema.pages)
                .values([{ id: 1, start_beat: 2, is_subset: 0 }]);
            await tx.insert(schema.marchers).values([
                {
                    id: 1,
                    section: "Test Section",
                    drill_prefix: "A",
                    drill_order: 1,
                },
                {
                    id: 2,
                    section: "Test Section",
                    drill_prefix: "A",
                    drill_order: 2,
                },
            ]);
            await tx.insert(schema.marcher_pages).values([
                {
                    marcher_id: 1,
                    page_id: 0,
                    x: 0,
                    y: 0,
                    coordinate_mode: COORDINATE_MODE.MANUAL,
                },
                {
                    marcher_id: 2,
                    page_id: 0,
                    x: 10,
                    y: 10,
                    coordinate_mode: COORDINATE_MODE.MANUAL,
                },
                {
                    marcher_id: 1,
                    page_id: 1,
                    x: 0,
                    y: 0,
                    coordinate_mode: COORDINATE_MODE.HOLD,
                },
                {
                    marcher_id: 2,
                    page_id: 1,
                    x: 10,
                    y: 10,
                    coordinate_mode: COORDINATE_MODE.HOLD,
                },
            ]);
        });

        await swapMarchers({ db, pageId: 1, marcher1Id: 1, marcher2Id: 2 });

        const read = async (marcherId: number) => {
            let result: typeof schema.marcher_pages.$inferSelect | undefined;
            await transaction(db, async (tx) => {
                result = await tx.query.marcher_pages.findFirst({
                    where: and(
                        eq(schema.marcher_pages.marcher_id, marcherId),
                        eq(schema.marcher_pages.page_id, 1),
                    ),
                });
            });
            return result!;
        };

        const row1AfterSwap = await read(1);
        expect(row1AfterSwap.coordinate_mode).toBe(COORDINATE_MODE.MANUAL);
        expect({ x: row1AfterSwap.x, y: row1AfterSwap.y }).toEqual({
            x: 10,
            y: 10,
        });

        const row2AfterSwap = await read(2);
        expect(row2AfterSwap.coordinate_mode).toBe(COORDINATE_MODE.MANUAL);
        expect({ x: row2AfterSwap.x, y: row2AfterSwap.y }).toEqual({
            x: 0,
            y: 0,
        });

        // Recompute again to confirm the swapped coordinates are stable, not reverted
        await transaction(db, async (tx) => {
            await recomputeMarcherCoordinates({ tx, marcherIds: [1, 2] });
        });

        const row1AfterRecompute = await read(1);
        expect({ x: row1AfterRecompute.x, y: row1AfterRecompute.y }).toEqual({
            x: 10,
            y: 10,
        });

        const row2AfterRecompute = await read(2);
        expect({ x: row2AfterRecompute.x, y: row2AfterRecompute.y }).toEqual({
            x: 0,
            y: 0,
        });
    });
});

describeDbTests("changing a page start_beat reinterpolates MOVE rows", (it) => {
    it("moving the MOVE page's start_beat re-interpolates it to the new t", async ({
        db,
    }) => {
        await transaction(db, async (tx) => {
            await tx.insert(schema.beats).values([
                { id: 1, duration: 1, position: 2 },
                { id: 2, duration: 1, position: 6 },
                { id: 3, duration: 1, position: 12 },
            ]);
            await tx.insert(schema.pages).values([
                { id: 1, start_beat: 1, is_subset: 0 },
                { id: 2, start_beat: 3, is_subset: 0 },
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
                {
                    marcher_id: 1,
                    page_id: 0,
                    x: 0,
                    y: 0,
                    coordinate_mode: COORDINATE_MODE.MANUAL,
                },
                {
                    marcher_id: 1,
                    page_id: 1,
                    x: 999,
                    y: 999,
                    coordinate_mode: COORDINATE_MODE.MOVE,
                },
                {
                    marcher_id: 1,
                    page_id: 2,
                    x: 120,
                    y: 0,
                    coordinate_mode: COORDINATE_MODE.MANUAL,
                },
            ]);
        });

        await transaction(db, async (tx) => {
            // moves page 1 from beat position 2 to beat position 6
            await updatePagesInTransaction({
                tx,
                modifiedPages: [{ id: 1, start_beat: 2 }],
            });
        });

        await transaction(db, async (tx) => {
            const moveRow = (await tx.query.marcher_pages.findFirst({
                where: and(
                    eq(schema.marcher_pages.marcher_id, 1),
                    eq(schema.marcher_pages.page_id, 1),
                ),
            }))!;
            // page 0 (0,0 at pos 0) to page 2 (120,0 at pos 12): t = 6/12 = 0.5
            expect({ x: moveRow.x, y: moveRow.y }).toEqual({ x: 60, y: 0 });
        });
    });
});

// history tests are gated behind VITEST_ENABLE_HISTORY and skipped by default
describeDbTests("authoring coordinates undoes and redoes cleanly", (baseIt) => {
    const testWithHistory = getTestWithHistory(baseIt, [
        schema.beats,
        schema.pages,
        schema.marchers,
        schema.marcher_pages,
    ]);

    testWithHistory(
        "authoring a marcher coordinate is one clean undo group",
        async ({ db, marchersAndPages, expectNumberOfChanges }) => {
            void marchersAndPages;
            const before = await db.query.marcher_pages.findFirst({
                where: and(
                    eq(schema.marcher_pages.marcher_id, 1),
                    eq(schema.marcher_pages.page_id, 1),
                ),
            });

            await updateMarcherPages({
                db,
                modifiedMarcherPages: [
                    { marcher_id: 1, page_id: 1, x: 321, y: 654 },
                ],
            });

            const after = await db.query.marcher_pages.findFirst({
                where: and(
                    eq(schema.marcher_pages.marcher_id, 1),
                    eq(schema.marcher_pages.page_id, 1),
                ),
            });
            expect({ x: after!.x, y: after!.y }).toEqual({ x: 321, y: 654 });
            expect({ x: before!.x, y: before!.y }).not.toEqual({
                x: 321,
                y: 654,
            });

            // authoring plus its flip and recompute collapse into exactly one undo group
            await expectNumberOfChanges.test(db, 1);
        },
    );
});
