import { describe, expect } from "vitest";
import {
    createMarchers,
    updateMarchers,
    deleteMarchers,
    getMarchers,
} from "../marcher";
import { describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { inArray } from "drizzle-orm";

describeDbTests("marchers", (it) => {
    describe("database interactions", () => {
        const testWithHistory = getTestWithHistory(it, [
            schema.marchers,
            schema.marcher_pages,
            schema.pages,
            schema.beats,
        ]);

        describe("getMarchers", () => {
            testWithHistory(
                "returns empty array when no marchers exist",
                async ({ db, expectNumberOfChanges }) => {
                    const result = await getMarchers({ db });
                    expect(result).toEqual([]);
                    await expectNumberOfChanges.test(db, 0);
                },
            );

            testWithHistory(
                "returns all marchers when they exist",
                async ({ db, marchers, expectNumberOfChanges }) => {
                    const sort = (a: { id: number }, b: { id: number }) =>
                        a.id - b.id;
                    const result = await getMarchers({ db });
                    expect(result).toHaveLength(
                        marchers.expectedMarchers.length,
                    );
                    expect(result.sort(sort)).toMatchObject(
                        marchers.expectedMarchers.sort(sort),
                    );
                    await expectNumberOfChanges.test(db, 0);
                },
            );
        });

        describe("createMarchers", () => {
            describe("insert with no existing marchers", () => {
                describe.each([
                    {
                        description: "Single marcher",
                        newMarchers: [
                            {
                                name: "John Doe",
                                section: "Trumpet",
                                drill_prefix: "T",
                                drill_order: 1,
                                year: "2024",
                                notes: null,
                            },
                        ],
                    },
                    {
                        description: "Single marcher with notes",
                        newMarchers: [
                            {
                                name: "Jane Smith",
                                section: "Mellophone",
                                drill_prefix: "M",
                                drill_order: 1,
                                year: "2024",
                                notes: "Section leader",
                            },
                        ],
                    },
                    {
                        description: "Multiple marchers",
                        newMarchers: [
                            {
                                name: "Alice Johnson",
                                section: "Trumpet",
                                drill_prefix: "T",
                                drill_order: 1,
                                year: "2024",
                                notes: null,
                            },
                            {
                                name: "Bob Wilson",
                                section: "Trumpet",
                                drill_prefix: "T",
                                drill_order: 2,
                                year: "2023",
                                notes: "Veteran member",
                            },
                            {
                                name: "Charlie Brown",
                                section: "Baritone",
                                drill_prefix: "B",
                                drill_order: 1,
                                year: "2024",
                                notes: null,
                            },
                        ],
                    },
                    {
                        description: "Many marchers with various sections",
                        newMarchers: [
                            {
                                name: "Trumpet 1",
                                section: "Trumpet",
                                drill_prefix: "T",
                                drill_order: 1,
                                year: "2024",
                                notes: null,
                            },
                            {
                                name: "Trumpet 2",
                                section: "Trumpet",
                                drill_prefix: "T",
                                drill_order: 2,
                                year: "2024",
                                notes: null,
                            },
                            {
                                name: "Mello 1",
                                section: "Mellophone",
                                drill_prefix: "M",
                                drill_order: 1,
                                year: "2023",
                                notes: "Section leader",
                            },
                            {
                                name: "Bari 1",
                                section: "Baritone",
                                drill_prefix: "B",
                                drill_order: 1,
                                year: "2024",
                                notes: null,
                            },
                            {
                                name: "Tuba 1",
                                section: "Tuba",
                                drill_prefix: "U",
                                drill_order: 1,
                                year: "2022",
                                notes: "Veteran",
                            },
                        ],
                    },
                ])(
                    "%# successfully create atomic marchers - $description",
                    ({ newMarchers }) => {
                        testWithHistory(
                            "Create marchers as one action",
                            async ({ db, expectNumberOfChanges }) => {
                                const expectedCreatedMarchers = newMarchers.map(
                                    (newMarcher, index) => ({
                                        ...newMarcher,
                                        id: index + 1,
                                    }),
                                );

                                const result = await createMarchers({
                                    newMarchers,
                                    db,
                                });
                                expect(new Set(result)).toMatchObject(
                                    new Set(expectedCreatedMarchers),
                                );

                                const allMarchers =
                                    await db.query.marchers.findMany();
                                expect(allMarchers.length).toEqual(
                                    expectedCreatedMarchers.length,
                                );
                                expect(new Set(allMarchers)).toMatchObject(
                                    new Set(expectedCreatedMarchers),
                                );
                                await expectNumberOfChanges.test(db, 1);
                            },
                        );

                        testWithHistory(
                            "Create marchers as many actions",
                            async ({ db, expectNumberOfChanges }) => {
                                const expectedCreatedMarchers = newMarchers.map(
                                    (newMarcher, index) => ({
                                        ...newMarcher,
                                        id: index + 1,
                                    }),
                                );

                                for (const newMarcher of newMarchers) {
                                    await createMarchers({
                                        newMarchers: [newMarcher],
                                        db,
                                    });
                                }

                                const allMarchers =
                                    await db.query.marchers.findMany();
                                expect(allMarchers.length).toEqual(
                                    expectedCreatedMarchers.length,
                                );
                                expect(new Set(allMarchers)).toMatchObject(
                                    new Set(expectedCreatedMarchers),
                                );
                                // Expect that each marcher creation is a separate change on the undo stack
                                await expectNumberOfChanges.test(
                                    db,
                                    newMarchers.length,
                                );
                            },
                        );
                    },
                );
            });

            describe("insert with existing marchers", () => {
                testWithHistory.for([
                    {
                        description: "Add single marcher to existing marchers",
                        existingMarchersArgs: [
                            {
                                name: "Existing Marcher",
                                section: "Trumpet",
                                drill_prefix: "T",
                                drill_order: 1,
                                year: "2024",
                                notes: null,
                            },
                        ],
                        newMarchersArgs: [
                            {
                                name: "New Marcher",
                                section: "Mellophone",
                                drill_prefix: "M",
                                drill_order: 1,
                                year: "2024",
                                notes: null,
                            },
                        ],
                    },
                    {
                        description:
                            "Add multiple marchers to existing marchers",
                        existingMarchersArgs: [
                            {
                                name: "Existing 1",
                                section: "Trumpet",
                                drill_prefix: "T",
                                drill_order: 1,
                                year: "2024",
                                notes: null,
                            },
                            {
                                name: "Existing 2",
                                section: "Trumpet",
                                drill_prefix: "T",
                                drill_order: 2,
                                year: "2024",
                                notes: null,
                            },
                        ],
                        newMarchersArgs: [
                            {
                                name: "New 1",
                                section: "Mellophone",
                                drill_prefix: "M",
                                drill_order: 1,
                                year: "2024",
                                notes: null,
                            },
                            {
                                name: "New 2",
                                section: "Baritone",
                                drill_prefix: "B",
                                drill_order: 1,
                                year: "2023",
                                notes: "Transfer student",
                            },
                        ],
                    },
                ])(
                    "%# - $description",
                    async (
                        { existingMarchersArgs, newMarchersArgs },
                        { db, expectNumberOfChanges },
                    ) => {
                        const createdExistingMarchers = await createMarchers({
                            newMarchers: existingMarchersArgs,
                            db,
                        });
                        const existingMarchers =
                            await db.query.marchers.findMany();
                        const databaseState =
                            await expectNumberOfChanges.getDatabaseState(db);

                        expect(existingMarchers).toMatchObject(
                            existingMarchersArgs,
                        );
                        expect(createdExistingMarchers).toMatchObject(
                            existingMarchersArgs,
                        );

                        const createdNewMarchers = await createMarchers({
                            newMarchers: newMarchersArgs,
                            db,
                        });
                        const allMarchers = await db.query.marchers.findMany();

                        expect(allMarchers.length).toEqual(
                            existingMarchersArgs.length +
                                newMarchersArgs.length,
                        );
                        expect(createdNewMarchers).toMatchObject(
                            newMarchersArgs,
                        );

                        await expectNumberOfChanges.test(db, 1, databaseState);
                    },
                );
            });

            describe("With pages", () => {
                describe("insert without existing marchers", () => {
                    testWithHistory.for([
                        {
                            description: "single marcher",
                            newMarchersArgs: [
                                {
                                    name: "Test Marcher",
                                    section: "Trumpet",
                                    drill_prefix: "T",
                                    drill_order: 1,
                                    year: "2024",
                                    notes: null,
                                },
                            ],
                        },
                        {
                            description: "multiple marchers",
                            newMarchersArgs: [
                                {
                                    name: "Marcher 1",
                                    section: "Trumpet",
                                    drill_prefix: "T",
                                    drill_order: 1,
                                    year: "2024",
                                    notes: null,
                                },
                                {
                                    name: "Marcher 2",
                                    section: "Mellophone",
                                    drill_prefix: "M",
                                    drill_order: 1,
                                    year: "2024",
                                    notes: null,
                                },
                                {
                                    name: "Marcher 3",
                                    section: "Baritone",
                                    drill_prefix: "B",
                                    drill_order: 1,
                                    year: "2023",
                                    notes: "Section leader",
                                },
                            ],
                        },
                    ])(
                        "%# - $description",
                        async (
                            { newMarchersArgs },
                            { db, pages, expectNumberOfChanges },
                        ) => {
                            const beforeMarcherPages =
                                await db.query.marcher_pages.findMany();
                            expect(beforeMarcherPages).toHaveLength(0);

                            await createMarchers({
                                newMarchers: newMarchersArgs,
                                db,
                            });

                            const afterMarcherPages =
                                await db.query.marcher_pages.findMany();
                            const expectedNumberOfMarcherPages =
                                newMarchersArgs.length *
                                pages.expectedPages.length;
                            expect(afterMarcherPages).toHaveLength(
                                expectedNumberOfMarcherPages,
                            );

                            const allMarchers =
                                await db.query.marchers.findMany();
                            const allPages = await db.query.pages.findMany();

                            // Assert there is a marcherPage for every marcher and page combination
                            for (const marcher of allMarchers) {
                                for (const page of allPages) {
                                    const marcherPage = afterMarcherPages.find(
                                        (marcherPage) =>
                                            marcherPage.marcher_id ===
                                                marcher.id &&
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

                describe("insert with existing marchers", () => {
                    testWithHistory.for([
                        {
                            description:
                                "add single marcher with existing marchers and pages",
                            existingMarchersArgs: [
                                {
                                    name: "Existing Marcher",
                                    section: "Trumpet",
                                    drill_prefix: "T",
                                    drill_order: 1,
                                    year: "2024",
                                    notes: null,
                                },
                            ],
                            newMarchersArgs: [
                                {
                                    name: "New Marcher",
                                    section: "Mellophone",
                                    drill_prefix: "M",
                                    drill_order: 1,
                                    year: "2024",
                                    notes: null,
                                },
                            ],
                        },
                        {
                            description:
                                "add multiple marchers with existing marchers and pages",
                            existingMarchersArgs: [
                                {
                                    name: "Existing 1",
                                    section: "Trumpet",
                                    drill_prefix: "T",
                                    drill_order: 1,
                                    year: "2024",
                                    notes: null,
                                },
                                {
                                    name: "Existing 2",
                                    section: "Trumpet",
                                    drill_prefix: "T",
                                    drill_order: 2,
                                    year: "2024",
                                    notes: null,
                                },
                            ],
                            newMarchersArgs: [
                                {
                                    name: "New 1",
                                    section: "Mellophone",
                                    drill_prefix: "M",
                                    drill_order: 1,
                                    year: "2024",
                                    notes: null,
                                },
                                {
                                    name: "New 2",
                                    section: "Baritone",
                                    drill_prefix: "B",
                                    drill_order: 1,
                                    year: "2023",
                                    notes: "Transfer",
                                },
                            ],
                        },
                    ])(
                        "%# - $description",
                        async (
                            { existingMarchersArgs, newMarchersArgs },
                            { db, pages, expectNumberOfChanges },
                        ) => {
                            // Create existing marchers first
                            await createMarchers({
                                newMarchers: existingMarchersArgs,
                                db,
                            });

                            // Verify existing marcher pages were created
                            const beforeMarcherPages =
                                await db.query.marcher_pages.findMany();
                            const expectedExistingMarcherPages =
                                existingMarchersArgs.length *
                                pages.expectedPages.length;
                            expect(beforeMarcherPages).toHaveLength(
                                expectedExistingMarcherPages,
                            );

                            const databaseState =
                                await expectNumberOfChanges.getDatabaseState(
                                    db,
                                );

                            // Create new marchers
                            await createMarchers({
                                newMarchers: newMarchersArgs,
                                db,
                            });

                            // Verify all marcher pages were created
                            const afterMarcherPages =
                                await db.query.marcher_pages.findMany();
                            const expectedTotalMarcherPages =
                                (existingMarchersArgs.length +
                                    newMarchersArgs.length) *
                                pages.expectedPages.length;
                            expect(afterMarcherPages).toHaveLength(
                                expectedTotalMarcherPages,
                            );

                            const allMarchers =
                                await db.query.marchers.findMany();
                            const allPages = await db.query.pages.findMany();

                            // Assert there is a marcherPage for every marcher and page combination
                            for (const marcher of allMarchers) {
                                for (const page of allPages) {
                                    const marcherPage = afterMarcherPages.find(
                                        (marcherPage) =>
                                            marcherPage.marcher_id ===
                                                marcher.id &&
                                            marcherPage.page_id === page.id,
                                    );
                                    expect(
                                        marcherPage,
                                        `marcherPage for marcher ${marcher.id} and page ${page.id} should be defined`,
                                    ).toBeDefined();
                                }
                            }
                            await expectNumberOfChanges.test(
                                db,
                                1,
                                databaseState,
                            );
                        },
                    );
                });
            });
        });

        describe("updateMarchers", () => {
            describe.each([
                {
                    description: "updates single marcher",
                    existingMarchersArgs: [
                        {
                            name: "Original Name",
                            section: "Trumpet",
                            drill_prefix: "T",
                            drill_order: 1,
                            year: "2024",
                            notes: "Original notes",
                        },
                    ],
                    modifiedMarchersArgs: [
                        {
                            id: 1,
                            name: "Updated Name",
                            section: "Mellophone",
                            drill_prefix: "M",
                            drill_order: 2,
                            year: "2023",
                            notes: "Updated notes",
                        },
                    ],
                    expectedUpdatedMarchers: [
                        {
                            id: 1,
                            name: "Updated Name",
                            section: "Mellophone",
                            drill_prefix: "M",
                            drill_order: 2,
                            year: "2023",
                            notes: "Updated notes",
                        },
                    ],
                    isChangeExpected: true,
                },
                {
                    description: "updates multiple marchers",
                    existingMarchersArgs: [
                        {
                            name: "Marcher 1",
                            section: "Trumpet",
                            drill_prefix: "T",
                            drill_order: 1,
                            year: "2024",
                            notes: "Original 1",
                        },
                        {
                            name: "Marcher 2",
                            section: "Mellophone",
                            drill_prefix: "M",
                            drill_order: 1,
                            year: "2024",
                            notes: "Original 2",
                        },
                        {
                            name: "Marcher 3",
                            section: "Baritone",
                            drill_prefix: "B",
                            drill_order: 1,
                            year: "2024",
                            notes: "Do not touch",
                        },
                    ],
                    modifiedMarchersArgs: [
                        {
                            id: 1,
                            name: "Updated Marcher 1",
                            notes: "Updated notes 1",
                        },
                        {
                            id: 2,
                            section: "Tuba",
                            drill_prefix: "U",
                            drill_order: 5,
                        },
                    ],
                    expectedUpdatedMarchers: [
                        {
                            id: 1,
                            name: "Updated Marcher 1",
                            section: "Trumpet",
                            drill_prefix: "T",
                            drill_order: 1,
                            year: "2024",
                            notes: "Updated notes 1",
                        },
                        {
                            id: 2,
                            name: "Marcher 2",
                            section: "Tuba",
                            drill_prefix: "U",
                            drill_order: 5,
                            year: "2024",
                            notes: "Original 2",
                        },
                    ],
                    isChangeExpected: true,
                },
                {
                    description:
                        "should not update values if undefined in modifiedMarchersArgs",
                    existingMarchersArgs: [
                        {
                            name: "Test Marcher",
                            section: "Trumpet",
                            drill_prefix: "T",
                            drill_order: 1,
                            year: "2024",
                            notes: "Original notes",
                        },
                    ],
                    modifiedMarchersArgs: [
                        {
                            id: 1,
                            name: undefined,
                            section: "Jeff",
                            drill_prefix: undefined,
                            drill_order: undefined,
                            year: undefined,
                            notes: undefined,
                        },
                    ],
                    expectedUpdatedMarchers: [
                        {
                            id: 1,
                            name: "Test Marcher",
                            section: "Jeff",
                            drill_prefix: "T",
                            drill_order: 1,
                            year: "2024",
                            notes: "Original notes",
                        },
                    ],
                    isChangeExpected: true,
                },
                {
                    description:
                        "should update values if null in modifiedMarchersArgs",
                    existingMarchersArgs: [
                        {
                            name: "Test Marcher",
                            section: "Trumpet",
                            drill_prefix: "T",
                            drill_order: 1,
                            year: "2024",
                            notes: "Original notes",
                        },
                    ],
                    modifiedMarchersArgs: [
                        {
                            id: 1,
                            name: null,
                            year: null,
                            notes: null,
                        },
                    ],
                    expectedUpdatedMarchers: [
                        {
                            id: 1,
                            name: null,
                            section: "Trumpet",
                            drill_prefix: "T",
                            drill_order: 1,
                            year: null,
                            notes: null,
                        },
                    ],
                    isChangeExpected: true,
                },
            ])(
                "%# - $description",
                ({
                    existingMarchersArgs,
                    modifiedMarchersArgs,
                    expectedUpdatedMarchers,
                    isChangeExpected,
                }) => {
                    testWithHistory(
                        "update as single action",
                        async ({ db, expectNumberOfChanges }) => {
                            // Create existing marchers first
                            await createMarchers({
                                newMarchers: existingMarchersArgs,
                                db,
                            });

                            const databaseState =
                                await expectNumberOfChanges.getDatabaseState(
                                    db,
                                );

                            // Update the marchers
                            const updateResult = await updateMarchers({
                                modifiedMarchers: modifiedMarchersArgs,
                                db,
                            });

                            expect(updateResult.length).toBe(
                                expectedUpdatedMarchers.length,
                            );
                            expect(
                                updateResult.sort((a, b) => a.id - b.id),
                            ).toMatchObject(
                                expectedUpdatedMarchers.sort(
                                    (a, b) => a.id - b.id,
                                ),
                            );

                            if (isChangeExpected)
                                await expectNumberOfChanges.test(
                                    db,
                                    1,
                                    databaseState,
                                );
                            else
                                await expectNumberOfChanges.test(
                                    db,
                                    0,
                                    databaseState,
                                );
                        },
                    );

                    testWithHistory(
                        "update as multiple actions",
                        async ({ db, expectNumberOfChanges }) => {
                            // Create existing marchers first
                            await createMarchers({
                                newMarchers: existingMarchersArgs,
                                db,
                            });

                            const databaseState =
                                await expectNumberOfChanges.getDatabaseState(
                                    db,
                                );

                            // Update the marchers individually
                            for (const modifiedMarcher of modifiedMarchersArgs) {
                                await updateMarchers({
                                    modifiedMarchers: [modifiedMarcher],
                                    db,
                                });
                            }

                            const updateMarcherIds = modifiedMarchersArgs.map(
                                (modifiedMarcher) => modifiedMarcher.id,
                            );

                            const updatedMarchers =
                                await db.query.marchers.findMany({
                                    where: inArray(
                                        schema.marchers.id,
                                        updateMarcherIds,
                                    ),
                                });

                            expect(updatedMarchers.length).toBe(
                                expectedUpdatedMarchers.length,
                            );
                            expect(
                                updatedMarchers.sort((a, b) => a.id - b.id),
                            ).toMatchObject(
                                expectedUpdatedMarchers.sort(
                                    (a, b) => a.id - b.id,
                                ),
                            );

                            if (isChangeExpected)
                                await expectNumberOfChanges.test(
                                    db,
                                    modifiedMarchersArgs.length,
                                    databaseState,
                                );
                            else
                                await expectNumberOfChanges.test(
                                    db,
                                    0,
                                    databaseState,
                                );
                        },
                    );
                },
            );
        });

        describe("deleteMarchers", () => {
            describe.each([
                {
                    description: "delete a single marcher",
                    existingMarchersArgs: [
                        {
                            name: "Marcher 1",
                            section: "Trumpet",
                            drill_prefix: "T",
                            drill_order: 1,
                            year: "2024",
                            notes: "To be deleted",
                        },
                        {
                            name: "Marcher 2",
                            section: "Mellophone",
                            drill_prefix: "M",
                            drill_order: 1,
                            year: "2024",
                            notes: "Keep this one",
                        },
                        {
                            name: "Marcher 3",
                            section: "Baritone",
                            drill_prefix: "B",
                            drill_order: 1,
                            year: "2024",
                            notes: "Keep this one too",
                        },
                    ],
                    marcherIdsToDelete: [1],
                },
                {
                    description: "delete multiple marchers",
                    existingMarchersArgs: [
                        {
                            name: "Marcher 1",
                            section: "Trumpet",
                            drill_prefix: "T",
                            drill_order: 1,
                            year: "2024",
                            notes: "Delete me",
                        },
                        {
                            name: "Marcher 2",
                            section: "Mellophone",
                            drill_prefix: "M",
                            drill_order: 1,
                            year: "2024",
                            notes: "Keep me",
                        },
                        {
                            name: "Marcher 3",
                            section: "Baritone",
                            drill_prefix: "B",
                            drill_order: 1,
                            year: "2024",
                            notes: "Delete me too",
                        },
                        {
                            name: "Marcher 4",
                            section: "Tuba",
                            drill_prefix: "U",
                            drill_order: 1,
                            year: "2024",
                            notes: "Keep me",
                        },
                        {
                            name: "Marcher 5",
                            section: "Trumpet",
                            drill_prefix: "T",
                            drill_order: 2,
                            year: "2024",
                            notes: "Delete me three",
                        },
                    ],
                    marcherIdsToDelete: [1, 3, 5],
                },
                {
                    description: "delete all marchers",
                    existingMarchersArgs: [
                        {
                            name: "Marcher 1",
                            section: "Trumpet",
                            drill_prefix: "T",
                            drill_order: 1,
                            year: "2024",
                            notes: "Delete all",
                        },
                        {
                            name: "Marcher 2",
                            section: "Mellophone",
                            drill_prefix: "M",
                            drill_order: 1,
                            year: "2024",
                            notes: "Delete all",
                        },
                        {
                            name: "Marcher 3",
                            section: "Baritone",
                            drill_prefix: "B",
                            drill_order: 1,
                            year: "2024",
                            notes: "Delete all",
                        },
                    ],
                    marcherIdsToDelete: [1, 2, 3],
                },
            ])(
                "%# - $description",
                ({ marcherIdsToDelete, existingMarchersArgs }) => {
                    testWithHistory(
                        "as single action",
                        async ({ db, expectNumberOfChanges }) => {
                            await createMarchers({
                                newMarchers: existingMarchersArgs,
                                db,
                            });

                            const marchersBeforeDelete =
                                await db.query.marchers.findMany();
                            expect(
                                marchersBeforeDelete.length,
                                "Ensure all the marchers are created",
                            ).toBe(existingMarchersArgs.length);

                            const databaseState =
                                await expectNumberOfChanges.getDatabaseState(
                                    db,
                                );

                            const deleteResult = await deleteMarchers({
                                marcherIds: new Set(marcherIdsToDelete),
                                db,
                            });
                            expect(deleteResult.length).toBe(
                                marcherIdsToDelete.length,
                            );

                            const marchersAfterDelete =
                                await db.query.marchers.findMany();
                            expect(
                                marchersAfterDelete.length,
                                "Ensure the correct number of marchers are deleted",
                            ).toBe(
                                existingMarchersArgs.length -
                                    marcherIdsToDelete.length,
                            );

                            const allMarcherIds = new Set(
                                marchersAfterDelete.map((m) => m.id),
                            );
                            for (const marcherId of marcherIdsToDelete) {
                                expect(
                                    allMarcherIds.has(marcherId),
                                ).toBeFalsy();
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
                        async ({ db, expectNumberOfChanges }) => {
                            await createMarchers({
                                newMarchers: existingMarchersArgs,
                                db,
                            });

                            const marchersBeforeDelete =
                                await db.query.marchers.findMany();
                            expect(
                                marchersBeforeDelete.length,
                                "Ensure all the marchers are created",
                            ).toBe(existingMarchersArgs.length);

                            const databaseState =
                                await expectNumberOfChanges.getDatabaseState(
                                    db,
                                );

                            for (const marcherId of marcherIdsToDelete) {
                                await deleteMarchers({
                                    marcherIds: new Set([marcherId]),
                                    db,
                                });
                            }

                            const marchersAfterDelete =
                                await db.query.marchers.findMany();
                            expect(
                                marchersAfterDelete.length,
                                "Ensure the correct number of marchers are deleted",
                            ).toBe(
                                existingMarchersArgs.length -
                                    marcherIdsToDelete.length,
                            );

                            const allMarcherIds = new Set(
                                marchersAfterDelete.map((m) => m.id),
                            );
                            for (const marcherId of marcherIdsToDelete) {
                                expect(
                                    allMarcherIds.has(marcherId),
                                ).toBeFalsy();
                            }

                            await expectNumberOfChanges.test(
                                db,
                                marcherIdsToDelete.length,
                                databaseState,
                            );
                        },
                    );
                },
            );

            describe("deleteMarchers with existing marcher pages", () => {
                testWithHistory.for([
                    {
                        description: "delete single marcher with pages",
                        marcherIndexesToDelete: [0],
                    },
                    {
                        description: "delete multiple marchers with pages",
                        marcherIndexesToDelete: [0, 1],
                    },
                    {
                        description: "delete all marchers with pages",
                        marcherIndexesToDelete: [0, 1, 2, 4, 5, 9, 10, 17],
                    },
                ])(
                    "%# - $description",
                    async (
                        { marcherIndexesToDelete },
                        { db, marchersAndPages, expectNumberOfChanges },
                    ) => {
                        const idsToDelete = new Set(
                            marcherIndexesToDelete.map(
                                (index) =>
                                    marchersAndPages.expectedMarchers[index].id,
                            ),
                        );

                        // Verify marcher pages were created
                        const beforeMarcherPages =
                            await db.query.marcher_pages.findMany();
                        expect(beforeMarcherPages).toHaveLength(
                            marchersAndPages.expectedMarcherPages.length,
                        );

                        const databaseState =
                            await expectNumberOfChanges.getDatabaseState(db);

                        // Delete marchers
                        await deleteMarchers({
                            marcherIds: idsToDelete,
                            db,
                        });

                        // Verify marchers were deleted
                        const afterMarchers =
                            await db.query.marchers.findMany();
                        expect(afterMarchers).toHaveLength(
                            marchersAndPages.expectedMarchers.length -
                                marcherIndexesToDelete.length,
                        );

                        // Verify marcher pages for deleted marchers were also deleted
                        const afterMarcherPages =
                            await db.query.marcher_pages.findMany();
                        expect(afterMarcherPages).toHaveLength(
                            marchersAndPages.expectedMarcherPages.length -
                                marcherIndexesToDelete.length *
                                    marchersAndPages.expectedPages.length,
                        );

                        // Verify no marcher pages exist for deleted marchers
                        for (const marcherId of idsToDelete) {
                            const marcherPagesForDeletedMarcher =
                                afterMarcherPages.filter(
                                    (mp) => mp.marcher_id === marcherId,
                                );
                            expect(marcherPagesForDeletedMarcher).toHaveLength(
                                0,
                            );
                        }

                        await expectNumberOfChanges.test(db, 1, databaseState);
                    },
                );
            });

            testWithHistory.for([
                // {
                //     description: "Delete no marchers",
                //     realMarcherIdsToDelete: [],
                //     fakeMarcherIdsToDelete: [
                //         7987, 8273623, -1, 123456, 986, 6275.2378, -128.2,
                //     ],
                // },
                {
                    description:
                        "Delete marchers and also provide marchers that don't exist",
                    realMarcherIdsToDelete: [1, 2, 3],
                    fakeMarcherIdsToDelete: [
                        7987, 8273623, -1, 123456, 986, 6275.2378, -128.2,
                    ],
                },
            ])(
                "%# - Should ignore marchers that don't exist",
                async (
                    { realMarcherIdsToDelete, fakeMarcherIdsToDelete },
                    { db, marchersAndPages, expectNumberOfChanges },
                ) => {
                    const marchersBeforeDelete = await db
                        .select()
                        .from(schema.marchers);

                    const deleteIds = new Set([
                        ...realMarcherIdsToDelete,
                        ...fakeMarcherIdsToDelete,
                    ]);

                    await deleteMarchers({
                        marcherIds: deleteIds,
                        db,
                    });

                    const marchersAfterDelete = await db
                        .select()
                        .from(schema.marchers);

                    expect(marchersAfterDelete).toHaveLength(
                        marchersBeforeDelete.length -
                            realMarcherIdsToDelete.length,
                    );
                },
            );
        });
    });
});
