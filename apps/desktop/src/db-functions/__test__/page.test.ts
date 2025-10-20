import { assert, describe, expect } from "vitest";
import {
    createPages,
    updatePages,
    deletePages,
    FIRST_PAGE_ID,
    createLastPage,
    DatabasePage,
    _fillAndGetBeatToStartOn,
    getPages,
    getLastPage,
    getNextBeatToStartPageOn,
    createTempoGroupAndPageFromWorkspaceSettings,
    NewPageArgs,
    updateLastPageCounts,
} from "../page";
import { describeDbTests, schema, transaction } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { inArray, desc, eq, and, gte, lte, asc } from "drizzle-orm";
import {
    FIRST_BEAT_ID,
    NewBeatArgs,
    createBeats,
    createBeatsInTransaction,
    getBeats,
} from "../beat";
import { faker } from "@faker-js/faker";
import { WorkspaceSettings } from "@/settings/workspaceSettings";
import { getMeasures } from "../measures";
import { DbTransaction } from "../types";

const subsetBooleanToInteger = (page: any) => {
    return { ...page, is_subset: page.is_subset ? 1 : 0 };
};

const addFirstPage = (
    pages: any,
): Omit<DatabasePage, "updated_at" | "created_at">[] => {
    return [
        {
            id: FIRST_PAGE_ID,
            start_beat: FIRST_BEAT_ID,
            is_subset: 0 as any,
            notes: null,
        },
        ...pages,
    ];
};

