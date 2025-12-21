import { describeDbTests, schema, transaction } from "@/test/base";
import { describe, expect, it } from "vitest";
import {
    getAllMarcherPages,
    getNextMarcherPage,
    getPreviousMarcherPage,
    lockedDecorator,
    marcherPagesByPageId,
    swapMarchers,
} from "../marcherPage";
import { and, eq, inArray } from "drizzle-orm";
import {
    createShapePages,
    DatabaseShapePageMarcher,
    DbConnection,
    ShapePageMarcher,
} from "..";
import { faker } from "@faker-js/faker";
import MarcherPage, { DatabaseMarcherPage } from "@/global/classes/MarcherPage";
import { getTestWithHistory } from "@/test/history";
import fc from "fast-check";
import { _createMarcherShape } from "@/global/classes/canvasObjects/MarcherShape";

const fakeMarcherId = () => faker.number.int({ min: 1, max: 76 });
const fakePageId = () => faker.number.int({ min: 0, max: 5 });

// const generateMarcherPageIds = (seed?: number) => {
//     faker.seed(seed);
//     return {
//         marcher_id: fakeMarcherId(),
//         page_id: fakePageId(),
//     };
// };

const generateUniqueMarcherPageIds = (num: number, seed?: number) => {
    faker.seed(seed);
    const keyFromIds = (pageId: number, marcherId: number) =>
        `marcher_${marcherId}-page_${pageId}`;
    const marcherPageIds: { marcher_id: number; page_id: number }[] = [];
    const keys = new Set<string>();
    const MAX_TRIES = 1000000;
    let tries = 0;
    while (marcherPageIds.length < num && tries < MAX_TRIES) {
        const marcherId = fakeMarcherId();
        const pageId = fakePageId();
        const key = keyFromIds(pageId, marcherId);
        if (!keys.has(key)) {
            keys.add(key);
            marcherPageIds.push({ marcher_id: marcherId, page_id: pageId });
        }
        tries++;
    }
    if (marcherPageIds.length < num) {
        throw new Error(
            `Could not generate ${num} unique marcher-page ids after ${MAX_TRIES} tries`,
        );
    }
    return marcherPageIds;
};

const createMockSpm = async ({
    db,
    pageId,
    marcherId,
}: {
    db: DbConnection;
    pageId: number;
    marcherId: number;
}) => {
    // also create the shape page marchers
    const shapePages = await createShapePages({
        db,
        newItems: [
            {
                page_id: pageId,
                marcher_coordinates: [{ marcher_id: marcherId, x: 0, y: 0 }],
                svg_path: "",
            },
        ],
    });
    return shapePages;
};

describeDbTests("marcherPage", (it) => {
    describe.each([
        {
            direction: "next",
            start_ids: { marcherId: 1, pageId: 0 },
            expected_id: 77,
        },
        {
            direction: "previous",
            start_ids: { marcherId: 1, pageId: 1 },
            expected_id: 1,
        },
        {
            direction: "next",
            start_ids: { marcherId: 2, pageId: 1 },
            expected_id: 153,
        },
    ])(
        "should be able to get $direction marcher page - $start_ids",
        ({ direction, start_ids, expected_id }) => {
            it("get single direct neighbor by marcherId and pageId", async ({
                db,
                marchersAndPages,
            }) => {
                let curMp;
                let nextMp;

                const func =
                    direction === "next"
                        ? getNextMarcherPage
                        : getPreviousMarcherPage;

                await transaction(db, async (tx) => {
                    curMp = await tx.query.marcher_pages.findFirst({
                        where: and(
                            eq(
                                schema.marcher_pages.marcher_id,
                                start_ids.marcherId,
                            ),
                            eq(schema.marcher_pages.page_id, start_ids.pageId),
                        ),
                    });
                    nextMp = await func(tx, {
                        marcherId: start_ids.marcherId,
                        pageId: start_ids.pageId,
                    });
                });
                expect(curMp).toBeTruthy();
                expect(curMp!.marcher_id).toEqual(start_ids.marcherId);
                expect(curMp!.page_id).toBe(start_ids.pageId);

                const expectedPageId =
                    curMp!.page_id + (direction === "next" ? 1 : -1);

                expect(nextMp).toBeTruthy();
                expect(nextMp!.id).toEqual(expected_id);
                expect(nextMp!.marcher_id).toEqual(1);
                // Not a great check because ID doesn't inherently define order
                expect(nextMp!.page_id).toBe(expectedPageId);
            });
        },
    );

    describe.each([
        {
            direction: "next",
            marcherPageId: 1,
            expected_id: 77,
        },
        {
            direction: "previous",
            marcherPageId: 77,
            expected_id: 1,
        },
    ])(
        "should be able to get $direction marcher page - $marcherPageId",
        ({ direction, marcherPageId, expected_id }) => {
            it("get single direct neighbor by marcherPageId", async ({
                db,
                marchersAndPages,
            }) => {
                let curMp;
                let nextMp;

                const func =
                    direction === "next"
                        ? getNextMarcherPage
                        : getPreviousMarcherPage;

                await transaction(db, async (tx) => {
                    curMp = await tx.query.marcher_pages.findFirst({
                        where: eq(schema.marcher_pages.id, marcherPageId),
                    });
                    nextMp = await func(tx, {
                        marcherPageId: marcherPageId,
                    });
                });
                expect(curMp).toBeTruthy();
                expect(curMp!.id).toEqual(marcherPageId);

                const expectedPageId =
                    curMp!.page_id + (direction === "next" ? 1 : -1);

                expect(nextMp).toBeTruthy();
                expect(nextMp!.id).toEqual(expected_id);
                expect(nextMp!.marcher_id).toEqual(1);
                // Not a great check because ID doesn't inherently define order
                expect(nextMp!.page_id).toBe(expectedPageId);
            });
        },
    );
    describe("Locked marcher pages", () => {
        it.for([
            ...Array(20)
                .fill(null)
                .map((_, i) => ({ numberOfPages: 5, seed: i })),
            ...Array(10)
                .fill(null)
                .map((_, i) => ({ numberOfPages: 10, seed: i })),
            ...Array(5)
                .fill(null)
                .map((_, i) => ({ numberOfPages: 50, seed: i })),
        ])(
            "%# - should be locked when the spm exists on some pages - numberOfPages: $numberOfPages, seed: $seed",
            async ({ numberOfPages, seed }, { db, marchersAndPages }) => {
                const marcherPagesToLock = generateUniqueMarcherPageIds(
                    numberOfPages,
                    seed,
                );
                for (const { page_id, marcher_id } of marcherPagesToLock) {
                    const marcherPage = (await db.query.marcher_pages.findFirst(
                        {
                            where: and(
                                eq(schema.marcher_pages.page_id, page_id),
                                eq(schema.marcher_pages.marcher_id, marcher_id),
                            ),
                        },
                    )) as DatabaseMarcherPage;
                    expect(marcherPage).toBeDefined();
                    expect(marcherPage.page_id).toBe(page_id);
                    expect(marcherPage.marcher_id).toBe(marcher_id);
                    await createMockSpm({
                        db,
                        pageId: page_id,
                        marcherId: marcher_id,
                    });
                }

                const pageIds = new Set<number>();
                for (const { page_id } of marcherPagesToLock) {
                    pageIds.add(page_id);
                }

                // assert that the shape pages exist where they are expected to with the locked marchers
                const shapePages = await db.query.shape_pages.findMany();
                for (const { page_id, marcher_id } of marcherPagesToLock) {
                    const shapePageIds = shapePages
                        .filter((sp) => sp.page_id === page_id)
                        .map((sp) => sp.id);
                    const shapePageMarcher =
                        (await db.query.shape_page_marchers.findFirst({
                            where: and(
                                inArray(
                                    schema.shape_page_marchers.shape_page_id,
                                    shapePageIds,
                                ),
                                eq(
                                    schema.shape_page_marchers.marcher_id,
                                    marcher_id,
                                ),
                            ),
                        })) as DatabaseShapePageMarcher;
                    expect(shapePageMarcher).toBeDefined();
                    expect(shapePageMarcher.marcher_id).toBe(marcher_id);
                }

                // Check that getAllMarcherPages is locked
                const marcherPagesResponse = await getAllMarcherPages({
                    db,
                    pinkyPromiseThatYouKnowWhatYouAreDoing: true,
                });
                const expectToBeLocked = (marcherPage: MarcherPage) => {
                    return (
                        marcherPagesToLock.find(
                            (mp) =>
                                mp.marcher_id === marcherPage.marcher_id &&
                                mp.page_id === marcherPage.page_id,
                        ) !== undefined
                    );
                };
                for (const marcherPage of marcherPagesResponse) {
                    expect(marcherPage).toBeDefined();
                    const isLocked = expectToBeLocked(marcherPage);
                    if (isLocked) {
                        expect(marcherPage.isLocked).toBe(true);
                        expect(marcherPage.lockedReason).toContain("shape");
                    } else {
                        expect(marcherPage.isLocked).toBe(false);
                        expect(marcherPage.lockedReason).toBe("");
                    }
                }

                // Check that getByPageId is locked
                const allPages = await db.query.pages.findMany();
                expect(allPages).toBeDefined();
                expect(allPages.length).toBeGreaterThan(0);
                for (const { id: page_id } of allPages) {
                    const marcherPagesResponseByPageId =
                        await marcherPagesByPageId({
                            db,
                            pageId: page_id,
                        });
                    for (const marcherPage of marcherPagesResponseByPageId) {
                        expect(marcherPage).toBeDefined();
                        const isLocked = expectToBeLocked(marcherPage);
                        if (isLocked) {
                            expect(marcherPage.isLocked).toBe(true);
                            expect(marcherPage.lockedReason).toContain(
                                "shape",
                            );
                        } else {
                            expect(marcherPage.isLocked).toBe(false);
                            expect(marcherPage.lockedReason).toBe("");
                        }
                    }
                }

                // Check that get by position is locked
                for (const marcherPage of marcherPagesResponse) {
                    const nextMp = await getNextMarcherPage(db, {
                        marcherPageId: marcherPage.id,
                    });
                    // Fix: Array.prototype.max() does not exist. Use Math.max instead.
                    const maxPageId = Math.max(...allPages.map((p) => p.id));
                    if (marcherPage.page_id === maxPageId)
                        expect(nextMp).toBe(null);
                    else {
                        expect(nextMp).toBeTruthy();
                        if (expectToBeLocked(nextMp!)) {
                            expect(nextMp!.isLocked).toBe(true);
                            expect(nextMp!.lockedReason).toContain("shape");
                        } else {
                            expect(nextMp!.isLocked).toBe(false);
                            expect(nextMp!.lockedReason).toBe("");
                        }
                    }

                    const previousMp = await getPreviousMarcherPage(db, {
                        marcherPageId: marcherPage.id,
                    });
                    // Fix: Array.prototype.max() does not exist. Use Math.max instead.
                    if (marcherPage.page_id === 0)
                        expect(previousMp).toBe(null);
                    else {
                        expect(
                            previousMp,
                            `Expect marcherPage to have previous {page_id: ${marcherPage.page_id}, marcher_id: ${marcherPage.marcher_id}}`,
                        ).toBeTruthy();
                        if (expectToBeLocked(previousMp!)) {
                            expect(previousMp!.isLocked).toBe(true);
                            expect(previousMp!.lockedReason).toContain("shape");
                        } else {
                            expect(previousMp!.isLocked).toBe(false);
                            expect(previousMp!.lockedReason).toBe("");
                        }
                    }
                }
            },
        );
    });
});

