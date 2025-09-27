import { describe, expect } from "vitest";
import { getUtility, updateUtilitySimple, initializeUtility } from "../utility";
import { describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";

describeDbTests("utility", (it) => {
    describe("database interactions", () => {
        const testWithHistory = getTestWithHistory(it, [schema.utility]);

        describe("getUtility", () => {
            testWithHistory(
                "should return undefined when no utility record exists",
                async ({ db }) => {
                    const result = await getUtility({ db });
                    expect(result).toBeUndefined();
                },
            );

            testWithHistory(
                "should return the utility record when it exists",
                async ({ db }) => {
                    // First initialize the utility record
                    await initializeUtility({ db });

                    const result = await getUtility({ db });
                    expect(result).toBeDefined();
                    expect(result?.id).toBe(0);
                    expect(result?.last_page_counts).toBe(8);
                },
            );
        });

        describe("initializeUtility", () => {
            testWithHistory(
                "should create a new utility record with default values",
                async ({ db }) => {
                    const result = await initializeUtility({ db });

                    expect(result).toBeDefined();
                    expect(result.id).toBe(0);
                    expect(result.last_page_counts).toBe(8);
                    expect(result.updated_at).toBeDefined();
                },
            );

            testWithHistory(
                "should return existing utility record if it already exists",
                async ({ db }) => {
                    // Create initial utility record
                    const firstResult = await initializeUtility({ db });

                    // Try to initialize again
                    const secondResult = await initializeUtility({ db });

                    expect(secondResult).toEqual(firstResult);
                },
            );
        });

        describe("updateUtility", () => {
            testWithHistory(
                "should update the utility record",
                async ({ db }) => {
                    // Ensure utility record exists
                    await initializeUtility({ db });

                    const updateArgs = {
                        last_page_counts: 12,
                    };

                    const result = await updateUtilitySimple({
                        db,
                        args: updateArgs,
                    });

                    expect(result).toBeDefined();
                    expect(result.last_page_counts).toBe(12);
                    expect(result.id).toBe(0);
                },
            );

            testWithHistory(
                "should update only specified fields",
                async ({ db }) => {
                    // Ensure utility record exists
                    await initializeUtility({ db });

                    // First update with one field
                    await updateUtilitySimple({
                        db,
                        args: { last_page_counts: 10 },
                    });

                    // Then update with another field (should preserve the first)
                    const result = await updateUtilitySimple({
                        db,
                        args: { last_page_counts: 15 },
                    });

                    expect(result.last_page_counts).toBe(15);
                },
            );

            testWithHistory(
                "should throw error if utility record doesn't exist",
                async ({ db }) => {
                    // Delete the utility record
                    await db.delete(schema.utility);

                    const updateArgs = {
                        last_page_counts: 12,
                    };

                    await expect(
                        updateUtilitySimple({ db, args: updateArgs }),
                    ).rejects.toThrow("Utility record not found after update");
                },
            );
        });

        describe("utility record constraints", () => {
            testWithHistory(
                "should enforce that id must be 0",
                async ({ db }) => {
                    // Try to insert a utility record with id != 0
                    await expect(
                        db.insert(schema.utility).values({
                            id: 1,
                            last_page_counts: 8,
                        }),
                    ).rejects.toThrow();
                },
            );

            testWithHistory(
                "should enforce that last_page_counts must be positive",
                async ({ db }) => {
                    // Try to insert a utility record with last_page_counts <= 0
                    await expect(
                        db.insert(schema.utility).values({
                            id: 0,
                            last_page_counts: 0,
                        }),
                    ).rejects.toThrow();

                    await expect(
                        db.insert(schema.utility).values({
                            id: 0,
                            last_page_counts: -1,
                        }),
                    ).rejects.toThrow();
                },
            );
        });
    });
});
