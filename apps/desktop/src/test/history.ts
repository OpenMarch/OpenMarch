import { expect, TestAPI } from "vitest";
import { DbTestAPI } from "./base";
import { getTableName, Table } from "drizzle-orm";
import {
    performRedo,
    performUndo,
} from "../../electron/database/database.history";

/**
 * A fixture that tests the undo and redo functionality of the database.
 *
 * This fixture automatically collects the data before and after the test and checks that the data is the same after the test.
 * It also tests that the undo and redo functionality works multiple times.
 *
 * @param it - The test API
 * @returns
 */
export const getTestWithHistory = <T extends DbTestAPI>(
    it: TestAPI<T>,
    tablesToCheck: Table[],
    numberOfTimesToTestUndoAndRedo: number = 3,
) =>
    it.extend<{
        testUndoRedo: void;
    }>({
        testUndoRedo: [
            async ({ db }, use) => {
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
                    // Check that the data is the same
                    expect(beforeTestsData).not.toEqual(afterTestsData);

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
                        expect(dataAfterUndo).toEqual(beforeTestsData);

                        // Test that the redo works
                        for (let i = 0; i < numberOfChanges; i++)
                            await performRedo(db as unknown as any);

                        const dataAfterRedo = await collectData();
                        expect(dataAfterRedo).toEqual(afterTestsData);
                    }
                } else {
                    // (numberOfChanges === 0)
                    // Check that the data not different if there are no changes
                    expect(beforeTestsData).toEqual(afterTestsData);
                }
            },
            { auto: true },
        ],
    });
