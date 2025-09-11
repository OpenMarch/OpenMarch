import { TestAPI } from "vitest";
import { DbConnection, DbTestAPI } from "./base";
import { getTableName, Table } from "drizzle-orm";
import {
    performRedo,
    performUndo,
} from "../../electron/database/database.history";

const skipHistoryTests = !(process.env.VITEST_ENABLE_HISTORY === "true");
/**
 * A fixture that tests the undo and redo functionality of the database.
 *
 * This fixture automatically collects the data before and after the test and checks that the data is the same after the test.
 * It also tests that the undo and redo functionality works multiple times.
 *
 * ## Reasoning
 *
 * As we write features in OpenMarch and interact with the database, we want to ensure that the undo and redo
 * functionality works as expected in a wide variety of scenarios.
 *
 * Since we can group many database actions together into one "history_group", writing tests to check every exact case
 * can get cumbersome, time-consuming, and hard to maintain.
 *
 * > E.g. There have been cases where I modified a table a little bit and it broke dozens of hyper-specific undo/redo tests.
 *
 * These fixtures are designed to provide a simple way to test the undo and redo functionality, without having to write
 * a lot of code.
 * They work by checking the state of the database before and after the test, and then checking that the undo and
 * redo triggers work as expected and that the data is correct after each action.
 *
 * ## Usage
 *
 * Using the return value from this function rather than "it" or "test" directly from vitest
 * to test the undo functionality.
 *
 * **IMPORTANT** - History tests are disabled by default. This is because they are quite slow. The whole suite may take a few minutes.
 *
 * To enable history tests, set the `VITEST_ENABLE_HISTORY` environment variable to `true`.
 *
 * ```bash
 * VITEST_ENABLE_HISTORY=true vitest run
 * ```
 *
 * ### Setup the test file
 *
 * 1. Import `describeDbTests` to access the temporary database file.
 * 2. Import `getTestWithHistory` to access the testWithHistory fixture.
 * 3. Define the tables to check
 *    - This uses the `schema` object to define the tables to check.
 *    - Other tables in the database will not be checked.
 *    - E.g. `const tablesToCheck = [schema.pages, schema.beats, schema.marchers, schema.marcher_pages]`
 * 4. Use the `getTestWithHistory` function to get the test API that you will use.
 *    - This is used in place of `it` or `test` directly from vitest.
 *
 * ```typescript
 * // use the database connection fixture
 * import { describeDbTests, schema } from "@/test/base";
 * import { getTestWithHistory } from "@/test/history";
 *
 *
 * describeDbTests("my sick and nasty test", (baseTestApi) => {
 *     const tablesToCheck = [schema.pages, schema.beats, schema.marchers, schema.marcher_pages];
 *     // Get the testWithHistory fixture
 *     const testWithHistory = getTestWithHistory(it, tablesToCheck);
 *
 *     testWithHistory("some test", async ({ db }) => {
 *         // ... test code
 *     });
 *     // ... rest of the tests
 * });
 * ```
 *
 *
 * ### Examples
 *
 * #### Testing an atomic database function with any number of changes
 *
 * This is for the case where you want to test with:
 * 1. No pre-existing data
 * 2. Any number of changes (i.e. number of undo groups)
 *
 * All tests run with the `testWithHistory` API automatically have this check run on them.
 * This is useful because it ensures that all expected database actions can be undone and redone.
 *
 * To use this check, you only need to run the test with the `testWithHistory` API.
 * ```typescript
 * // Wrapped in 'describeDbTests'
 * testWithHistory(
 *     "Insert a page",
 *     async ({ db }) => {
 *         const newPages = [{ start_beat: 1, is_subset: false }];
 *         const result = await createPages({ newPages, db });
 *     }
 * );
 * ```
 *
 * #### Testing an atomic database function with a defined number of changes
 *
 * This is for the case where you want to test with:
 * 1. No pre-existing data
 * 2. A specific number of expected changes
 *
 * This check is not run automatically. Rather, you call the function from the 'expectNumberOfChanges' fixture at the
 * end of the test with the number of changes you expect to have been added to the undo stack.
 *
 * ```typescript
 * // Wrapped in 'describeDbTests'
 * testWithHistory(
 *     "Specific database function test with two changes",
 *     // Use the 'expectNumberOfChanges' fixture
 *     async ({ db, expectNumberOfChanges }) => {
 *         const newPages1 = [{ start_beat: 1, is_subset: false }];
 *         const newPages2 = [{ start_beat: 2, is_subset: false }];
 *         const result1 = await createPages({ newPages1, db });
 *         const result2 = await createPages({ newPages2, db });
 *
 *         // Test that exactly 2 changes were made and undo/redo works
 *         // YOU MUST AWAIT THE TEST FUNCTION
 *         await expectNumberOfChanges.test(db, 2);
 *     }
 * );
 * ```
 *
 * This is equally useful for assuring that multiple grouped actions only add one change to the undo stack.
 *
 *  ```typescript
 * // Wrapped in 'describeDbTests'
 * testWithHistory(
 *     "Specific database function test with two changes",
 *     // Use the 'expectNumberOfChanges' fixture
 *     async ({ db, expectNumberOfChanges }) => {
 *         const newPages1 = [{ start_beat: 1, is_subset: false }];
 *         const newPages2 = [{ start_beat: 2, is_subset: false }];
 *         // Use the 'transactionWithHistory' function to group the actions together
 *         transactionWithHistory(db, "test", async (tx) => {
 *             const result1 = await createPages({ newPages1, db });
 *             const result2 = await createPages({ newPages2, db });
 *         });
 *
 *         // Test that exactly 1 change was made and undo/redo works
 *         // YOU MUST AWAIT THE TEST FUNCTION
 *         await expectNumberOfChanges.test(db, 1);
 *     }
 * );
 * ```
 *
 * #### Testing with pre-existing data
 *
 * This is for the case where you want to test with:
 * 1. Pre-existing data
 * 2. A specific number of expected changes
 *
 * ```typescript
 * // Wrapped in 'describeDbTests'
 *     testWithHistory(
 *         "Specific database function test with pre-existing pages",
 *         async ({ db, expectNumberOfChanges }) => {
 *             const existingPages = [{ start_beat: 1, is_subset: false }];
 *             const preRun = await createPages({ newPages1, db });
 *
 *             // Get the database state before the test
 *             const databaseState = await expectNumberOfChanges.getDatabaseState(db);
 *
 *             // Run the test
 *             const result2 = await createPages({ newPages2, db });
 *
 *             // Test that exactly 1 change was made (after the pre-existing data) and undo/redo works
 *             await expectNumberOfChanges.test(db, 1, databaseState);
 *         }
 *     );
 * });
 * ```
 *
 * ### Skipping history tests
 *
 * Running the tests with history can be quite slow, ~600ms per test.
 * To skip the history tests, set the `VITEST_SKIP_HISTORY` environment variable to `true`.
 *
 * ```bash
 * VITEST_SKIP_HISTORY=true vitest run
 * ```
 *
 * Of course, this should only be done during development and never in CI.
 *
 * @param it - The test API
 * @param tablesToCheck - The tables to check the values before and after the test
 * @param numberOfTimesToTestUndoAndRedo - The number of times to test the undo and redo functionality (in a loop)
 * @returns
 */