describe("lockedDecorator", () => {
    // Helper function to create a mock DatabaseMarcherPage
    // Note: visible and label_visible use parsed boolean values since lockedDecorator
    // returns MarcherPage (with parsed values) via appearanceModelRawToParsed
    const createMockMarcherPage = (
        overrides: Partial<DatabaseMarcherPage> = {},
    ): DatabaseMarcherPage =>
        ({
            id: 1,
            marcher_id: 1,
            page_id: 1,
            x: 100,
            y: 200,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            path_data_id: null,
            path_start_position: null,
            path_end_position: null,
            notes: null,
            rotation_degrees: 0,
            fill_color: null,
            outline_color: null,
            visible: false,
            label_visible: false,
            ...overrides,
        }) as DatabaseMarcherPage;

    // Helper function to create a mock ShapePageMarcher
    const createMockShapePageMarcher = (
        overrides: Partial<ShapePageMarcher> = {},
    ): ShapePageMarcher => ({
        id: 1,
        shape_page_id: 1,
        marcher_id: 1,
        position_order: 1,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        notes: null,
        ...overrides,
    });

    it("should return empty array when given empty marcherPages array", () => {
        const marcherPages: DatabaseMarcherPage[] = [];
        const spmsByMarcherPage = new Map<string, ShapePageMarcher>();

        const result = lockedDecorator(marcherPages, spmsByMarcherPage);

        expect(result).toEqual([]);
    });

    it("should return marcher pages with isLocked=false when no shape page marchers exist", () => {
        const marcherPages: DatabaseMarcherPage[] = [
            createMockMarcherPage({ id: 1, marcher_id: 1, page_id: 1 }),
            createMockMarcherPage({ id: 2, marcher_id: 2, page_id: 1 }),
        ];
        const spmsByMarcherPage = new Map<string, ShapePageMarcher>();

        const result = lockedDecorator(marcherPages, spmsByMarcherPage);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            ...marcherPages[0],
            isLocked: false,
            lockedReason: "",
        });
        expect(result[1]).toEqual({
            ...marcherPages[1],
            isLocked: false,
            lockedReason: "",
        });
    });

    it("should mark marcher pages as locked when they have corresponding shape page marchers", () => {
        const marcherPages: DatabaseMarcherPage[] = [
            createMockMarcherPage({ id: 1, marcher_id: 1, page_id: 1 }),
            createMockMarcherPage({ id: 2, marcher_id: 2, page_id: 1 }),
        ];
        const spmsByMarcherPage = new Map<string, ShapePageMarcher>([
            ["marcher_1-page_1", createMockShapePageMarcher({ marcher_id: 1 })],
        ]);

        const result = lockedDecorator(marcherPages, spmsByMarcherPage);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            ...marcherPages[0],
            isLocked: true,
            lockedReason: "Marcher is part of a shape\n",
        });
        expect(result[1]).toEqual({
            ...marcherPages[1],
            isLocked: false,
            lockedReason: "",
        });
    });

    it("should mark all marcher pages as locked when all have corresponding shape page marchers", () => {
        const marcherPages: DatabaseMarcherPage[] = [
            createMockMarcherPage({ id: 1, marcher_id: 1, page_id: 1 }),
            createMockMarcherPage({ id: 2, marcher_id: 2, page_id: 1 }),
        ];
        const spmsByMarcherPage = new Map<string, ShapePageMarcher>([
            ["marcher_1-page_1", createMockShapePageMarcher({ marcher_id: 1 })],
            ["marcher_2-page_1", createMockShapePageMarcher({ marcher_id: 2 })],
        ]);

        const result = lockedDecorator(marcherPages, spmsByMarcherPage);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            ...marcherPages[0],
            isLocked: true,
            lockedReason: "Marcher is part of a shape\n",
        });
        expect(result[1]).toEqual({
            ...marcherPages[1],
            isLocked: true,
            lockedReason: "Marcher is part of a shape\n",
        });
    });

    it("should handle different marcher and page combinations correctly", () => {
        const marcherPages: DatabaseMarcherPage[] = [
            createMockMarcherPage({ id: 1, marcher_id: 1, page_id: 1 }),
            createMockMarcherPage({ id: 2, marcher_id: 1, page_id: 2 }),
            createMockMarcherPage({ id: 3, marcher_id: 2, page_id: 1 }),
            createMockMarcherPage({ id: 4, marcher_id: 2, page_id: 2 }),
        ];
        const spmsByMarcherPage = new Map<string, ShapePageMarcher>([
            ["marcher_1-page_1", createMockShapePageMarcher({ marcher_id: 1 })],
            ["marcher_2-page_2", createMockShapePageMarcher({ marcher_id: 2 })],
        ]);

        const result = lockedDecorator(marcherPages, spmsByMarcherPage);

        expect(result).toHaveLength(4);
        expect(result[0]).toEqual({
            ...marcherPages[0],
            isLocked: true,
            lockedReason: "Marcher is part of a shape\n",
        });
        expect(result[1]).toEqual({
            ...marcherPages[1],
            isLocked: false,
            lockedReason: "",
        });
        expect(result[2]).toEqual({
            ...marcherPages[2],
            isLocked: false,
            lockedReason: "",
        });
        expect(result[3]).toEqual({
            ...marcherPages[3],
            isLocked: true,
            lockedReason: "Marcher is part of a shape\n",
        });
    });

    it("should preserve all original properties of marcher pages", () => {
        const marcherPage = createMockMarcherPage({
            id: 1,
            marcher_id: 1,
            page_id: 1,
            x: 150.5,
            y: 250.75,
            path_data_id: 5,
            path_start_position: 0.2,
            path_end_position: 0.8,
            notes: "Test notes",
            rotation_degrees: 45,
        });
        const marcherPages: DatabaseMarcherPage[] = [marcherPage];
        const spmsByMarcherPage = new Map<string, ShapePageMarcher>([
            ["marcher_1-page_1", createMockShapePageMarcher({ marcher_id: 1 })],
        ]);

        const result = lockedDecorator(marcherPages, spmsByMarcherPage);

        expect(result[0]).toEqual({
            ...marcherPage,
            isLocked: true,
            lockedReason: "Marcher is part of a shape\n",
        });
    });

    it("should not mutate the original marcher pages array", () => {
        const marcherPages: DatabaseMarcherPage[] = [
            createMockMarcherPage({ id: 1, marcher_id: 1, page_id: 1 }),
        ];
        const originalMarcherPages = [...marcherPages];
        const spmsByMarcherPage = new Map<string, ShapePageMarcher>([
            ["marcher_1-page_1", createMockShapePageMarcher({ marcher_id: 1 })],
        ]);

        lockedDecorator(marcherPages, spmsByMarcherPage);

        expect(marcherPages).toEqual(originalMarcherPages);
        expect(marcherPages[0]).not.toHaveProperty("isLocked");
        expect(marcherPages[0]).not.toHaveProperty("lockedReason");
    });

    it("should not mutate the original shape page marchers map", () => {
        const marcherPages: DatabaseMarcherPage[] = [
            createMockMarcherPage({ id: 1, marcher_id: 1, page_id: 1 }),
        ];
        const spmsByMarcherPage = new Map<string, ShapePageMarcher>([
            ["marcher_1-page_1", createMockShapePageMarcher({ marcher_id: 1 })],
        ]);
        const originalSpmsByMarcherPage = new Map(spmsByMarcherPage);

        lockedDecorator(marcherPages, spmsByMarcherPage);

        expect(spmsByMarcherPage).toEqual(originalSpmsByMarcherPage);
    });

    it("should handle large numbers of marcher pages efficiently", () => {
        const marcherPages: DatabaseMarcherPage[] = Array.from(
            { length: 100 },
            (_, i) =>
                createMockMarcherPage({
                    id: i + 1,
                    marcher_id: (i % 10) + 1,
                    page_id: Math.floor(i / 10) + 1,
                }),
        );
        const spmsByMarcherPage = new Map<string, ShapePageMarcher>([
            ["marcher_1-page_1", createMockShapePageMarcher({ marcher_id: 1 })],
            ["marcher_5-page_3", createMockShapePageMarcher({ marcher_id: 5 })],
        ]);

        const result = lockedDecorator(marcherPages, spmsByMarcherPage);

        expect(result).toHaveLength(100);

        // Check that only the expected marcher pages are locked
        const lockedCount = result.filter((mp) => mp.isLocked).length;
        expect(lockedCount).toBe(2);

        // Verify specific locked marcher pages
        const lockedMarcherPage1 = result.find(
            (mp) => mp.marcher_id === 1 && mp.page_id === 1,
        );
        expect(lockedMarcherPage1?.isLocked).toBe(true);
        expect(lockedMarcherPage1?.lockedReason).toBe(
            "Marcher is part of a shape\n",
        );

        const lockedMarcherPage2 = result.find(
            (mp) => mp.marcher_id === 5 && mp.page_id === 3,
        );
        expect(lockedMarcherPage2?.isLocked).toBe(true);
        expect(lockedMarcherPage2?.lockedReason).toBe(
            "Marcher is part of a shape\n",
        );
    });

    it("should handle edge case with zero marcher_id and page_id", () => {
        const marcherPages: DatabaseMarcherPage[] = [
            createMockMarcherPage({ id: 1, marcher_id: 0, page_id: 0 }),
        ];
        const spmsByMarcherPage = new Map<string, ShapePageMarcher>([
            ["marcher_0-page_0", createMockShapePageMarcher({ marcher_id: 0 })],
        ]);

        const result = lockedDecorator(marcherPages, spmsByMarcherPage);

        expect(result[0]).toEqual({
            ...marcherPages[0],
            isLocked: true,
            lockedReason: "Marcher is part of a shape\n",
        });
    });

    it("should handle very large marcher_id and page_id values", () => {
        const marcherPages: DatabaseMarcherPage[] = [
            createMockMarcherPage({
                id: 1,
                marcher_id: 999999,
                page_id: 888888,
            }),
        ];
        const spmsByMarcherPage = new Map<string, ShapePageMarcher>([
            [
                "marcher_999999-page_888888",
                createMockShapePageMarcher({ marcher_id: 999999 }),
            ],
        ]);

        const result = lockedDecorator(marcherPages, spmsByMarcherPage);

        expect(result[0]).toEqual({
            ...marcherPages[0],
            isLocked: true,
            lockedReason: "Marcher is part of a shape\n",
        });
    });
});