describeDbTests("pages", (it) => {
    const testWithHistory = getTestWithHistory(it, [
        schema.pages,
        schema.beats,
        schema.marchers,
        schema.marcher_pages,
        schema.utility,
    ]);

    describe("createPages", () => {
        describe("insert with no existing pages", () => {
            describe.each([
                {
                    description: "Single page",
                    newPages: [
                        {
                            is_subset: false,
                            notes: null,
                            start_beat: 1,
                        },
                    ],
                },
                {
                    description: "Single subset page",
                    newPages: [
                        {
                            is_subset: true,
                            notes: null,
                            start_beat: 1,
                        },
                    ],
                },
                {
                    description: "Single page with notes",
                    newPages: [
                        {
                            is_subset: false,
                            notes: "jeff notes",
                            start_beat: 1,
                        },
                    ],
                },
                {
                    description: "Two pages",
                    newPages: [
                        {
                            is_subset: false,
                            notes: null,
                            start_beat: 1,
                        },
                        {
                            is_subset: true,
                            notes: null,
                            start_beat: 2,
                        },
                    ],
                },
                {
                    description: "Many pages",
                    newPages: [
                        {
                            is_subset: false,
                            notes: null,
                            start_beat: 1,
                        },
                        {
                            is_subset: true,
                            notes: null,
                            start_beat: 4,
                        },
                        {
                            is_subset: false,
                            notes: "jeff notes",
                            start_beat: 2,
                        },
                        {
                            is_subset: true,
                            notes: null,
                            start_beat: 7,
                        },
                        {
                            is_subset: true,
                            notes: null,
                            start_beat: 15,
                        },
                        {
                            is_subset: false,
                            notes: null,
                            start_beat: 8,
                        },
                    ],
                },
            ])(
                "%# successfully create atomic pages - $description",
                ({ newPages }) => {
                    testWithHistory(
                        "Create pages as one action",
                        async ({ db, beats, expectNumberOfChanges }) => {
                            const expectedCreatedPages = newPages.map(
                                (newPage, index) => ({
                                    ...newPage,
                                    id: index + 1,
                                }),
                            );

                            const result = await createPages({
                                newPages,
                                db,
                            });
                            expect(new Set(result)).toMatchObject(
                                new Set(expectedCreatedPages),
                            );

                            const allPages = await db.query.pages.findMany();
                            expect(allPages.length).toEqual(
                                expectedCreatedPages.length + 1,
                            );
                            expect(new Set(allPages)).toMatchObject(
                                new Set(
                                    addFirstPage(
                                        expectedCreatedPages.map(
                                            subsetBooleanToInteger,
                                        ),
                                    ),
                                ),
                            );
                            await expectNumberOfChanges.test(db, 1);
                        },
                    );

                    testWithHistory(
                        "Create pages as many actions",
                        async ({ db, beats, expectNumberOfChanges }) => {
                            const expectedCreatedPages = newPages.map(
                                (newPage, index) => ({
                                    ...newPage,
                                    id: index + 1,
                                }),
                            );

                            for (const newPage of newPages) {
                                await createPages({
                                    newPages: [newPage],
                                    db,
                                });
                            }

                            const allPages = await db.query.pages.findMany();
                            expect(allPages.length).toEqual(
                                expectedCreatedPages.length + 1,
                            );
                            expect(new Set(allPages)).toMatchObject(
                                new Set(
                                    addFirstPage(
                                        expectedCreatedPages.map(
                                            subsetBooleanToInteger,
                                        ),
                                    ),
                                ),
                            );
                            // Expect that each page creation is a separate change on the undo stack
                            await expectNumberOfChanges.test(
                                db,
                                newPages.length,
                            );
                        },
                    );
                },
            );
        });

        describe("insert with existing pages", () => {
            testWithHistory.for([
                {
                    description: "Single page",
                    existingPagesArgs: [
                        {
                            start_beat: 1,
                            is_subset: false,
                        },
                    ],
                    newPagesArgs: [
                        {
                            start_beat: 2,
                            is_subset: false,
                        },
                    ],
                },
                {
                    description: "insert single at end",
                    existingPagesArgs: [
                        {
                            start_beat: 1,
                            is_subset: false,
                        },
                        {
                            start_beat: 2,
                            is_subset: false,
                        },
                        {
                            start_beat: 4,
                            is_subset: false,
                        },
                    ],
                    newPagesArgs: [
                        {
                            start_beat: 5,
                            is_subset: false,
                        },
                    ],
                },
                {
                    description:
                        "Many existing pages, insert single at beginning",
                    existingPagesArgs: [
                        {
                            start_beat: 4,
                            is_subset: false,
                        },
                        {
                            start_beat: 6,
                            is_subset: false,
                        },
                        {
                            start_beat: 3,
                            is_subset: false,
                        },
                    ],
                    newPagesArgs: [
                        {
                            start_beat: 1,
                            is_subset: false,
                        },
                    ],
                },
                {
                    description: "insert single in middle",
                    existingPagesArgs: [
                        {
                            start_beat: 4,
                            is_subset: false,
                        },
                        {
                            start_beat: 6,
                            is_subset: false,
                        },
                        {
                            start_beat: 3,
                            is_subset: false,
                        },
                        {
                            start_beat: 7,
                            is_subset: false,
                        },
                    ],
                    newPagesArgs: [
                        {
                            start_beat: 5,
                            is_subset: false,
                        },
                    ],
                },
                {
                    description:
                        "Many existing pages, insert multiple at beginning",
                    existingPagesArgs: [
                        {
                            start_beat: 5,
                            is_subset: false,
                        },
                        {
                            start_beat: 7,
                            is_subset: false,
                        },
                        {
                            start_beat: 9,
                            is_subset: false,
                        },
                        {
                            start_beat: 11,
                            is_subset: false,
                        },
                    ],
                    newPagesArgs: [
                        {
                            start_beat: 1,
                            is_subset: false,
                        },
                        {
                            start_beat: 3,
                            is_subset: false,
                        },
                    ],
                },
                {
                    description: "insert multiple at end",
                    existingPagesArgs: [
                        {
                            start_beat: 1,
                            is_subset: false,
                        },
                        {
                            start_beat: 3,
                            is_subset: false,
                        },
                        {
                            start_beat: 5,
                            is_subset: false,
                        },
                        {
                            start_beat: 7,
                            is_subset: false,
                        },
                    ],
                    newPagesArgs: [
                        {
                            start_beat: 9,
                            is_subset: false,
                        },
                        {
                            start_beat: 11,
                            is_subset: false,
                        },
                        {
                            start_beat: 13,
                            is_subset: false,
                        },
                    ],
                },
                {
                    description:
                        "Many existing pages, insert multiple in middle",
                    existingPagesArgs: [
                        {
                            start_beat: 1,
                            is_subset: false,
                        },
                        {
                            start_beat: 3,
                            is_subset: false,
                        },
                        {
                            start_beat: 9,
                            is_subset: false,
                        },
                        {
                            start_beat: 11,
                            is_subset: false,
                        },
                        {
                            start_beat: 13,
                            is_subset: false,
                        },
                    ],
                    newPagesArgs: [
                        {
                            start_beat: 5,
                            is_subset: false,
                        },
                        {
                            start_beat: 7,
                            is_subset: false,
                        },
                    ],
                },
                {
                    description:
                        "Many existing pages, insert multiple scattered positions",
                    existingPagesArgs: [
                        {
                            start_beat: 2,
                            is_subset: false,
                        },
                        {
                            start_beat: 6,
                            is_subset: false,
                        },
                        {
                            start_beat: 10,
                            is_subset: false,
                        },
                        {
                            start_beat: 14,
                            is_subset: false,
                        },
                    ],
                    newPagesArgs: [
                        {
                            start_beat: 1,
                            is_subset: false,
                        },
                        {
                            start_beat: 4,
                            is_subset: false,
                        },
                        {
                            start_beat: 8,
                            is_subset: false,
                        },
                        {
                            start_beat: 12,
                            is_subset: false,
                        },
                        {
                            start_beat: 16,
                            is_subset: false,
                        },
                    ],
                },
                {
                    description:
                        "Complex scenario: many existing pages, insert many at beginning",
                    existingPagesArgs: [
                        {
                            start_beat: 10,
                            is_subset: false,
                        },
                        {
                            start_beat: 12,
                            is_subset: false,
                        },
                        {
                            start_beat: 14,
                            is_subset: false,
                        },
                        {
                            start_beat: 16,
                            is_subset: false,
                        },
                        {
                            start_beat: 18,
                            is_subset: false,
                        },
                        {
                            start_beat: 20,
                            is_subset: false,
                        },
                    ],
                    newPagesArgs: [
                        {
                            start_beat: 1,
                            is_subset: false,
                        },
                        {
                            start_beat: 3,
                            is_subset: false,
                        },
                        {
                            start_beat: 5,
                            is_subset: false,
                        },
                        {
                            start_beat: 7,
                            is_subset: false,
                        },
                    ],
                },
                {
                    description:
                        "Complex scenario: many existing pages, insert many at end",
                    existingPagesArgs: [
                        {
                            start_beat: 1,
                            is_subset: false,
                        },
                        {
                            start_beat: 3,
                            is_subset: false,
                        },
                        {
                            start_beat: 5,
                            is_subset: false,
                        },
                        {
                            start_beat: 7,
                            is_subset: false,
                        },
                        {
                            start_beat: 9,
                            is_subset: false,
                        },
                        {
                            start_beat: 11,
                            is_subset: false,
                        },
                    ],
                    newPagesArgs: [
                        {
                            start_beat: 13,
                            is_subset: false,
                        },
                        {
                            start_beat: 15,
                            is_subset: false,
                        },
                        {
                            start_beat: 17,
                            is_subset: false,
                        },
                        {
                            start_beat: 19,
                            is_subset: false,
                        },
                        {
                            start_beat: 21,
                            is_subset: false,
                        },
                    ],
                },
                {
                    description:
                        "Complex scenario: many existing pages, insert many in middle",
                    existingPagesArgs: [
                        {
                            start_beat: 1,
                            is_subset: false,
                        },
                        {
                            start_beat: 3,
                            is_subset: false,
                        },
                        {
                            start_beat: 15,
                            is_subset: false,
                        },
                        {
                            start_beat: 17,
                            is_subset: false,
                        },
                        {
                            start_beat: 19,
                            is_subset: false,
                        },
                        {
                            start_beat: 21,
                            is_subset: false,
                        },
                    ],
                    newPagesArgs: [
                        {
                            start_beat: 5,
                            is_subset: false,
                        },
                        {
                            start_beat: 7,
                            is_subset: false,
                        },
                        {
                            start_beat: 9,
                            is_subset: false,
                        },
                        {
                            start_beat: 11,
                            is_subset: false,
                        },
                        {
                            start_beat: 13,
                            is_subset: false,
                        },
                    ],
                },
            ])(
                "%# - $description",
                async (
                    { existingPagesArgs, newPagesArgs },
                    { db, beats, expectNumberOfChanges },
                ) => {
                    const createdExistingPages = await createPages({
                        newPages: existingPagesArgs,
                        db,
                    });
                    const existingPages = await db.query.pages.findMany();
                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    const sortByBeat = (
                        a: { start_beat: number },
                        b: { start_beat: number },
                    ) => a.start_beat - b.start_beat;
                    expect(existingPages.sort(sortByBeat)).toMatchObject(
                        addFirstPage(existingPagesArgs)
                            .map(subsetBooleanToInteger)
                            .sort(sortByBeat),
                    );
                    expect(createdExistingPages.sort(sortByBeat)).toMatchObject(
                        existingPagesArgs.sort(sortByBeat),
                    );

                    const createdNewPages = await createPages({
                        newPages: newPagesArgs,
                        db,
                    });
                    const allPages = await db.query.pages.findMany();
                    expect(allPages.sort(sortByBeat)).toMatchObject(
                        [...addFirstPage(existingPagesArgs), ...newPagesArgs]
                            .map(subsetBooleanToInteger)
                            .sort(sortByBeat),
                    );
                    expect(createdNewPages.sort(sortByBeat)).toMatchObject(
                        newPagesArgs.sort(sortByBeat),
                    );

                    await expectNumberOfChanges.test(db, 1, databaseState);
                },
            );
        });

        describe("insert with failure", () => {
            testWithHistory.for([
                {
                    description: "duplicate start_beat",
                    newPagesArgs: [
                        { start_beat: 5, is_subset: false },
                        { start_beat: 5, is_subset: true },
                    ],
                },
                {
                    description: "duplicate start_beat",
                    newPagesArgs: [
                        {
                            start_beat: 1,
                            is_subset: false,
                            notes: "jeff notes",
                        },
                        { start_beat: 1, is_subset: true },
                        {
                            start_beat: 6,
                            is_subset: false,
                            notes: "jeff notes 2",
                        },
                    ],
                },
            ])(
                "%# - $description",
                async (
                    { newPagesArgs },
                    { db, beats, expectNumberOfChanges },
                ) => {
                    await expect(
                        createPages({ newPages: newPagesArgs, db }),
                    ).rejects.toThrow();
                    await expectNumberOfChanges.test(db, 0);
                },
            );
        });

        describe("With marchers", () => {
            describe("insert without existing pages", () => {
                testWithHistory.for([
                    {
                        description: "single page",
                        newPagesArgs: [{ start_beat: 1, is_subset: false }],
                    },
                    {
                        description: "two pages",
                        newPagesArgs: [
                            { start_beat: 1, is_subset: false },
                            { start_beat: 4, is_subset: true },
                        ],
                    },
                    {
                        description: "many pages",
                        newPagesArgs: [
                            { start_beat: 22, is_subset: true },
                            { start_beat: 1, is_subset: false },
                            { start_beat: 4, is_subset: true },
                            { start_beat: 13, is_subset: false },
                            { start_beat: 7, is_subset: false },
                            { start_beat: 10, is_subset: true },
                            { start_beat: 16, is_subset: true },
                            { start_beat: 19, is_subset: false },
                            { start_beat: 25, is_subset: false },
                        ],
                    },
                ])(
                    "%# - $description",
                    async (
                        { newPagesArgs },
                        { db, beats, marchers, expectNumberOfChanges },
                    ) => {
                        const beforeMarcherPages =
                            await db.query.marcher_pages.findMany();
                        expect(beforeMarcherPages).toHaveLength(
                            // have marcher pages for the first page
                            marchers.expectedMarchers.length,
                        );

                        await createPages({ newPages: newPagesArgs, db });

                        const afterMarcherPages =
                            await db.query.marcher_pages.findMany();
                        const expectedNumberOfMarcherPages =
                            marchers.expectedMarchers.length *
                            (newPagesArgs.length + 1);
                        expect(afterMarcherPages).toHaveLength(
                            expectedNumberOfMarcherPages,
                        );

                        const allPages = await db.query.pages.findMany();

                        // Assert there is a marcherPage for every marcher and page combination
                        for (const marcher of marchers.expectedMarchers) {
                            for (const page of allPages) {
                                const marcherPage = afterMarcherPages.find(
                                    (marcherPage) =>
                                        marcherPage.marcher_id === marcher.id &&
                                        marcherPage.page_id === page.id,
                                );
                                expect(
                                    marcherPage,
                                    `marcherPage for marcher ${marcher.id} and page ${page.id} should be defined`,
                                ).toBeDefined();
                            }
                        }
                        await expectNumberOfChanges.test(db, 1);
                    },
                );
            });

            describe("insert with existing pages", () => {
                testWithHistory.for([
                    {
                        description: "single page with existing pages",
                        existingPagesArgs: [
                            { start_beat: 1, is_subset: false },
                            { start_beat: 3, is_subset: true },
                        ],
                        newPagesArgs: [{ start_beat: 2, is_subset: false }],
                    },
                    {
                        description: "two pages with existing pages",
                        existingPagesArgs: [
                            { start_beat: 1, is_subset: false },
                            { start_beat: 5, is_subset: true },
                        ],
                        newPagesArgs: [
                            { start_beat: 2, is_subset: false },
                            { start_beat: 4, is_subset: true },
                        ],
                    },
                    {
                        description: "many pages with existing pages",
                        existingPagesArgs: [
                            { start_beat: 1, is_subset: false },
                            { start_beat: 3, is_subset: true },
                            { start_beat: 7, is_subset: false },
                            { start_beat: 9, is_subset: true },
                        ],
                        newPagesArgs: [
                            { start_beat: 2, is_subset: false },
                            { start_beat: 4, is_subset: true },
                            { start_beat: 5, is_subset: false },
                            { start_beat: 6, is_subset: true },
                            { start_beat: 8, is_subset: false },
                            { start_beat: 10, is_subset: true },
                        ],
                    },
                    {
                        description:
                            "insert multiple pages at beginning with existing pages",
                        existingPagesArgs: [
                            { start_beat: 5, is_subset: false },
                            { start_beat: 7, is_subset: true },
                            { start_beat: 9, is_subset: false },
                        ],
                        newPagesArgs: [
                            { start_beat: 1, is_subset: false },
                            { start_beat: 3, is_subset: true },
                        ],
                    },
                    {
                        description:
                            "insert multiple pages at end with existing pages",
                        existingPagesArgs: [
                            { start_beat: 1, is_subset: false },
                            { start_beat: 3, is_subset: true },
                            { start_beat: 5, is_subset: false },
                        ],
                        newPagesArgs: [
                            { start_beat: 7, is_subset: false },
                            { start_beat: 9, is_subset: true },
                            { start_beat: 11, is_subset: false },
                        ],
                    },
                    {
                        description:
                            "insert multiple pages in middle with existing pages",
                        existingPagesArgs: [
                            { start_beat: 1, is_subset: false },
                            { start_beat: 3, is_subset: true },
                            { start_beat: 9, is_subset: false },
                            { start_beat: 11, is_subset: true },
                        ],
                        newPagesArgs: [
                            { start_beat: 5, is_subset: false },
                            { start_beat: 7, is_subset: true },
                        ],
                    },
                ])(
                    "%# - $description",
                    async (
                        { existingPagesArgs, newPagesArgs },
                        { db, beats, marchers, expectNumberOfChanges },
                    ) => {
                        // Create existing pages first
                        await createPages({
                            newPages: existingPagesArgs,
                            db,
                        });

                        // Verify existing marcher pages were created
                        const beforeMarcherPages =
                            await db.query.marcher_pages.findMany();
                        const expectedExistingMarcherPages =
                            marchers.expectedMarchers.length *
                            (existingPagesArgs.length + 1);
                        expect(beforeMarcherPages).toHaveLength(
                            expectedExistingMarcherPages,
                        );

                        // Create new pages
                        await createPages({ newPages: newPagesArgs, db });

                        // Verify all marcher pages were created
                        const afterMarcherPages =
                            await db.query.marcher_pages.findMany();
                        const expectedTotalMarcherPages =
                            marchers.expectedMarchers.length *
                            (existingPagesArgs.length +
                                1 +
                                newPagesArgs.length);
                        expect(afterMarcherPages).toHaveLength(
                            expectedTotalMarcherPages,
                        );

                        const allPages = await db.query.pages.findMany();

                        // Assert there is a marcherPage for every marcher and page combination
                        for (const marcher of marchers.expectedMarchers) {
                            for (const page of allPages) {
                                const marcherPage = afterMarcherPages.find(
                                    (marcherPage) =>
                                        marcherPage.marcher_id === marcher.id &&
                                        marcherPage.page_id === page.id,
                                );
                                expect(
                                    marcherPage,
                                    `marcherPage for marcher ${marcher.id} and page ${page.id} should be defined`,
                                ).toBeDefined();
                            }
                        }
                        await expectNumberOfChanges.test(db, 2); // One for existing pages, one for new pages
                    },
                );
            });
        });
    });

    describe("updatePages", () => {
        describe.each([
            {
                description: "updates multiple pages",
                existingPagesArgs: [
                    {
                        start_beat: 8,
                        is_subset: true,
                        notes: "do not touch",
                    },
                    {
                        start_beat: 12,
                        is_subset: false,
                        notes: "notes jeff",
                    },
                    { start_beat: 10, is_subset: true },
                    {
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                ],
                modifiedPagesArgs: [
                    {
                        id: 1,
                        start_beat: 15,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 2,
                        start_beat: 11,
                        is_subset: false,
                        notes: "new note",
                    },
                    {
                        id: 4,
                    },
                ],
                expectedUpdatedPages: [
                    {
                        id: 1,
                        start_beat: 15,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 2,
                        start_beat: 11,
                        is_subset: false,
                        notes: "new note",
                    },
                    {
                        id: 4,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                ],
                isChangeExpected: true,
            },
            {
                description:
                    "should not update values if it is not provided in the updatedPageArgs",
                existingPagesArgs: [
                    { start_beat: 12, is_subset: true },
                    { start_beat: 10, is_subset: true },
                    {
                        start_beat: 16,
                        is_subset: true,
                        notes: "jeff notes",
                    },
                ],
                modifiedPagesArgs: [
                    {
                        id: 3,
                    },
                ],
                expectedUpdatedPages: [
                    {
                        id: 3,
                        start_beat: 16,
                        is_subset: true,
                        notes: "jeff notes",
                    },
                ],
                isChangeExpected: false,
            },
            {
                description:
                    "should not update values if it is undefined in the updatedPageArgs",
                existingPagesArgs: [
                    { start_beat: 12, is_subset: true },
                    { start_beat: 10, is_subset: true },
                    {
                        start_beat: 16,
                        is_subset: true,
                        notes: "jeff notes",
                    },
                ],
                modifiedPagesArgs: [
                    {
                        id: 3,
                        start_beat: undefined,
                        is_subset: undefined,
                        notes: undefined,
                    },
                ],
                expectedUpdatedPages: [
                    {
                        id: 3,
                        start_beat: 16,
                        is_subset: true,
                        notes: "jeff notes",
                    },
                ],
                isChangeExpected: false,
            },
            {
                description:
                    "should update values if it is null in the updatedPageArgs",
                existingPagesArgs: [
                    { start_beat: 12, is_subset: true },
                    { start_beat: 10, is_subset: true },
                    {
                        start_beat: 16,
                        is_subset: true,
                        notes: "jeff notes",
                    },
                ],
                modifiedPagesArgs: [
                    {
                        id: 1,
                        start_beat: undefined,
                        is_subset: undefined,
                        notes: "asdf notes",
                    },
                    {
                        id: 3,
                        start_beat: undefined,
                        is_subset: undefined,
                        notes: null,
                    },
                    {
                        id: 2,
                        start_beat: undefined,
                        is_subset: undefined,
                        notes: undefined,
                    },
                ],
                expectedUpdatedPages: [
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: true,
                        notes: "asdf notes",
                    },
                    {
                        id: 2,
                        start_beat: 10,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 3,
                        start_beat: 16,
                        is_subset: true,
                        notes: null,
                    },
                ],
                isChangeExpected: true,
            },
        ])(
            "%# - $description",
            ({
                existingPagesArgs,
                modifiedPagesArgs,
                expectedUpdatedPages,
                isChangeExpected,
            }) => {
                testWithHistory(
                    "update as single action",
                    async ({ db, beats, expectNumberOfChanges }) => {
                        // Create existing pages first
                        await createPages({
                            newPages: existingPagesArgs,
                            db,
                        });

                        const databaseState =
                            await expectNumberOfChanges.getDatabaseState(db);

                        // Update the pages
                        const updateResult = await updatePages({
                            modifiedPages: modifiedPagesArgs,
                            db,
                        });

                        expect(updateResult.length).toBe(
                            expectedUpdatedPages.length,
                        );

                        expect(
                            updateResult.sort((a, b) => a.id - b.id),
                        ).toMatchObject(
                            expectedUpdatedPages.sort((a, b) => a.id - b.id),
                        );

                        if (isChangeExpected)
                            await expectNumberOfChanges.test(
                                db,
                                1,
                                databaseState,
                            );
                    },
                );
                testWithHistory(
                    "update as multiple actions",
                    async ({ db, beats, expectNumberOfChanges }) => {
                        // Create existing pages first
                        await createPages({
                            newPages: existingPagesArgs,
                            db,
                        });

                        const databaseState =
                            await expectNumberOfChanges.getDatabaseState(db);

                        // Update the pages
                        for (const modifiedPage of modifiedPagesArgs) {
                            await updatePages({
                                modifiedPages: [modifiedPage],
                                db,
                            });
                        }

                        const updatePageIds = modifiedPagesArgs.map(
                            (modifiedPage) => modifiedPage.id,
                        );

                        const updatedPages = await db.query.pages.findMany({
                            where: inArray(schema.pages.id, updatePageIds),
                        });

                        expect(updatedPages.length).toBe(
                            expectedUpdatedPages.length,
                        );

                        expect(
                            updatedPages.sort((a, b) => a.id - b.id),
                        ).toMatchObject(
                            expectedUpdatedPages
                                .sort((a, b) => a.id - b.id)
                                .map(subsetBooleanToInteger),
                        );

                        if (isChangeExpected)
                            await expectNumberOfChanges.test(
                                db,
                                modifiedPagesArgs.length,
                                databaseState,
                            );
                    },
                );
            },
        );

        describe("update with failure", () => {
            testWithHistory.for([
                {
                    description:
                        "should fail to update page with existing start_beat value",
                    existingPagesArgs: [
                        { start_beat: 12, is_subset: true },
                        { start_beat: 14, is_subset: true },
                    ],
                    modifiedPagesArgs: [
                        {
                            id: 2,
                            start_beat: 12, // Trying to update to existing start_beat
                        },
                    ],
                },
            ])(
                "%# - $description",
                async (
                    { existingPagesArgs, modifiedPagesArgs },
                    { db, beats, expectNumberOfChanges },
                ) => {
                    // Create existing pages first
                    await createPages({
                        newPages: existingPagesArgs,
                        db,
                    });

                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    // Attempt to update with conflicting start_beat should fail
                    await expect(
                        updatePages({
                            modifiedPages: modifiedPagesArgs,
                            db,
                        }),
                    ).rejects.toThrow();

                    await expectNumberOfChanges.test(db, 0, databaseState);
                },
            );
        });
    });

    describe("deletePage", () => {
        describe("no existing data", () => {
            describe.each([
                {
                    description: "delete a single page",
                    existingPagesArgs: [
                        {
                            start_beat: 16,
                            is_subset: false,
                            notes: "jeff notes",
                        },
                        { start_beat: 10, is_subset: true, notes: null },
                        { start_beat: 12, is_subset: false, notes: null },
                    ],
                    pageIdsToDelete: [1],
                },
                {
                    description: "delete multiple pages",
                    existingPagesArgs: [
                        {
                            start_beat: 16,
                            is_subset: false,
                            notes: "jeff notes",
                        },
                        { start_beat: 10, is_subset: true, notes: null },
                        { start_beat: 12, is_subset: false, notes: null },
                        { start_beat: 8, is_subset: true, notes: "notes" },
                        { start_beat: 20, is_subset: false, notes: null },
                    ],
                    pageIdsToDelete: [1, 3, 5],
                },
                {
                    description: "delete all pages",
                    existingPagesArgs: [
                        {
                            start_beat: 16,
                            is_subset: false,
                            notes: "jeff notes",
                        },
                        { start_beat: 10, is_subset: true, notes: null },
                        { start_beat: 12, is_subset: false, notes: null },
                    ],
                    pageIdsToDelete: [1, 2, 3],
                },
                {
                    description: "delete page with notes",
                    existingPagesArgs: [
                        {
                            start_beat: 16,
                            is_subset: false,
                            notes: "very important notes",
                        },
                        { start_beat: 10, is_subset: true, notes: null },
                    ],
                    pageIdsToDelete: [1],
                },
                {
                    description: "delete subset page",
                    existingPagesArgs: [
                        {
                            start_beat: 16,
                            is_subset: false,
                            notes: "jeff notes",
                        },
                        { start_beat: 10, is_subset: true, notes: null },
                        { start_beat: 12, is_subset: false, notes: null },
                    ],
                    pageIdsToDelete: [2],
                },
            ])(
                "%# - $description",
                ({ pageIdsToDelete, existingPagesArgs }) => {
                    testWithHistory(
                        "as single action",
                        async ({ db, beats, expectNumberOfChanges }) => {
                            await createPages({
                                newPages: existingPagesArgs,
                                db,
                            });

                            const pagesBeforeDelete =
                                await db.query.pages.findMany();
                            expect(
                                pagesBeforeDelete.length,
                                "Ensure all the pages are created",
                            ).toBe(existingPagesArgs.length + 1);

                            const databaseState =
                                await expectNumberOfChanges.getDatabaseState(
                                    db,
                                );

                            const deleteResult = await deletePages({
                                pageIds: new Set(pageIdsToDelete),
                                db,
                            });
                            expect(deleteResult.length).toBe(
                                pageIdsToDelete.length,
                            );

                            const pagesAfterDelete =
                                await db.query.pages.findMany();
                            expect(
                                pagesAfterDelete.length,
                                "Ensure all the pages are deleted",
                            ).toBe(
                                existingPagesArgs.length +
                                    1 -
                                    pageIdsToDelete.length,
                            );

                            const allPageIds = new Set(
                                pagesAfterDelete.map((p) => p.id),
                            );
                            for (const pageId of pageIdsToDelete) {
                                expect(allPageIds.has(pageId)).toBeFalsy();
                            }

                            await expectNumberOfChanges.test(
                                db,
                                1,
                                databaseState,
                            );
                        },
                    );
                    testWithHistory(
                        "as multiple actions",
                        async ({ db, beats, expectNumberOfChanges }) => {
                            await createPages({
                                newPages: existingPagesArgs,
                                db,
                            });

                            const pagesBeforeDelete =
                                await db.query.pages.findMany();
                            expect(
                                pagesBeforeDelete.length,
                                "Ensure all the pages are created",
                            ).toBe(existingPagesArgs.length + 1);

                            const databaseState =
                                await expectNumberOfChanges.getDatabaseState(
                                    db,
                                );

                            for (const pageId of pageIdsToDelete)
                                await deletePages({
                                    pageIds: new Set([pageId]),
                                    db,
                                });

                            const pagesAfterDelete =
                                await db.query.pages.findMany();
                            expect(
                                pagesAfterDelete.length,
                                "Ensure all the pages are deleted",
                            ).toBe(
                                existingPagesArgs.length +
                                    1 -
                                    pageIdsToDelete.length,
                            );

                            const allPageIds = new Set(
                                pagesAfterDelete.map((p) => p.id),
                            );
                            for (const pageId of pageIdsToDelete) {
                                expect(allPageIds.has(pageId)).toBeFalsy();
                            }

                            await expectNumberOfChanges.test(
                                db,
                                pageIdsToDelete.length,
                                databaseState,
                            );
                        },
                    );
                },
            );
            describe("deletePage with failure", () => {
                testWithHistory(
                    "Should fail to delete the first page",
                    async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                        const pagesBeforeDelete =
                            await db.query.pages.findMany();
                        const firstPage = pagesBeforeDelete.find(
                            (p) => p.id === FIRST_PAGE_ID,
                        )!;
                        expect(firstPage).toBeDefined();
                        const allPageIds = new Set(
                            pagesBeforeDelete.map((p) => p.id),
                        );

                        await deletePages({
                            pageIds: allPageIds,
                            db,
                        });

                        const pagesAfterDelete =
                            await db.query.pages.findMany();

                        // First page should not have been deleted
                        expect(pagesAfterDelete).toHaveLength(1);
                        expect(pagesAfterDelete[0].id).toEqual(firstPage.id);
                    },
                );

                testWithHistory.for([
                    // {
                    //     description: "Delete no pages",
                    //     realPageIdsToDelete: [],
                    //     fakePageIdsToDelete: [
                    //         7987, 8273623, -1, 123456, 986, 6275.2378, -128.2,
                    //     ],
                    // },
                    {
                        description:
                            "Delete pages and also provide pages that don't exist",
                        realPageIdsToDelete: [1, 2, 3],
                        fakePageIdsToDelete: [
                            7987, 8273623, -1, 123456, 986, 6275.2378, -128.2,
                        ],
                    },
                ])(
                    "%# - Should ignore pages that don't exist",
                    async (
                        { realPageIdsToDelete, fakePageIdsToDelete },
                        { db, marchersAndPages, expectNumberOfChanges },
                    ) => {
                        const pagesBeforeDelete = await db
                            .select()
                            .from(schema.pages);

                        const deleteIds = new Set([
                            ...realPageIdsToDelete,
                            ...fakePageIdsToDelete,
                        ]);

                        await deletePages({
                            pageIds: deleteIds,
                            db,
                        });

                        const pagesAfterDelete = await db
                            .select()
                            .from(schema.pages);

                        expect(pagesAfterDelete).toHaveLength(
                            pagesBeforeDelete.length -
                                realPageIdsToDelete.length,
                        );
                    },
                );
            });
        });
        describe("with existing data", () => {
            describe.each([
                {
                    description: "single page",
                    existingPageIndexesToDelete: [1],
                },
                {
                    description: "multiple pages",
                    existingPageIndexesToDelete: [3, 1, 2],
                },
                {
                    description: "no pages",
                    existingPageIndexesToDelete: [],
                },
                {
                    description: "even more pages",
                    existingPageIndexesToDelete: [1, 2, 3, 4, 5, 6],
                },
            ])("%# - $description", ({ existingPageIndexesToDelete }) => {
                testWithHistory(
                    "Single action",
                    async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                        expect(
                            marchersAndPages.expectedMarcherPages,
                        ).toHaveLength(
                            marchersAndPages.expectedPages.length *
                                marchersAndPages.expectedMarchers.length,
                        );

                        const pagesBeforeDelete =
                            await db.query.pages.findMany();
                        expect(pagesBeforeDelete.length).toBe(
                            marchersAndPages.expectedPages.length,
                        );

                        const marcherPagesBeforeDelete =
                            await db.query.marcher_pages.findMany();
                        expect(marcherPagesBeforeDelete.length).toBe(
                            marchersAndPages.expectedMarcherPages.length,
                        );

                        const deleteResult = await deletePages({
                            pageIds: new Set(existingPageIndexesToDelete),
                            db,
                        });
                        expect(deleteResult.length).toBe(
                            existingPageIndexesToDelete.length,
                        );

                        const pagesAfterDelete =
                            await db.query.pages.findMany();
                        expect(pagesAfterDelete.length).toBe(
                            marchersAndPages.expectedPages.length -
                                existingPageIndexesToDelete.length,
                        );

                        const marcherPagesAfterDelete =
                            await db.query.marcher_pages.findMany();
                        expect(marcherPagesAfterDelete.length).toBe(
                            marchersAndPages.expectedMarcherPages.length -
                                existingPageIndexesToDelete.length *
                                    marchersAndPages.expectedMarchers.length,
                        );
                        await expectNumberOfChanges.test(
                            db,
                            existingPageIndexesToDelete.length > 0 ? 1 : 0,
                        );
                    },
                );
                testWithHistory(
                    "Multiple actions",
                    async ({ db, marchersAndPages, expectNumberOfChanges }) => {
                        expect(
                            marchersAndPages.expectedMarcherPages,
                        ).toHaveLength(
                            marchersAndPages.expectedPages.length *
                                marchersAndPages.expectedMarchers.length,
                        );

                        const pagesBeforeDelete =
                            await db.query.pages.findMany();
                        expect(pagesBeforeDelete.length).toBe(
                            marchersAndPages.expectedPages.length,
                        );

                        const marcherPagesBeforeDelete =
                            await db.query.marcher_pages.findMany();
                        expect(marcherPagesBeforeDelete.length).toBe(
                            marchersAndPages.expectedMarcherPages.length,
                        );

                        for (const pageId of existingPageIndexesToDelete)
                            await deletePages({
                                pageIds: new Set([pageId]),
                                db,
                            });

                        const pagesAfterDelete =
                            await db.query.pages.findMany();
                        expect(pagesAfterDelete.length).toBe(
                            marchersAndPages.expectedPages.length -
                                existingPageIndexesToDelete.length,
                        );

                        const marcherPagesAfterDelete =
                            await db.query.marcher_pages.findMany();
                        expect(marcherPagesAfterDelete.length).toBe(
                            marchersAndPages.expectedMarcherPages.length -
                                existingPageIndexesToDelete.length *
                                    marchersAndPages.expectedMarchers.length,
                        );
                        await expectNumberOfChanges.test(
                            db,
                            existingPageIndexesToDelete.length,
                        );
                    },
                );
            });
        });

        describe("delete last page", () => {
            testWithHistory(
                "Deleting last page should update last page counts",
                async ({ db }) => {
                    const getLastPageCounts = async () =>
                        (await db.query.utility.findFirst())!.last_page_counts;

                    const lastPage1 = await createLastPage({
                        db,
                        newPageCounts: 9,
                        createNewBeats: true,
                    });
                    expect(await getLastPageCounts()).toBe(9);
                    const lastPage2 = await createLastPage({
                        db,
                        newPageCounts: 10,
                        createNewBeats: true,
                    });
                    expect(await getLastPageCounts()).toBe(10);
                    const lastPage3 = await createLastPage({
                        db,
                        newPageCounts: 23,
                        createNewBeats: true,
                    });
                    expect(await getLastPageCounts()).toBe(23);

                    expect(await getPages({ db })).toHaveLength(4);

                    await deletePages({
                        pageIds: new Set([lastPage3.id]),
                        db,
                    });
                    expect(await getPages({ db })).toHaveLength(3);
                    expect(
                        await getLastPageCounts(),
                        "Last page counts should be updated to the new last page's counts",
                    ).toBe(10);

                    await deletePages({
                        pageIds: new Set([lastPage2.id]),
                        db,
                    });
                    expect(await getPages({ db })).toHaveLength(2);
                    expect(
                        await getLastPageCounts(),
                        "Last page counts should be updated to the new last page's counts",
                    ).toBe(9);

                    await deletePages({
                        pageIds: new Set([lastPage1.id]),
                        db,
                    });
                    expect(await getPages({ db })).toHaveLength(1);
                    expect(
                        await getLastPageCounts(),
                        "Since only the first page is left, the last page counts should not change",
                    ).toBe(9);
                },
            );
            it.todo(
                "Delete many pages at once and make sure the last page counts are updated correctly",
            );
        });
    });

    describe("createLastPage", () => {
        describe("with existing pages", () => {
            testWithHistory.for([
                {
                    newPageCounts: 8,
                },
                {
                    newPageCounts: 9,
                },
                {
                    newPageCounts: 10,
                },
            ])(
                "%# - {newPageCounts: $newPageCounts}",
                async (
                    { newPageCounts },
                    { db, marchersAndPages, expectNumberOfChanges },
                ) => {
                    const pagesBeforeCreate = await db.query.pages.findMany();
                    expect(pagesBeforeCreate.length).toBe(
                        marchersAndPages.expectedPages.length,
                    );

                    const utilityBeforeCreate =
                        await db.query.utility.findFirst()!;
                    if (!utilityBeforeCreate) {
                        await db.insert(schema.utility).values({
                            id: 0,
                            last_page_counts: newPageCounts * 2, // something that isn't equal to newPageCounts
                        });
                    }

                    const databaseState =
                        await expectNumberOfChanges.getDatabaseState(db);

                    const lastPageBeforeCreate = (await db
                        .select({
                            page_id: schema.pages.id,
                            beat_id: schema.beats.id,
                            beat_position: schema.beats.position,
                        })
                        .from(schema.pages)
                        .orderBy(desc(schema.pages.start_beat))
                        .innerJoin(
                            schema.beats,
                            eq(schema.pages.start_beat, schema.beats.id),
                        )
                        .limit(1)
                        .get())!;
                    expect(lastPageBeforeCreate).toBeDefined();

                    await createLastPage({
                        db,
                        newPageCounts,
                        createNewBeats: true,
                    });

                    // assert that the last page was created
                    const pagesAfterCreate = await db.query.pages.findMany();
                    expect(pagesAfterCreate.length).toBe(
                        marchersAndPages.expectedPages.length + 1,
                    );

                    const lastPageAfterCreate = (await db
                        .select({
                            page_id: schema.pages.id,
                            beat_id: schema.beats.id,
                            beat_position: schema.beats.position,
                        })
                        .from(schema.pages)
                        .orderBy(desc(schema.pages.start_beat))
                        .innerJoin(
                            schema.beats,
                            eq(schema.pages.start_beat, schema.beats.id),
                        )
                        .limit(1)
                        .get())!;
                    expect(lastPageAfterCreate).toBeDefined();
                    expect(lastPageAfterCreate.page_id).not.toEqual(
                        lastPageBeforeCreate.page_id,
                    );

                    // assert that the utility record was updated
                    const utilityAfterCreate =
                        await db.query.utility.findFirst()!;
                    expect(utilityAfterCreate).toBeDefined();
                    expect(utilityAfterCreate?.last_page_counts).toEqual(
                        newPageCounts,
                    );

                    await expectNumberOfChanges.test(db, 1, databaseState);
                },
            );
        });

        describe("with no existing pages", () => {
            testWithHistory.for([
                {
                    seed: 2,
                },
                {
                    seed: 9,
                },
                {
                    seed: 10,
                },
            ])(
                "%# - {seed: $seed}",
                async ({ seed }, { db, expectNumberOfChanges }) => {
                    expect(await getPages({ db })).toHaveLength(1);

                    faker.seed(seed);
                    for (let i = 0; i < 4; i++) {
                        await createLastPage({
                            db,
                            newPageCounts: faker.number.int({
                                min: 1,
                                max: 512,
                            }),
                            createNewBeats: true,
                        });
                        expect(
                            await getPages({ db }),
                            `Should have ${i + 2} pages`,
                        ).toHaveLength(i + 2);
                    }
                },
            );
        });
    });

    describe("create beats to fill last page", () => {
        describe("should create beats to fill last page with no existing pages", () => {
            testWithHistory.for([
                {
                    newPageCounts: 1,
                },
                {
                    newPageCounts: 8,
                },
                {
                    newPageCounts: 17,
                },
                {
                    newPageCounts: 123,
                },
            ])(
                "%# - {newPageCounts: $newPageCounts}",
                async (
                    { newPageCounts },
                    { db, marchers, expectNumberOfChanges },
                ) => {
                    const beatsBeforeCreate = await db.query.beats.findMany();
                    const pagesBeforeCreate = await db.query.pages.findMany();

                    await createLastPage({
                        db,
                        newPageCounts,
                        createNewBeats: true,
                    });

                    const beatsAfterCreate = await db.query.beats.findMany();
                    expect(beatsAfterCreate).toHaveLength(
                        beatsBeforeCreate.length + newPageCounts,
                    );
                    expect(beatsAfterCreate).toEqual(
                        expect.arrayContaining(beatsBeforeCreate),
                    );

                    const pagesAfterCreate = await db.query.pages.findMany();
                    expect(pagesAfterCreate).toHaveLength(
                        pagesBeforeCreate.length + 1,
                    );
                    expect(pagesAfterCreate).toEqual(
                        expect.arrayContaining(pagesBeforeCreate),
                    );

                    await expectNumberOfChanges.test(db, 1);
                },
            );
        });
        describe("should create beats to fill last page with existing pages", () => {
            testWithHistory.for([
                {
                    newPageCounts: 1,
                },
                {
                    newPageCounts: 8,
                },
                {
                    newPageCounts: 17,
                },
                {
                    newPageCounts: 123,
                },
            ])(
                "%# - {newPageCounts: $newPageCounts}",
                async (
                    { newPageCounts },
                    { db, marchersAndPages, expectNumberOfChanges },
                ) => {
                    const beatsBeforeCreate = await db.query.beats.findMany();
                    const pagesBeforeCreate = await db.query.pages.findMany();

                    await createLastPage({
                        db,
                        newPageCounts,
                        createNewBeats: true,
                    });

                    const beatsAfterCreate = await db.query.beats.findMany();
                    expect(beatsAfterCreate.length).toBeGreaterThanOrEqual(
                        beatsBeforeCreate.length,
                    );
                    expect(beatsAfterCreate).toEqual(
                        expect.arrayContaining(beatsBeforeCreate),
                    );

                    const pagesAfterCreate = await db.query.pages.findMany();
                    expect(pagesAfterCreate).toHaveLength(
                        pagesBeforeCreate.length + 1,
                    );
                    expect(pagesAfterCreate).toEqual(
                        expect.arrayContaining(pagesBeforeCreate),
                    );

                    await expectNumberOfChanges.test(db, 1);
                },
            );
        });

        describe("delete all pages, then create a new last page without creating beats", () => {
            testWithHistory.for([
                {
                    newPageCounts: 1,
                },
                {
                    newPageCounts: 8,
                },
                {
                    newPageCounts: 17,
                },
            ])(
                "%# - {newPageCounts: $newPageCounts}",
                async ({ newPageCounts }, { db, marchersAndPages }) => {
                    const allPages = (await db.query.pages.findMany()).filter(
                        (p) => p.id !== FIRST_PAGE_ID,
                    );
                    const beatsBeforeDelete = await db.query.beats.findMany();
                    // filter out first page ID
                    await deletePages({
                        pageIds: new Set(allPages.map((p) => p.id)),
                        db,
                    });
                    expect(await getPages({ db })).toHaveLength(1);
                    await createLastPage({
                        db,
                        newPageCounts,
                        createNewBeats: true,
                    });
                    expect(await getPages({ db })).toHaveLength(2);
                    expect(await getBeats({ db })).toHaveLength(
                        beatsBeforeDelete.length,
                    );
                },
            );
        });
        describe("delete all but some pages, then create a new last page without creating beats", () => {
            testWithHistory.for([
                ...[1, 2, 4].flatMap((numPagesToKeep) =>
                    [1, 8, 17].map((newPageCounts) => ({
                        numPagesToKeep,
                        newPageCounts,
                    })),
                ),
            ])(
                "%# - {newPageCounts: $newPageCounts, numPagesToKeep: $numPagesToKeep}",
                async (
                    { newPageCounts, numPagesToKeep },
                    { db, marchersAndPages },
                ) => {
                    const pageIdsToKeep = Array.from(
                        { length: numPagesToKeep },
                        (_, i) => i + 1,
                    ).concat(FIRST_PAGE_ID);
                    const allPages = (await db.query.pages.findMany()).filter(
                        (p) =>
                            // First page doesn't count
                            p.id !== 0 && !pageIdsToKeep.includes(p.id),
                    );
                    const beatsBeforeDelete = await db.query.beats.findMany();
                    // filter out first page ID
                    await deletePages({
                        pageIds: new Set(allPages.map((p) => p.id)),
                        db,
                    });
                    const pagesAfterDelete = await getPages({ db });
                    expect(pagesAfterDelete).toHaveLength(1 + numPagesToKeep);
                    await createLastPage({
                        db,
                        newPageCounts,
                        createNewBeats: true,
                    });
                    expect(await getPages({ db })).toHaveLength(
                        1 + numPagesToKeep + 1,
                    );
                    expect(await getBeats({ db })).toHaveLength(
                        beatsBeforeDelete.length,
                    );
                },
            );
        });

        describe("should fail to create beats to fill last page", () => {
            testWithHistory.for([
                {
                    newPageCounts: 0,
                },
                {
                    newPageCounts: -1,
                },
                {
                    newPageCounts: -129,
                },
            ])(
                "%# - {newPageCounts: $newPageCounts}",
                async (
                    { newPageCounts },
                    { db, expectNumberOfChanges, marchers },
                ) => {
                    await expect(
                        createLastPage({
                            db,
                            newPageCounts,
                            createNewBeats: true,
                        }),
                    ).rejects.toThrow();

                    await expectNumberOfChanges.test(db, 0);
                },
            );
        });
    });

    describe("_fillAndGetBeatToStartOn", () => {
        describe("when last page is already filled with enough beats", () => {
            it("should return the correct beat to start on without creating new beats", async ({
                db,
            }) => {
                const expectedBeats = 21;
                // Setup: Create 8 beats total (enough for 2 pages of 4 beats each)
                for (let i = 0; i < 20; i++) {
                    await createBeats({
                        db,
                        newBeats: [{ duration: 0.5, include_in_measure: true }],
                    });
                }
                expect(await db.select().from(schema.beats)).toHaveLength(
                    expectedBeats,
                );

                // Setup: Update utility with default beat duration (utility record should already exist)
                await db
                    .update(schema.utility)
                    .set({
                        last_page_counts: 8,
                        default_beat_duration: 0.5,
                    })
                    .where(eq(schema.utility.id, 0));

                // Get the last page's start beat (beat with position 5)
                const lastPageStartBeat = await db
                    .select()
                    .from(schema.beats)
                    .where(eq(schema.beats.position, 5))
                    .get();

                expect(lastPageStartBeat).not.toBeNull();

                let result: any;
                await transaction(db, async (tx) => {
                    result = await _fillAndGetBeatToStartOn({
                        tx,
                        lastPage: {
                            id: lastPageStartBeat!.id,
                            start_beat_id: lastPageStartBeat!.id,
                        },
                        currentLastPageCounts: 4,
                        newLastPageCounts: 4,
                    });
                });

                // Should return beat at position 5 (the beat that starts the last page)
                expect(result).not.toBeNull();
                expect(result.position).toBe(9);

                // Verify no additional beats were created (should still be 8 beats)
                const allBeats = await db.select().from(schema.beats);
                expect(allBeats).toHaveLength(expectedBeats);
            });
        });

        describe("when last page needs to be filled with beats", () => {
            it("should create beats to fill the last page and return correct starting beat", async ({
                db,
            }) => {
                // Setup: Create only 6 beats (not enough for 2 full pages of 4 beats each)
                await transaction(db, async (tx) => {
                    await createBeatsInTransaction({
                        tx,
                        newBeats: Array(6)
                            .fill(null)
                            .map(() => ({
                                duration: 0.5,
                                include_in_measure: true,
                            })),
                    });
                });

                // Setup: Update utility with default beat duration (utility record should already exist)
                await db
                    .update(schema.utility)
                    .set({
                        last_page_counts: 8,
                        default_beat_duration: 0.5,
                    })
                    .where(eq(schema.utility.id, 0));

                // Get the last page's start beat (beat with position 5)
                const lastPageStartBeat = await db
                    .select()
                    .from(schema.beats)
                    .where(eq(schema.beats.position, 5))
                    .get();

                expect(lastPageStartBeat).not.toBeNull();

                let result: any;
                await transaction(db, async (tx) => {
                    result = await _fillAndGetBeatToStartOn({
                        tx,
                        lastPage: {
                            id: lastPageStartBeat!.id,
                            start_beat_id: lastPageStartBeat!.id,
                        },
                        currentLastPageCounts: 4,
                        newLastPageCounts: 4,
                    });
                });

                // Should return beat at position 5 (the beat that starts the last page)
                expect(result).not.toBeNull();
                expect(result.position).toBe(9);

                // Verify 2 additional beats were created (6 + 2 = 8 beats total)
                const allBeats = await db.select().from(schema.beats);
                expect(allBeats.length).toBeGreaterThanOrEqual(8);

                // Verify the last page is now filled with beats at positions 5, 6, 7, 8
                const lastPageBeats = await db
                    .select()
                    .from(schema.beats)
                    .where(
                        and(
                            gte(schema.beats.position, 5),
                            lte(schema.beats.position, 8),
                        ),
                    )
                    .orderBy(asc(schema.beats.position));

                expect(lastPageBeats).toHaveLength(4);
                expect(lastPageBeats[0].position).toBe(5);
                expect(lastPageBeats[1].position).toBe(6);
                expect(lastPageBeats[2].position).toBe(7);
                expect(lastPageBeats[3].position).toBe(8);
            });
        });

        describe("when a new page needs to be created and filled", () => {
            it("should create a new page and fill it with beats", async ({
                db,
            }) => {
                // Setup: Create exactly 8 beats (2 full pages of 4 beats each)
                await transaction(db, async (tx) => {
                    await createBeatsInTransaction({
                        tx,
                        newBeats: Array(8)
                            .fill(null)
                            .map(() => ({
                                duration: 0.5,
                                include_in_measure: true,
                            })),
                    });
                });

                // Setup: Update utility with default beat duration (utility record should already exist)
                await db
                    .update(schema.utility)
                    .set({
                        last_page_counts: 8,
                        default_beat_duration: 0.5,
                    })
                    .where(eq(schema.utility.id, 0));

                // Get the last page's start beat (beat with position 5)
                const lastPageStartBeat = await db
                    .select()
                    .from(schema.beats)
                    .where(eq(schema.beats.position, 5))
                    .get();

                expect(lastPageStartBeat).not.toBeNull();

                let result: any;
                await transaction(db, async (tx) => {
                    result = await _fillAndGetBeatToStartOn({
                        tx,
                        lastPage: {
                            id: lastPageStartBeat!.id,
                            start_beat_id: lastPageStartBeat!.id,
                        },
                        currentLastPageCounts: 4,
                        newLastPageCounts: 4,
                    });
                });

                // Should return beat at position 5 (the beat that starts the last page)
                expect(result).not.toBeNull();
                expect(result.position).toBe(9);

                // Verify 4 additional beats were created for the new page (8 + 4 = 12 beats total)
                const allBeats = await db.select().from(schema.beats);
                expect(allBeats.length).toBeGreaterThanOrEqual(12);

                // Verify the new page is filled with beats at positions 9, 10, 11, 12
                const newPageBeats = await db
                    .select()
                    .from(schema.beats)
                    .where(
                        and(
                            gte(schema.beats.position, 9),
                            lte(schema.beats.position, 12),
                        ),
                    )
                    .orderBy(asc(schema.beats.position));

                expect(newPageBeats).toHaveLength(4);
                expect(newPageBeats[0].position).toBe(9);
                expect(newPageBeats[1].position).toBe(10);
                expect(newPageBeats[2].position).toBe(11);
                expect(newPageBeats[3].position).toBe(12);
            });
        });

        describe("edge cases", () => {
            it("should handle missing default beat duration gracefully", async ({
                db,
            }) => {
                // Setup: Create 6 beats
                await transaction(db, async (tx) => {
                    await createBeatsInTransaction({
                        tx,
                        newBeats: Array(6)
                            .fill(null)
                            .map(() => ({
                                duration: 0.5,
                                include_in_measure: true,
                            })),
                    });
                });

                // Don't create utility record (missing default duration)

                const lastPageStartBeat = await db
                    .select()
                    .from(schema.beats)
                    .where(eq(schema.beats.position, 5))
                    .get();

                expect(lastPageStartBeat).not.toBeNull();

                let result: any;
                await transaction(db, async (tx) => {
                    result = await _fillAndGetBeatToStartOn({
                        tx,
                        lastPage: {
                            id: lastPageStartBeat!.id,
                            start_beat_id: lastPageStartBeat!.id,
                        },
                        currentLastPageCounts: 4,
                        newLastPageCounts: 4,
                    });
                });

                // Should still work and return correct beat
                expect(result).not.toBeNull();
                expect(result.position).toBe(9);

                // Verify beats were created with default duration of 0.5 (fallback)
                const allBeats = await db.select().from(schema.beats);
                expect(allBeats.length).toBeGreaterThanOrEqual(8);

                // Check that new beats have the fallback duration
                const newBeats = allBeats.filter((beat) => beat.position > 6);
                newBeats.forEach((beat) => {
                    expect(beat.duration).toBe(0.5);
                });
            });

            it("should work with different lastPageCounts values", async ({
                db,
            }) => {
                // Setup: Create 5 beats (not enough for 2 full pages of 3 beats each)
                await transaction(db, async (tx) => {
                    await createBeatsInTransaction({
                        tx,
                        newBeats: Array(5)
                            .fill(null)
                            .map(() => ({
                                duration: 0.5,
                                include_in_measure: true,
                            })),
                    });
                });

                await db
                    .update(schema.utility)
                    .set({
                        last_page_counts: 8,
                        default_beat_duration: 0.5,
                    })
                    .where(eq(schema.utility.id, 0));

                const lastPageStartBeat = await db
                    .select()
                    .from(schema.beats)
                    .where(eq(schema.beats.position, 4))
                    .get();

                expect(lastPageStartBeat).not.toBeNull();

                let result: any;
                await transaction(db, async (tx) => {
                    result = await _fillAndGetBeatToStartOn({
                        tx,
                        lastPage: {
                            id: lastPageStartBeat!.id,
                            start_beat_id: lastPageStartBeat!.id,
                        },
                        currentLastPageCounts: 3, // Different page size
                        newLastPageCounts: 3,
                    });
                });

                expect(result).not.toBeNull();
                expect(result.position).toBe(7);

                // Should create exactly enough beats to fill the last page (1 beat needed)
                const allBeats = await db.select().from(schema.beats);
                expect(allBeats.length).toBeGreaterThanOrEqual(6); // 5 + 1 = 6
            });

            it("should handle custom default beat duration", async ({ db }) => {
                // Setup: Create 6 beats
                await transaction(db, async (tx) => {
                    await createBeatsInTransaction({
                        tx,
                        newBeats: Array(6)
                            .fill(null)
                            .map(() => ({
                                duration: 0.5,
                                include_in_measure: true,
                            })),
                    });
                });

                // Setup: Update utility with custom default beat duration
                await db
                    .update(schema.utility)
                    .set({
                        last_page_counts: 8,
                        default_beat_duration: 1.0, // Custom duration
                    })
                    .where(eq(schema.utility.id, 0));

                const lastPageStartBeat = await db
                    .select()
                    .from(schema.beats)
                    .where(eq(schema.beats.position, 5))
                    .get();

                expect(lastPageStartBeat).not.toBeNull();

                let result: any;
                await transaction(db, async (tx) => {
                    result = await _fillAndGetBeatToStartOn({
                        tx,
                        lastPage: {
                            id: lastPageStartBeat!.id,
                            start_beat_id: lastPageStartBeat!.id,
                        },
                        currentLastPageCounts: 4,
                        newLastPageCounts: 4,
                    });
                });

                expect(result).not.toBeNull();
                expect(result.position).toBe(9);

                // Verify new beats were created with custom duration
                const newBeats = await db
                    .select()
                    .from(schema.beats)
                    .where(gte(schema.beats.position, 7));

                newBeats.forEach((beat) => {
                    expect(beat.duration).toBe(1.0);
                });
            });
        });
    });

    describe("getLastPage", () => {
        it("should return the first page when only one page exists", async ({
            db,
        }) => {
            await transaction(db, async (tx) => {
                const result = await getLastPage({ tx });
                expect(result).not.toBeNull();
                expect(result!.pages.id).toBe(FIRST_PAGE_ID);
                expect(result!.pages.start_beat).toBe(FIRST_BEAT_ID);
                expect(result!.beats.id).toBe(FIRST_BEAT_ID);
                expect(result!.beats.position).toBe(0);
            });
        });

        it("should return the page with the highest beat position when multiple pages exist", async ({
            db,
        }) => {
            await transaction(db, async (tx) => {
                // Create additional beats and pages
                const beat1 = await tx
                    .insert(schema.beats)
                    .values({
                        duration: 1.0,
                        position: 10,
                        include_in_measure: 1,
                    })
                    .returning()
                    .get();

                const beat2 = await tx
                    .insert(schema.beats)
                    .values({
                        duration: 1.0,
                        position: 20,
                        include_in_measure: 1,
                    })
                    .returning()
                    .get();

                await tx.insert(schema.pages).values({
                    start_beat: beat1.id,
                    is_subset: 0,
                    notes: "Page 1",
                });

                const page2 = await tx
                    .insert(schema.pages)
                    .values({
                        start_beat: beat2.id,
                        is_subset: 0,
                        notes: "Page 2",
                    })
                    .returning()
                    .get();

                const result = await getLastPage({ tx });

                expect(result).not.toBeNull();
                expect(result!.pages.id).toBe(page2.id);
                expect(result!.pages.start_beat).toBe(beat2.id);
                expect(result!.beats.id).toBe(beat2.id);
                expect(result!.beats.position).toBe(20);
            });
        });

        it("should handle pages with non-sequential beat positions correctly", async ({
            db,
        }) => {
            await transaction(db, async (tx) => {
                // Create beats with non-sequential positions
                const beat1 = await tx
                    .insert(schema.beats)
                    .values({
                        duration: 1.0,
                        position: 100,
                        include_in_measure: 1,
                    })
                    .returning()
                    .get();

                const beat2 = await tx
                    .insert(schema.beats)
                    .values({
                        duration: 1.0,
                        position: 50,
                        include_in_measure: 1,
                    })
                    .returning()
                    .get();

                const beat3 = await tx
                    .insert(schema.beats)
                    .values({
                        duration: 1.0,
                        position: 75,
                        include_in_measure: 1,
                    })
                    .returning()
                    .get();

                await tx.insert(schema.pages).values({
                    start_beat: beat1.id,
                    is_subset: 0,
                    notes: "Page at position 100",
                });

                await tx.insert(schema.pages).values({
                    start_beat: beat2.id,
                    is_subset: 0,
                    notes: "Page at position 50",
                });

                await tx.insert(schema.pages).values({
                    start_beat: beat3.id,
                    is_subset: 0,
                    notes: "Page at position 75",
                });

                const result = await getLastPage({ tx });

                expect(result).not.toBeNull();
                expect(result!.beats.position).toBe(100);
            });
        });

        it("should return the correct page when multiple pages have the same beat position", async ({
            db,
        }) => {
            await transaction(db, async (tx) => {
                // Create two beats with the same position (edge case)
                const beat1 = await tx
                    .insert(schema.beats)
                    .values({
                        duration: 1.0,
                        position: 10,
                        include_in_measure: 1,
                    })
                    .returning()
                    .get();

                const beat2 = await tx
                    .insert(schema.beats)
                    .values({
                        duration: 1.0,
                        position: 10,
                        include_in_measure: 1,
                    })
                    .returning()
                    .get();

                const page1 = await tx
                    .insert(schema.pages)
                    .values({
                        start_beat: beat1.id,
                        is_subset: 0,
                        notes: "Page 1",
                    })
                    .returning()
                    .get();

                const page2 = await tx
                    .insert(schema.pages)
                    .values({
                        start_beat: beat2.id,
                        is_subset: 0,
                        notes: "Page 2",
                    })
                    .returning()
                    .get();

                const result = await getLastPage({ tx });

                expect(result).not.toBeNull();
                // Should return one of the pages with position 10
                expect(result!.beats.position).toBe(10);
                expect([page1.id, page2.id]).toContain(result!.pages.id);
            });
        });

        it("should include both page and beat data in the result", async ({
            db,
        }) => {
            await transaction(db, async (tx) => {
                const beat = await tx
                    .insert(schema.beats)
                    .values({
                        duration: 2.5,
                        position: 15,
                        include_in_measure: 1,
                        notes: "Test beat",
                    })
                    .returning()
                    .get();

                const page = await tx
                    .insert(schema.pages)
                    .values({
                        start_beat: beat.id,
                        is_subset: 1,
                        notes: "Test page",
                    })
                    .returning()
                    .get();

                const result = await getLastPage({ tx });

                expect(result).not.toBeNull();

                // Check page data
                expect(result!.pages.id).toBe(page.id);
                expect(result!.pages.start_beat).toBe(beat.id);
                expect(result!.pages.is_subset).toBe(1);
                expect(result!.pages.notes).toBe("Test page");

                // Check beat data
                expect(result!.beats.id).toBe(beat.id);
                expect(result!.beats.duration).toBe(2.5);
                expect(result!.beats.position).toBe(15);
                expect(result!.beats.include_in_measure).toBe(1);
                expect(result!.beats.notes).toBe("Test beat");
            });
        });
    });

    describe("getNextBeatToStartPageOne", () => {
        it("should return null if no next beat exists", async ({ db }) => {
            const utility = await db.query.utility.findFirst()!;
            expect(utility).toBeTruthy();
            expect(utility!.last_page_counts).toBeGreaterThan(0);
            const result = await getNextBeatToStartPageOn(db);
            expect(result).toBeNull();
        });

        it("should return the next beat when there is just one and the first page", async ({
            db,
        }) => {
            const utility = await db.query.utility.findFirst()!;
            expect(utility).toBeTruthy();
            const createdBeats = await createBeats({
                db,
                newBeats: Array.from({ length: utility!.last_page_counts }).map(
                    () => ({ duration: 1, include_in_measure: true }),
                ),
            });
            const result = await getNextBeatToStartPageOn(db);
            expect(result).not.toBeNull();
            expect(result).toMatchObject(createdBeats[createdBeats.length - 1]);
        });
    });
    describe("createTempoGroupAndPageFromWorkspaceSettings", () => {
        describe("simple examples with no pages", () => {
            it.for<{ workspaceSettings: WorkspaceSettings }>([
                {
                    workspaceSettings: {
                        defaultBeatsPerMeasure: 4,
                        defaultTempo: 120,
                        defaultNewPageCounts: 16,
                    },
                },
                {
                    workspaceSettings: {
                        defaultBeatsPerMeasure: 4,
                        defaultTempo: 120,
                        defaultNewPageCounts: 17,
                    },
                },
                {
                    workspaceSettings: {
                        defaultBeatsPerMeasure: 4,
                        defaultTempo: 73.1234643453,
                        defaultNewPageCounts: 18,
                    },
                },
                {
                    workspaceSettings: {
                        defaultBeatsPerMeasure: 3,
                        defaultTempo: 200,
                        defaultNewPageCounts: 9,
                    },
                },
            ])("%#", async ({ workspaceSettings }, { db }) => {
                const pagesBefore = await getPages({ db });
                const beatsBefore = await getBeats({ db });
                expect(await getMeasures({ db })).toHaveLength(0);
                await createTempoGroupAndPageFromWorkspaceSettings({
                    db,
                    workspaceSettings,
                });
                const pagesAfter = await getPages({ db });
                const beatsAfter = await getBeats({ db });
                const measuresAfter = await getMeasures({ db });

                expect(
                    pagesAfter,
                    "Expect there to be one more page",
                ).toHaveLength(pagesBefore.length + 1);
                const newMeasuresExpectedNumber = Math.ceil(
                    workspaceSettings.defaultNewPageCounts /
                        workspaceSettings.defaultBeatsPerMeasure,
                );
                expect(
                    measuresAfter,
                    "Expect there to be the expected number of measures",
                ).toHaveLength(newMeasuresExpectedNumber);
                const newBeatsExpectedNumber =
                    newMeasuresExpectedNumber *
                    workspaceSettings.defaultBeatsPerMeasure;
                expect(
                    beatsAfter,
                    "Expect there to be the expected number of beats",
                ).toHaveLength(beatsBefore.length + newBeatsExpectedNumber);
            });
        });
        it("Create with existing pages", async ({ db }) => {
            // Setup existing beats
            const beforeBeatsNewArgs: NewBeatArgs[] = Array.from({
                length: 16,
            }).map(() => ({
                duration: 1,
                include_in_measure: true,
            }));
            const createdBeats = (
                await createBeats({
                    db,
                    newBeats: beforeBeatsNewArgs,
                })
            ).sort((a, b) => a.position - b.position);
            await updateLastPageCounts({
                tx: db as DbTransaction,
                lastPageCounts: 8,
            });
            const page1StartBeat = createdBeats[0].id;
            const page2StartBeat = createdBeats[8].id;
            const beforePagesNewArgs: NewPageArgs[] = [
                {
                    start_beat: page1StartBeat,
                    is_subset: false,
                },
                {
                    start_beat: page2StartBeat,
                    is_subset: false,
                },
            ];
            await createPages({
                db,
                newPages: beforePagesNewArgs,
            });
            const expectedNextPosition =
                (await db.query.beats.findFirst({
                    orderBy: desc(schema.beats.position),
                }))!.position + 1;

            const workspaceSettings: WorkspaceSettings = {
                defaultBeatsPerMeasure: 3,
                defaultTempo: 200,
                defaultNewPageCounts: 12,
            };

            // Create the tempo group and page
            await createTempoGroupAndPageFromWorkspaceSettings({
                db,
                workspaceSettings,
            });
            // Assert the correct number of pages, beats, and measures were created
            const pagesAfter = await getPages({ db });
            const beatsAfter = await getBeats({ db });
            const measuresAfter = await getMeasures({ db });

            expect(pagesAfter, "Expect there to be one more page").toHaveLength(
                beforePagesNewArgs.length + 1 + 1, // 1 for the first page, 1 for the new page,
            );
            const newMeasuresExpectedNumber = Math.ceil(
                workspaceSettings.defaultNewPageCounts /
                    workspaceSettings.defaultBeatsPerMeasure,
            );
            expect(
                measuresAfter,
                "Expect there to be the expected number of measures",
            ).toHaveLength(newMeasuresExpectedNumber);
            const newBeatsExpectedNumber =
                newMeasuresExpectedNumber *
                workspaceSettings.defaultBeatsPerMeasure;
            expect(
                beatsAfter,
                "Expect there to be the expected number of beats",
            ).toHaveLength(
                beforeBeatsNewArgs.length + newBeatsExpectedNumber + 1, // + 1 for the first beat
            );

            // Assert the next page has the correct start beat
            const expectedBeat = await db.query.beats.findFirst({
                where: eq(schema.beats.position, expectedNextPosition),
            });
            assert(expectedBeat != null, "Expected beat not found");
            const allPages = await db.query.pages.findMany({
                orderBy: asc(schema.pages.id),
            });
            // Not the best way to find last page, but should work in this case
            const lastPage = allPages[allPages.length - 1];
            expect(
                lastPage.start_beat,
                "Expect the last page to have the correct start beat",
            ).toBe(expectedBeat.id);
        });
    });
});