export const getTestWithHistory = <T extends DbTestAPI>(
    it: TestAPI<T>,
    tablesToCheck: Table[],
    numberOfTimesToTestUndoAndRedo: number = 3,
) =>
    it.extend<{
        testUndoRedo: void;
        expectNumberOfChanges: {
            test: (
                db: DbConnection,
                numberOfChanges: number,
                customData?: {
                    currentUndoGroup: number;
                    expectedData: Record<string, any[]>;
                },
            ) => Promise<void>;
            getDatabaseState: (db: DbConnection) => Promise<{
                expectedData: Record<string, any[]>;
                currentUndoGroup: number;
            }>;
        };
    }>({
        testUndoRedo: [
            async ({ db, expect }, use) => {
                if (skipHistoryTests) {
                    await use();
                    return;
                }
                const startingStats = await db.query.history_stats.findFirst();
                if (!startingStats) throw new Error("Starting stats not found");
                const collectData = async () => {
                    const output: Record<string, any[]> = {};
                    for (const table of tablesToCheck) {
                        output[getTableName(table)] = await db
                            .select()
                            .from(table)
                            .all();
                    }
                    return output;
                };
                const beforeTestsData = await collectData();

                // Run the test
                await use();

                const afterTestsData = await collectData();
                const afterStats = await db.query.history_stats.findFirst();
                if (!afterStats) throw new Error("After stats not found");

                const numberOfChanges =
                    afterStats?.cur_undo_group - startingStats?.cur_undo_group;
                if (numberOfChanges < 0)
                    throw new Error(
                        "Number of changes is negative. This means an undo was triggered in the test.",
                    );
                else if (numberOfChanges > 0) {
                    // Test that the undo and redo work multiple times
                    for (
                        let testNumber = 0;
                        testNumber < numberOfTimesToTestUndoAndRedo;
                        testNumber++
                    ) {
                        // Test that the undo works
                        for (let i = 0; i < numberOfChanges; i++)
                            await performUndo(db as unknown as any);

                        const dataAfterUndo = await collectData();
                        expect(
                            dataAfterUndo,
                            "Data after undo should be the same as before the test",
                        ).toEqual(beforeTestsData);

                        // Test that the redo works
                        for (let i = 0; i < numberOfChanges; i++)
                            await performRedo(db as unknown as any);

                        const dataAfterRedo = await collectData();
                        expect(
                            dataAfterRedo,
                            "Data after redo should be the same as after the test",
                        ).toEqual(afterTestsData);
                    }
                } else {
                    // (numberOfChanges === 0)
                    // Check that the data not different if there are no changes
                    expect(beforeTestsData).toEqual(afterTestsData);
                }
            },
            { auto: true },
        ],
        expectNumberOfChanges: async ({ db, expect }, use) => {
            if (skipHistoryTests) {
                await use({
                    test: async () => {},
                    getDatabaseState: async () => ({
                        expectedData: {},
                        currentUndoGroup: 0,
                    }),
                });
                return;
            }
            const startingStats = await db.query.history_stats.findFirst();
            if (!startingStats) throw new Error("Starting stats not found");

            const collectData = async (connection: DbConnection) => {
                const output: Record<string, any[]> = {};
                for (const table of tablesToCheck) {
                    output[getTableName(table)] = await connection
                        .select()
                        .from(table)
                        .all();
                }
                return output;
            };

            const beforeTestsData = await collectData(db);

            const testUndoRedo = async (
                db: DbConnection,
                numberOfChanges: number,
                customData?: {
                    currentUndoGroup: number;
                    expectedData: Record<string, any[]>;
                },
            ) => {
                const initialData = customData?.expectedData ?? beforeTestsData;
                const afterTestsData = await collectData(db);
                const afterUndoGroup = (
                    await db.query.history_undo.findFirst({
                        columns: { history_group: true },
                        orderBy: (table, { desc }) => desc(table.history_group),
                    })
                )?.history_group;
                const historyStatsUndoGroup = (
                    await db.query.history_stats.findFirst({
                        columns: { cur_undo_group: true },
                        orderBy: (table, { desc }) =>
                            desc(table.cur_undo_group),
                    })
                )?.cur_undo_group!;

                expect(afterUndoGroup).toBeDefined();
                expect(
                    afterUndoGroup === historyStatsUndoGroup ||
                        afterUndoGroup === historyStatsUndoGroup - 1,
                    "After undo group should be the same as the history stats undo group or the history stats undo group - 1",
                ).toBeTruthy();

                if (!afterUndoGroup) throw new Error("After stats not found");

                const startingUndoGroup =
                    customData?.currentUndoGroup ??
                    startingStats?.cur_undo_group;
                const realNumberOfChanges = afterUndoGroup - startingUndoGroup;

                // Only check that the data is different if there are changes
                if (numberOfChanges > 0)
                    expect(
                        initialData,
                        "Data before the test should not be the same before and after the test. Did you provide the wrong number of changes?",
                    ).not.toEqual(afterTestsData);

                expect(
                    numberOfChanges,
                    `There should be exactly ${numberOfChanges} change${numberOfChanges === 1 ? "" : "s"} in the undo stack`,
                ).toEqual(realNumberOfChanges);
                for (
                    let testNumber = 0;
                    testNumber < numberOfTimesToTestUndoAndRedo;
                    testNumber++
                ) {
                    // Test that the undo works
                    for (let i = 0; i < numberOfChanges; i++)
                        await performUndo(db as unknown as any);

                    const dataAfterUndo = await collectData(db);
                    expect(
                        dataAfterUndo,
                        `UNDO #${testNumber + 1} - ` +
                            "Data after undo should be the same as before the test",
                    ).toEqual(initialData);

                    // Test that the redo works
                    for (let i = 0; i < numberOfChanges; i++)
                        await performRedo(db as unknown as any);
                    const dataAfterRedo = await collectData(db);
                    expect(
                        dataAfterRedo,
                        `REDO #${testNumber + 1} - ` +
                            "Data after redo should be the same as after the test",
                    ).toEqual(afterTestsData);
                }
            };

            const getDatabaseState = async (db: DbConnection) => {
                const currentUndoGroup = (
                    await db.query.history_stats.findFirst()
                )?.cur_undo_group;
                if (currentUndoGroup == null)
                    throw new Error("Current undo group not found");
                const data = await collectData(db);
                return {
                    expectedData: data,
                    currentUndoGroup,
                };
            };

            await use({
                test: testUndoRedo,
                getDatabaseState,
            });
        },
    });
