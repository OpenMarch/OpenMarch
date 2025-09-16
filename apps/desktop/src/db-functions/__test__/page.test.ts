import { describe, expect } from "vitest";
import {
    createPages,
    updatePages,
    deletePages,
    FIRST_PAGE_ID,
    createLastPage,
} from "../page";
import { describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { inArray, desc, eq } from "drizzle-orm";

const subsetBooleanToInteger = (page: any) => {
    return { ...page, is_subset: page.is_subset ? 1 : 0 };
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
        describe.only("insert with no existing pages", () => {
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
                                expectedCreatedPages.length,
                            );
                            expect(new Set(allPages)).toMatchObject(
                                new Set(
                                    expectedCreatedPages.map(
                                        subsetBooleanToInteger,
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
                                expectedCreatedPages.length,
                            );
                            expect(new Set(allPages)).toMatchObject(
                                new Set(
                                    expectedCreatedPages.map(
                                        subsetBooleanToInteger,
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
                        existingPagesArgs
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
                        [...existingPagesArgs, ...newPagesArgs]
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
                        expect(beforeMarcherPages).toHaveLength(0);

                        await createPages({ newPages: newPagesArgs, db });

                        const afterMarcherPages =
                            await db.query.marcher_pages.findMany();
                        const expectedNumberOfMarcherPages =
                            marchers.expectedMarchers.length *
                            newPagesArgs.length;
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
                            existingPagesArgs.length;
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
                            (existingPagesArgs.length + newPagesArgs.length);
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
                            ).toBe(existingPagesArgs.length);

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
                                existingPagesArgs.length -
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
                            ).toBe(existingPagesArgs.length);

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
                                existingPagesArgs.length -
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
    });

    describe("createLastPage", () => {
        testWithHistory.for([
            {
                description: "eight counts",
                newPageCounts: 8,
            },
            {
                description: "nine counts",
                newPageCounts: 9,
            },
            {
                description: "ten counts",
                newPageCounts: 10,
            },
        ])(
            "create last page",
            async (
                { newPageCounts },
                { db, marchersAndPages, expectNumberOfChanges },
            ) => {
                const pagesBeforeCreate = await db.query.pages.findMany();
                expect(pagesBeforeCreate.length).toBe(
                    marchersAndPages.expectedPages.length,
                );

                const utilityBeforeCreate = await db.query.utility.findFirst()!;
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
                const utilityAfterCreate = await db.query.utility.findFirst()!;
                expect(utilityAfterCreate).toBeDefined();
                expect(utilityAfterCreate?.last_page_counts).toEqual(
                    newPageCounts,
                );

                await expectNumberOfChanges.test(db, 1, databaseState);
            },
        );
        testWithHistory.for([
            {
                description: "too many counts",
                newPageCounts: 1000,
            },
        ])(
            "create last page with failure",
            async (
                { newPageCounts },
                { db, marchersAndPages, expectNumberOfChanges },
            ) => {
                const pagesBeforeCreate = await db.query.pages.findMany();
                expect(pagesBeforeCreate.length).toBe(
                    marchersAndPages.expectedPages.length,
                );
                const databaseState =
                    await expectNumberOfChanges.getDatabaseState(db);

                await expect(
                    createLastPage({
                        db,
                        newPageCounts,
                    }),
                ).rejects.toThrow();
                await expectNumberOfChanges.test(db, 0, databaseState);
            },
        );
    });
});
