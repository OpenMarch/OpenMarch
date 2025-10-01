import { describeDbTests, schema, transaction } from "@/test/base";
import { afterEach, describe, expect, it } from "vitest";
import {
    DatabaseMarcherPage,
    getAllMarcherPages,
    getNextMarcherPage,
    getPreviousMarcherPage,
    lockedDecorator,
    marcherPagesByPageId,
} from "../marcherPage";
import { and, eq, inArray } from "drizzle-orm";
import {
    createShapePages,
    DatabaseShapePageMarcher,
    DbConnection,
    ShapePageMarcher,
} from "..";
import { faker } from "@faker-js/faker";
import MarcherPage from "@/global/classes/MarcherPage";

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
                        expect(marcherPage!.isLocked).toBe(true);
                        expect(marcherPage!.lockedReason).toContain("shape");
                    } else {
                        expect(marcherPage!.isLocked).toBe(false);
                        expect(marcherPage!.lockedReason).toBe("");
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
                            expect(marcherPage!.isLocked).toBe(true);
                            expect(marcherPage!.lockedReason).toContain(
                                "shape",
                            );
                        } else {
                            expect(marcherPage!.isLocked).toBe(false);
                            expect(marcherPage!.lockedReason).toBe("");
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
    const createMockMarcherPage = (
        overrides: Partial<DatabaseMarcherPage> = {},
    ): DatabaseMarcherPage => ({
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
        ...overrides,
    });

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