describeDbTests("swapMarchers", (it) => {
    const testWithHistory = getTestWithHistory(it, [
        schema.marchers,
        schema.marcher_pages,
        schema.pages,
        schema.beats,
        schema.shape_page_marchers,
        schema.shape_pages,
        schema.shapes,
    ]);
    describe("no shapes", () => {
        testWithHistory(
            "swap single marcher",
            async ({ db, marchersAndPages }) => {
                const pageId = 0;
                const marcher1Id = 1;
                const marcher2Id = 2;
                const marcherPage1Before =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.page_id, pageId),
                            eq(schema.marcher_pages.marcher_id, marcher1Id),
                        ),
                    });
                const marcherPage2Before =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.page_id, pageId),
                            eq(schema.marcher_pages.marcher_id, marcher2Id),
                        ),
                    });

                await swapMarchers({
                    db,
                    pageId,
                    marcher1Id,
                    marcher2Id,
                });

                const marcherPage1After =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.page_id, pageId),
                            eq(schema.marcher_pages.marcher_id, marcher1Id),
                        ),
                    });
                const marcherPage2After =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.page_id, pageId),
                            eq(schema.marcher_pages.marcher_id, marcher2Id),
                        ),
                    });
                expect({
                    x: marcherPage1After?.x,
                    y: marcherPage1After?.y,
                }).toEqual({
                    x: marcherPage2Before?.x,
                    y: marcherPage2Before?.y,
                });
                expect({
                    x: marcherPage2After?.x,
                    y: marcherPage2After?.y,
                }).toEqual({
                    x: marcherPage1Before?.x,
                    y: marcherPage1Before?.y,
                });
            },
        );
        it("should swap any two marchers", async ({ db, marchersAndPages }) => {
            const marcherIds = (
                await db.query.marchers.findMany({
                    columns: {
                        id: true,
                    },
                })
            ).map((m) => m.id);
            const pageIds = (
                await db.query.pages.findMany({
                    columns: {
                        id: true,
                    },
                })
            ).map((p) => p.id);

            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        marcherIds: fc.uniqueArray(
                            fc.constantFrom(...marcherIds),
                            { minLength: 2, maxLength: 2 },
                        ),
                        pageId: fc.constantFrom(...pageIds),
                    }),
                    async ({ marcherIds, pageId }) => {
                        const marcherPage1Before =
                            await db.query.marcher_pages.findFirst({
                                where: and(
                                    eq(schema.marcher_pages.page_id, pageId),
                                    eq(
                                        schema.marcher_pages.marcher_id,
                                        marcherIds[0],
                                    ),
                                ),
                            });
                        const marcherPage2Before =
                            await db.query.marcher_pages.findFirst({
                                where: and(
                                    eq(schema.marcher_pages.page_id, pageId),
                                    eq(
                                        schema.marcher_pages.marcher_id,
                                        marcherIds[1],
                                    ),
                                ),
                            });
                        expect(marcherPage1Before).not.toBeNull();
                        expect(marcherPage2Before).not.toBeNull();
                        await swapMarchers({
                            db,
                            pageId,
                            marcher1Id: marcherIds[0],
                            marcher2Id: marcherIds[1],
                        });
                        const marcherPage1After =
                            await db.query.marcher_pages.findFirst({
                                where: and(
                                    eq(schema.marcher_pages.page_id, pageId),
                                    eq(
                                        schema.marcher_pages.marcher_id,
                                        marcherIds[0],
                                    ),
                                ),
                            });
                        const marcherPage2After =
                            await db.query.marcher_pages.findFirst({
                                where: and(
                                    eq(schema.marcher_pages.page_id, pageId),
                                    eq(
                                        schema.marcher_pages.marcher_id,
                                        marcherIds[1],
                                    ),
                                ),
                            });
                        expect(marcherPage1After).not.toBeNull();
                        expect(marcherPage2After).not.toBeNull();
                        expect({
                            x: marcherPage1After!.x,
                            y: marcherPage1After!.y,
                        }).toEqual({
                            x: marcherPage2Before!.x,
                            y: marcherPage2Before!.y,
                        });
                        expect({
                            x: marcherPage2After!.x,
                            y: marcherPage2After!.y,
                        }).toEqual({
                            x: marcherPage1Before!.x,
                            y: marcherPage1Before!.y,
                        });
                    },
                ),
            );
        });
    });

    describe("One shape", () => {
        testWithHistory(
            "should swap two marchers with one belonging to a shape",
            async ({ db, marchersAndPages }) => {
                const marcherIds = (
                    await db.query.marchers.findMany({
                        columns: {
                            id: true,
                        },
                    })
                ).map((m) => m.id);

                const pageId = 0;
                const shapeMarcherIds = marcherIds.slice(
                    0,
                    marcherIds.length / 2,
                );
                const nonShapeMarcherIds = marcherIds.slice(
                    marcherIds.length / 2,
                );

                const [createdShapePage] = await _createMarcherShape({
                    pageId,
                    marcherIds: shapeMarcherIds,
                    start: { x: 0, y: 0 },
                    end: { x: 100, y: 100 },
                });

                const marcherId1 = shapeMarcherIds[0];
                const marcherId2 = nonShapeMarcherIds[0];

                const spm1Before = await db.query.shape_page_marchers.findFirst(
                    {
                        where: and(
                            eq(
                                schema.shape_page_marchers.marcher_id,
                                marcherId1,
                            ),
                            eq(
                                schema.shape_page_marchers.shape_page_id,
                                createdShapePage.id,
                            ),
                        ),
                    },
                );
                const marcherPage1Before =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.marcher_id, marcherId1),
                            eq(schema.marcher_pages.page_id, pageId),
                        ),
                    });
                const spm2Before = await db.query.shape_page_marchers.findFirst(
                    {
                        where: and(
                            eq(
                                schema.shape_page_marchers.marcher_id,
                                marcherId2,
                            ),
                            eq(
                                schema.shape_page_marchers.shape_page_id,
                                createdShapePage.id,
                            ),
                        ),
                    },
                );
                const marcherPage2Before =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.marcher_id, marcherId2),
                            eq(schema.marcher_pages.page_id, pageId),
                        ),
                    });

                expect(spm1Before, `SPM1 before should exist`).toBeTruthy();
                expect(spm2Before, `SPM2 before should not exist`).toBeFalsy();
                expect(
                    marcherPage1Before,
                    `Marcher page 1 before should exist`,
                ).toBeTruthy();
                expect(
                    marcherPage2Before,
                    `Marcher page 2 before should exist`,
                ).toBeTruthy();

                await swapMarchers({
                    db,
                    pageId,
                    marcher1Id: marcherId1,
                    marcher2Id: marcherId2,
                });

                const spm1After = await db.query.shape_page_marchers.findFirst({
                    where: and(
                        eq(schema.shape_page_marchers.marcher_id, marcherId1),
                        eq(
                            schema.shape_page_marchers.shape_page_id,
                            createdShapePage.id,
                        ),
                    ),
                });
                const spm2After = await db.query.shape_page_marchers.findFirst({
                    where: and(
                        eq(schema.shape_page_marchers.marcher_id, marcherId2),
                        eq(
                            schema.shape_page_marchers.shape_page_id,
                            createdShapePage.id,
                        ),
                    ),
                });
                const marcherPage1After =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.marcher_id, marcherId1),
                            eq(schema.marcher_pages.page_id, pageId),
                        ),
                    });
                const marcherPage2After =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.marcher_id, marcherId2),
                            eq(schema.marcher_pages.page_id, pageId),
                        ),
                    });

                expect(spm1After, `SPM1 after should not exist`).toBeFalsy();
                expect(spm2After, `SPM2 after should exist`).toBeTruthy();
                expect(
                    marcherPage1After,
                    `Marcher page 1 after should exist`,
                ).toBeTruthy();
                expect(
                    marcherPage2After,
                    `Marcher page 2 after should exist`,
                ).toBeTruthy();

                expect({
                    x: marcherPage1After!.x,
                    y: marcherPage1After!.y,
                }).toEqual({
                    x: marcherPage2Before!.x,
                    y: marcherPage2Before!.y,
                });
                expect({
                    x: marcherPage2After!.x,
                    y: marcherPage2After!.y,
                }).toEqual({
                    x: marcherPage1Before!.x,
                    y: marcherPage1Before!.y,
                });
            },
        );

        it("should swap any two marchers with one belonging to a shape and the other not", async ({
            db,
            marchersAndPages,
        }) => {
            const marcherIds = (
                await db.query.marchers.findMany({
                    columns: {
                        id: true,
                    },
                })
            ).map((m) => m.id);
            const pageIds = (
                await db.query.pages.findMany({
                    columns: {
                        id: true,
                    },
                })
            ).map((p) => p.id);

            const shapeMarcherIds = marcherIds.slice(0, marcherIds.length / 2);
            const nonShapeMarcherIds = marcherIds.slice(marcherIds.length / 2);

            await fc.assert(
                fc
                    .asyncProperty(
                        fc.record({
                            marcherId1: fc.constantFrom(...shapeMarcherIds),
                            marcherId2: fc.constantFrom(...nonShapeMarcherIds),
                            pageId: fc.constantFrom(...pageIds),
                        }),
                        async ({ marcherId1, marcherId2, pageId }) => {
                            const [createdShapePage] =
                                await _createMarcherShape({
                                    pageId,
                                    marcherIds: shapeMarcherIds,
                                    start: { x: 0, y: 0 },
                                    end: { x: 100, y: 100 },
                                });

                            const spm1Before =
                                await db.query.shape_page_marchers.findFirst({
                                    where: and(
                                        eq(
                                            schema.shape_page_marchers
                                                .marcher_id,
                                            marcherId1,
                                        ),
                                        eq(
                                            schema.shape_page_marchers
                                                .shape_page_id,
                                            createdShapePage.id,
                                        ),
                                    ),
                                });
                            const marcherPage1Before =
                                await db.query.marcher_pages.findFirst({
                                    where: and(
                                        eq(
                                            schema.marcher_pages.marcher_id,
                                            marcherId1,
                                        ),
                                        eq(
                                            schema.marcher_pages.page_id,
                                            pageId,
                                        ),
                                    ),
                                });
                            const spm2Before =
                                await db.query.shape_page_marchers.findFirst({
                                    where: and(
                                        eq(
                                            schema.shape_page_marchers
                                                .marcher_id,
                                            marcherId2,
                                        ),
                                        eq(
                                            schema.shape_page_marchers
                                                .shape_page_id,
                                            createdShapePage.id,
                                        ),
                                    ),
                                });
                            const marcherPage2Before =
                                await db.query.marcher_pages.findFirst({
                                    where: and(
                                        eq(
                                            schema.marcher_pages.marcher_id,
                                            marcherId2,
                                        ),
                                        eq(
                                            schema.marcher_pages.page_id,
                                            pageId,
                                        ),
                                    ),
                                });

                            expect(
                                spm1Before,
                                `SPM1 before should exist`,
                            ).toBeTruthy();
                            expect(
                                spm2Before?.id,
                                `SPM2 before should not exist`,
                            ).toBeFalsy();
                            expect(
                                marcherPage1Before,
                                `Marcher page 1 before should exist`,
                            ).toBeTruthy();
                            expect(
                                marcherPage2Before,
                                `Marcher page 2 before should exist`,
                            ).toBeTruthy();

                            await swapMarchers({
                                db,
                                pageId,
                                marcher1Id: marcherId1,
                                marcher2Id: marcherId2,
                            });

                            const spm1After =
                                await db.query.shape_page_marchers.findFirst({
                                    where: and(
                                        eq(
                                            schema.shape_page_marchers
                                                .marcher_id,
                                            marcherId1,
                                        ),
                                        eq(
                                            schema.shape_page_marchers
                                                .shape_page_id,
                                            createdShapePage.id,
                                        ),
                                    ),
                                });
                            const spm2After =
                                await db.query.shape_page_marchers.findFirst({
                                    where: and(
                                        eq(
                                            schema.shape_page_marchers
                                                .marcher_id,
                                            marcherId2,
                                        ),
                                        eq(
                                            schema.shape_page_marchers
                                                .shape_page_id,
                                            createdShapePage.id,
                                        ),
                                    ),
                                });
                            const marcherPage1After =
                                await db.query.marcher_pages.findFirst({
                                    where: and(
                                        eq(
                                            schema.marcher_pages.marcher_id,
                                            marcherId1,
                                        ),
                                        eq(
                                            schema.marcher_pages.page_id,
                                            pageId,
                                        ),
                                    ),
                                });
                            const marcherPage2After =
                                await db.query.marcher_pages.findFirst({
                                    where: and(
                                        eq(
                                            schema.marcher_pages.marcher_id,
                                            marcherId2,
                                        ),
                                        eq(
                                            schema.marcher_pages.page_id,
                                            pageId,
                                        ),
                                    ),
                                });

                            expect(
                                spm1After?.id,
                                `SPM1 after should not exist`,
                            ).toBeFalsy();
                            expect(
                                spm2After,
                                `SPM2 after should exist`,
                            ).toBeTruthy();
                            expect(
                                marcherPage1After,
                                `Marcher page 1 after should exist`,
                            ).toBeTruthy();
                            expect(
                                marcherPage2After,
                                `Marcher page 2 after should exist`,
                            ).toBeTruthy();

                            expect({
                                x: marcherPage1After!.x,
                                y: marcherPage1After!.y,
                            }).toEqual({
                                x: marcherPage2Before!.x,
                                y: marcherPage2Before!.y,
                            });
                            expect({
                                x: marcherPage2After!.x,
                                y: marcherPage2After!.y,
                            }).toEqual({
                                x: marcherPage1Before!.x,
                                y: marcherPage1Before!.y,
                            });
                        },
                    )
                    .afterEach(async () => {
                        await db.delete(schema.shape_pages).run();
                        await db.delete(schema.shape_page_marchers).run();
                        await db.delete(schema.shapes).run();
                    }),
            );
        });

        testWithHistory(
            "should swap two marchers with both belonging to the same shape",
            async ({ db, marchersAndPages }) => {
                const marcherIds = (
                    await db.query.marchers.findMany({
                        columns: {
                            id: true,
                        },
                    })
                ).map((m) => m.id);

                const pageId = 0;

                const [createdShapePage] = await _createMarcherShape({
                    pageId,
                    marcherIds,
                    start: { x: 0, y: 0 },
                    end: { x: 100, y: 100 },
                });

                const marcherId1 = marcherIds[0];
                const marcherId2 = marcherIds[1];

                const spm1Before = await db.query.shape_page_marchers.findFirst(
                    {
                        where: and(
                            eq(
                                schema.shape_page_marchers.marcher_id,
                                marcherId1,
                            ),
                            eq(
                                schema.shape_page_marchers.shape_page_id,
                                createdShapePage.id,
                            ),
                        ),
                    },
                );
                const marcherPage1Before =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.marcher_id, marcherId1),
                            eq(schema.marcher_pages.page_id, pageId),
                        ),
                    });
                const spm2Before = await db.query.shape_page_marchers.findFirst(
                    {
                        where: and(
                            eq(
                                schema.shape_page_marchers.marcher_id,
                                marcherId2,
                            ),
                            eq(
                                schema.shape_page_marchers.shape_page_id,
                                createdShapePage.id,
                            ),
                        ),
                    },
                );
                const marcherPage2Before =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.marcher_id, marcherId2),
                            eq(schema.marcher_pages.page_id, pageId),
                        ),
                    });

                expect(spm1Before, `SPM1 before should exist`).toBeTruthy();
                expect(spm1Before!.marcher_id).toEqual(marcherId1);
                expect(spm2Before, `SPM2 before should exist`).toBeTruthy();
                expect(spm2Before!.marcher_id).toEqual(marcherId2);
                expect(
                    marcherPage1Before,
                    `Marcher page 1 before should exist`,
                ).toBeTruthy();
                expect(
                    marcherPage2Before,
                    `Marcher page 2 before should exist`,
                ).toBeTruthy();

                await swapMarchers({
                    db,
                    pageId,
                    marcher1Id: marcherId1,
                    marcher2Id: marcherId2,
                });

                const spm1After = await db.query.shape_page_marchers.findFirst({
                    where: eq(schema.shape_page_marchers.id, spm1Before!.id),
                });
                const spm2After = await db.query.shape_page_marchers.findFirst({
                    where: eq(schema.shape_page_marchers.id, spm2Before!.id),
                });
                const marcherPage1After =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.marcher_id, marcherId1),
                            eq(schema.marcher_pages.page_id, pageId),
                        ),
                    });
                const marcherPage2After =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.marcher_id, marcherId2),
                            eq(schema.marcher_pages.page_id, pageId),
                        ),
                    });

                expect(spm1After, `SPM1 after should exist`).toBeTruthy();
                expect(spm1After!.marcher_id).toEqual(marcherId2);
                expect(spm1After!.shape_page_id).toEqual(
                    spm1Before!.shape_page_id,
                );
                expect(spm2After, `SPM2 after should exist`).toBeTruthy();
                expect(spm2After!.marcher_id).toEqual(marcherId1);
                expect(spm2After!.shape_page_id).toEqual(
                    spm2Before!.shape_page_id,
                );
                expect(
                    marcherPage1After,
                    `Marcher page 1 after should exist`,
                ).toBeTruthy();
                expect(
                    marcherPage2After,
                    `Marcher page 2 after should exist`,
                ).toBeTruthy();

                expect({
                    x: marcherPage1After!.x,
                    y: marcherPage1After!.y,
                }).toEqual({
                    x: marcherPage2Before!.x,
                    y: marcherPage2Before!.y,
                });
                expect({
                    x: marcherPage2After!.x,
                    y: marcherPage2After!.y,
                }).toEqual({
                    x: marcherPage1Before!.x,
                    y: marcherPage1Before!.y,
                });
            },
        );

        it("should swap any two marchers with both belonging to the same shape", async ({
            db,
            marchersAndPages,
        }) => {
            const marcherIds = (
                await db.query.marchers.findMany({
                    columns: {
                        id: true,
                    },
                })
            ).map((m) => m.id);
            const pageIds = (
                await db.query.pages.findMany({
                    columns: {
                        id: true,
                    },
                })
            ).map((p) => p.id);

            await fc.assert(
                fc
                    .asyncProperty(
                        fc.record({
                            marcherIdsToSwap: fc.uniqueArray(
                                fc.constantFrom(...marcherIds),
                                { minLength: 2, maxLength: 2 },
                            ),
                            pageId: fc.constantFrom(...pageIds),
                        }),
                        async ({ marcherIdsToSwap, pageId }) => {
                            const marcherId1 = marcherIdsToSwap[0];
                            const marcherId2 = marcherIdsToSwap[1];
                            const [createdShapePage] =
                                await _createMarcherShape({
                                    pageId,
                                    marcherIds,
                                    start: { x: 0, y: 0 },
                                    end: { x: 100, y: 100 },
                                });

                            const spm1Before =
                                await db.query.shape_page_marchers.findFirst({
                                    where: and(
                                        eq(
                                            schema.shape_page_marchers
                                                .marcher_id,
                                            marcherId1,
                                        ),
                                        eq(
                                            schema.shape_page_marchers
                                                .shape_page_id,
                                            createdShapePage.id,
                                        ),
                                    ),
                                });
                            const marcherPage1Before =
                                await db.query.marcher_pages.findFirst({
                                    where: and(
                                        eq(
                                            schema.marcher_pages.marcher_id,
                                            marcherId1,
                                        ),
                                        eq(
                                            schema.marcher_pages.page_id,
                                            pageId,
                                        ),
                                    ),
                                });
                            const spm2Before =
                                await db.query.shape_page_marchers.findFirst({
                                    where: and(
                                        eq(
                                            schema.shape_page_marchers
                                                .marcher_id,
                                            marcherId2,
                                        ),
                                        eq(
                                            schema.shape_page_marchers
                                                .shape_page_id,
                                            createdShapePage.id,
                                        ),
                                    ),
                                });
                            const marcherPage2Before =
                                await db.query.marcher_pages.findFirst({
                                    where: and(
                                        eq(
                                            schema.marcher_pages.marcher_id,
                                            marcherId2,
                                        ),
                                        eq(
                                            schema.marcher_pages.page_id,
                                            pageId,
                                        ),
                                    ),
                                });

                            expect(
                                spm1Before,
                                `SPM1 before should exist`,
                            ).toBeTruthy();
                            expect(spm1Before!.marcher_id).toEqual(marcherId1);
                            expect(spm1Before!.shape_page_id).toEqual(
                                createdShapePage.id,
                            );
                            expect(
                                spm2Before,
                                `SPM2 before should exist`,
                            ).toBeTruthy();
                            expect(spm2Before!.marcher_id).toEqual(marcherId2);
                            expect(spm2Before!.shape_page_id).toEqual(
                                createdShapePage.id,
                            );
                            expect(
                                marcherPage1Before,
                                `Marcher page 1 before should exist`,
                            ).toBeTruthy();
                            expect(
                                marcherPage2Before,
                                `Marcher page 2 before should exist`,
                            ).toBeTruthy();

                            await swapMarchers({
                                db,
                                pageId,
                                marcher1Id: marcherId1,
                                marcher2Id: marcherId2,
                            });

                            const spm1After =
                                await db.query.shape_page_marchers.findFirst({
                                    where: eq(
                                        schema.shape_page_marchers.id,
                                        spm1Before!.id,
                                    ),
                                });
                            const spm2After =
                                await db.query.shape_page_marchers.findFirst({
                                    where: eq(
                                        schema.shape_page_marchers.id,
                                        spm2Before!.id,
                                    ),
                                });
                            const marcherPage1After =
                                await db.query.marcher_pages.findFirst({
                                    where: and(
                                        eq(
                                            schema.marcher_pages.marcher_id,
                                            marcherId1,
                                        ),
                                        eq(
                                            schema.marcher_pages.page_id,
                                            pageId,
                                        ),
                                    ),
                                });
                            const marcherPage2After =
                                await db.query.marcher_pages.findFirst({
                                    where: and(
                                        eq(
                                            schema.marcher_pages.marcher_id,
                                            marcherId2,
                                        ),
                                        eq(
                                            schema.marcher_pages.page_id,
                                            pageId,
                                        ),
                                    ),
                                });

                            expect(
                                spm1After,
                                `SPM1 after should exist`,
                            ).toBeTruthy();
                            expect(spm1After!.marcher_id).toEqual(marcherId2);
                            expect(spm1After!.shape_page_id).toEqual(
                                createdShapePage.id,
                            );
                            expect(
                                spm2After,
                                `SPM2 after should exist`,
                            ).toBeTruthy();
                            expect(spm2After!.marcher_id).toEqual(marcherId1);
                            expect(spm2After!.shape_page_id).toEqual(
                                createdShapePage.id,
                            );
                            expect(
                                marcherPage1After,
                                `Marcher page 1 after should exist`,
                            ).toBeTruthy();
                            expect(
                                marcherPage2After,
                                `Marcher page 2 after should exist`,
                            ).toBeTruthy();

                            expect({
                                x: marcherPage1After!.x,
                                y: marcherPage1After!.y,
                            }).toEqual({
                                x: marcherPage2Before!.x,
                                y: marcherPage2Before!.y,
                            });
                            expect({
                                x: marcherPage2After!.x,
                                y: marcherPage2After!.y,
                            }).toEqual({
                                x: marcherPage1Before!.x,
                                y: marcherPage1Before!.y,
                            });
                        },
                    )
                    .afterEach(async () => {
                        await db.delete(schema.shape_pages).run();
                        await db.delete(schema.shape_page_marchers).run();
                        await db.delete(schema.shapes).run();
                    }),
            );
        });
    });

    describe("two shapes", () => {
        testWithHistory(
            "should swap two marchers with both belonging to a shape",
            async ({ db, marchersAndPages }) => {
                const marcherIds = (
                    await db.query.marchers.findMany({
                        columns: {
                            id: true,
                        },
                    })
                ).map((m) => m.id);

                const pageId = 0;
                const shape1MarcherIds = marcherIds.slice(
                    0,
                    marcherIds.length / 2,
                );
                const shape2MarcherIds = marcherIds.slice(
                    marcherIds.length / 2,
                );

                const [createdShapePage1] = await _createMarcherShape({
                    pageId,
                    marcherIds: shape1MarcherIds,
                    start: { x: 0, y: 0 },
                    end: { x: 100, y: 100 },
                });
                const [createdShapePage2] = await _createMarcherShape({
                    pageId,
                    marcherIds: shape2MarcherIds,
                    start: { x: 0, y: 0 },
                    end: { x: 200, y: 200 },
                });

                const marcherId1 = shape1MarcherIds[0];
                const marcherId2 = shape2MarcherIds[0];

                const spm1Before = await db.query.shape_page_marchers.findFirst(
                    {
                        where: and(
                            eq(
                                schema.shape_page_marchers.marcher_id,
                                marcherId1,
                            ),
                            eq(
                                schema.shape_page_marchers.shape_page_id,
                                createdShapePage1.id,
                            ),
                        ),
                    },
                );
                const marcherPage1Before =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.marcher_id, marcherId1),
                            eq(schema.marcher_pages.page_id, pageId),
                        ),
                    });
                const spm2Before = await db.query.shape_page_marchers.findFirst(
                    {
                        where: and(
                            eq(
                                schema.shape_page_marchers.marcher_id,
                                marcherId2,
                            ),
                            eq(
                                schema.shape_page_marchers.shape_page_id,
                                createdShapePage2.id,
                            ),
                        ),
                    },
                );
                const marcherPage2Before =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.marcher_id, marcherId2),
                            eq(schema.marcher_pages.page_id, pageId),
                        ),
                    });

                expect(spm1Before, `SPM1 before should exist`).toBeTruthy();
                expect(spm1Before!.marcher_id).toEqual(marcherId1);
                expect(spm2Before, `SPM2 before should exist`).toBeTruthy();
                expect(spm2Before!.marcher_id).toEqual(marcherId2);
                expect(
                    marcherPage1Before,
                    `Marcher page 1 before should exist`,
                ).toBeTruthy();
                expect(
                    marcherPage2Before,
                    `Marcher page 2 before should exist`,
                ).toBeTruthy();

                await swapMarchers({
                    db,
                    pageId,
                    marcher1Id: marcherId1,
                    marcher2Id: marcherId2,
                });

                const spm1After = await db.query.shape_page_marchers.findFirst({
                    where: eq(schema.shape_page_marchers.id, spm1Before!.id),
                });
                const spm2After = await db.query.shape_page_marchers.findFirst({
                    where: eq(schema.shape_page_marchers.id, spm2Before!.id),
                });
                const marcherPage1After =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.marcher_id, marcherId1),
                            eq(schema.marcher_pages.page_id, pageId),
                        ),
                    });
                const marcherPage2After =
                    await db.query.marcher_pages.findFirst({
                        where: and(
                            eq(schema.marcher_pages.marcher_id, marcherId2),
                            eq(schema.marcher_pages.page_id, pageId),
                        ),
                    });

                expect(spm1After, `SPM1 after should exist`).toBeTruthy();
                expect(spm1After!.marcher_id).toEqual(marcherId2);
                expect(spm1After!.shape_page_id).toEqual(
                    spm1Before!.shape_page_id,
                );
                expect(spm2After, `SPM2 after should exist`).toBeTruthy();
                expect(spm2After!.marcher_id).toEqual(marcherId1);
                expect(spm2After!.shape_page_id).toEqual(
                    spm2Before!.shape_page_id,
                );
                expect(
                    marcherPage1After,
                    `Marcher page 1 after should exist`,
                ).toBeTruthy();
                expect(
                    marcherPage2After,
                    `Marcher page 2 after should exist`,
                ).toBeTruthy();

                expect({
                    x: marcherPage1After!.x,
                    y: marcherPage1After!.y,
                }).toEqual({
                    x: marcherPage2Before!.x,
                    y: marcherPage2Before!.y,
                });
                expect({
                    x: marcherPage2After!.x,
                    y: marcherPage2After!.y,
                }).toEqual({
                    x: marcherPage1Before!.x,
                    y: marcherPage1Before!.y,
                });
            },
        );

        it("should swap any two marchers with both belonging to a shape", async ({
            db,
            marchersAndPages,
        }) => {
            const marcherIds = (
                await db.query.marchers.findMany({
                    columns: {
                        id: true,
                    },
                })
            ).map((m) => m.id);
            const pageIds = (
                await db.query.pages.findMany({
                    columns: {
                        id: true,
                    },
                })
            ).map((p) => p.id);

            const shape1MarcherIds = marcherIds.slice(0, marcherIds.length / 2);
            const shape2MarcherIds = marcherIds.slice(marcherIds.length / 2);

            await fc.assert(
                fc
                    .asyncProperty(
                        fc.record({
                            marcherId1: fc.constantFrom(...shape1MarcherIds),
                            marcherId2: fc.constantFrom(...shape2MarcherIds),
                            pageId: fc.constantFrom(...pageIds),
                        }),
                        async ({ marcherId1, marcherId2, pageId }) => {
                            const [createdShapePage1] =
                                await _createMarcherShape({
                                    pageId,
                                    marcherIds: shape1MarcherIds,
                                    start: { x: 0, y: 0 },
                                    end: { x: 100, y: 100 },
                                });
                            const [createdShapePage2] =
                                await _createMarcherShape({
                                    pageId,
                                    marcherIds: shape2MarcherIds,
                                    start: { x: 300, y: 300 },
                                    end: { x: 200, y: 200 },
                                });

                            const spm1Before =
                                await db.query.shape_page_marchers.findFirst({
                                    where: and(
                                        eq(
                                            schema.shape_page_marchers
                                                .marcher_id,
                                            marcherId1,
                                        ),
                                        eq(
                                            schema.shape_page_marchers
                                                .shape_page_id,
                                            createdShapePage1.id,
                                        ),
                                    ),
                                });
                            const marcherPage1Before =
                                await db.query.marcher_pages.findFirst({
                                    where: and(
                                        eq(
                                            schema.marcher_pages.marcher_id,
                                            marcherId1,
                                        ),
                                        eq(
                                            schema.marcher_pages.page_id,
                                            pageId,
                                        ),
                                    ),
                                });
                            const spm2Before =
                                await db.query.shape_page_marchers.findFirst({
                                    where: and(
                                        eq(
                                            schema.shape_page_marchers
                                                .marcher_id,
                                            marcherId2,
                                        ),
                                        eq(
                                            schema.shape_page_marchers
                                                .shape_page_id,
                                            createdShapePage2.id,
                                        ),
                                    ),
                                });
                            const marcherPage2Before =
                                await db.query.marcher_pages.findFirst({
                                    where: and(
                                        eq(
                                            schema.marcher_pages.marcher_id,
                                            marcherId2,
                                        ),
                                        eq(
                                            schema.marcher_pages.page_id,
                                            pageId,
                                        ),
                                    ),
                                });

                            expect(
                                spm1Before,
                                `SPM1 before should exist`,
                            ).toBeTruthy();
                            expect(spm1Before!.marcher_id).toEqual(marcherId1);
                            expect(spm1Before!.shape_page_id).toEqual(
                                createdShapePage1.id,
                            );
                            expect(
                                spm2Before,
                                `SPM2 before should exist`,
                            ).toBeTruthy();
                            expect(spm2Before!.marcher_id).toEqual(marcherId2);
                            expect(spm2Before!.shape_page_id).toEqual(
                                createdShapePage2.id,
                            );
                            expect(
                                marcherPage1Before,
                                `Marcher page 1 before should exist`,
                            ).toBeTruthy();
                            expect(
                                marcherPage2Before,
                                `Marcher page 2 before should exist`,
                            ).toBeTruthy();

                            await swapMarchers({
                                db,
                                pageId,
                                marcher1Id: marcherId1,
                                marcher2Id: marcherId2,
                            });

                            const spm1After =
                                await db.query.shape_page_marchers.findFirst({
                                    where: eq(
                                        schema.shape_page_marchers.id,
                                        spm1Before!.id,
                                    ),
                                });
                            const spm2After =
                                await db.query.shape_page_marchers.findFirst({
                                    where: eq(
                                        schema.shape_page_marchers.id,
                                        spm2Before!.id,
                                    ),
                                });
                            const marcherPage1After =
                                await db.query.marcher_pages.findFirst({
                                    where: and(
                                        eq(
                                            schema.marcher_pages.marcher_id,
                                            marcherId1,
                                        ),
                                        eq(
                                            schema.marcher_pages.page_id,
                                            pageId,
                                        ),
                                    ),
                                });
                            const marcherPage2After =
                                await db.query.marcher_pages.findFirst({
                                    where: and(
                                        eq(
                                            schema.marcher_pages.marcher_id,
                                            marcherId2,
                                        ),
                                        eq(
                                            schema.marcher_pages.page_id,
                                            pageId,
                                        ),
                                    ),
                                });

                            expect(
                                spm1After,
                                `SPM1 after should exist`,
                            ).toBeTruthy();
                            expect(spm1After!.marcher_id).toEqual(marcherId2);
                            expect(spm1After!.shape_page_id).toEqual(
                                createdShapePage1.id,
                            );
                            expect(
                                spm2After,
                                `SPM2 after should exist`,
                            ).toBeTruthy();
                            expect(spm2After!.marcher_id).toEqual(marcherId1);
                            expect(spm2After!.shape_page_id).toEqual(
                                createdShapePage2.id,
                            );
                            expect(
                                marcherPage1After,
                                `Marcher page 1 after should exist`,
                            ).toBeTruthy();
                            expect(
                                marcherPage2After,
                                `Marcher page 2 after should exist`,
                            ).toBeTruthy();

                            expect({
                                x: marcherPage1After!.x,
                                y: marcherPage1After!.y,
                            }).toEqual({
                                x: marcherPage2Before!.x,
                                y: marcherPage2Before!.y,
                            });
                            expect({
                                x: marcherPage2After!.x,
                                y: marcherPage2After!.y,
                            }).toEqual({
                                x: marcherPage1Before!.x,
                                y: marcherPage1Before!.y,
                            });
                        },
                    )
                    .afterEach(async () => {
                        await db.delete(schema.shape_pages).run();
                        await db.delete(schema.shape_page_marchers).run();
                        await db.delete(schema.shapes).run();
                    }),
            );
        });
    });
});
