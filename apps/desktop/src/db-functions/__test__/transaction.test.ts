import { DbConnection, describeDbTests, schema } from "@/test/base";
import Database from "libsql";
import { inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DbTransaction } from "../types";

describe("validate transaction functionality", () => {
    describe("raw drivers", () => {
        describe("better-sqlite3", () => {
            it("should throw an error if the transaction fails", async () => {
                const db = new Database(":memory:");
                db.exec("CREATE TABLE test (name TEXT NOT NULL)");
                const getValues: () => { name: string }[] = () => {
                    return db.prepare("SELECT name FROM test").all() as {
                        name: string;
                    }[];
                };
                const insertStatement = db.prepare(
                    "INSERT INTO test (name) VALUES (?)",
                );
                expect(
                    getValues(),
                    "Expected 0 rows in test table",
                ).toHaveLength(0);

                // Execute a function without error
                insertStatement.run("test value");
                expect(
                    getValues(),
                    "Expected 1 row in test table",
                ).toHaveLength(1);
                expect(
                    getValues(),
                    "Expected 'test value' in name column",
                ).toEqual([{ name: "test value" }]);

                // Execute a transaction without error
                db.transaction(() => {
                    insertStatement.run("test value 2");
                })();
                expect(
                    getValues(),
                    "Expected 2 rows in test table",
                ).toHaveLength(2);
                expect(
                    getValues(),
                    "Expected 'test value' in name column",
                ).toEqual([{ name: "test value" }, { name: "test value 2" }]);

                const validateStateDidNotChange = (message?: string) => {
                    expect(
                        getValues(),
                        message ?? "Expected 2 rows in test table",
                    ).toHaveLength(2);
                    expect(
                        getValues(),
                        message ?? "Expected 'test value' in name column",
                    ).toEqual([
                        { name: "test value" },
                        { name: "test value 2" },
                    ]);
                };

                // Execute a function with an error
                expect(() => insertStatement.run(null)).toThrow();
                validateStateDidNotChange(
                    "Expected state to not change after error in single db function",
                );

                // Execute a transaction with an error
                expect(() =>
                    db.transaction(() => insertStatement.run(null))(),
                ).toThrow();
                validateStateDidNotChange(
                    "Expected state to not change after error in transaction",
                );

                // Execute a transaction with many statements that should be rolled back
                expect(() =>
                    db.transaction(() => {
                        insertStatement.run("this value should be reverted");
                        insertStatement.run(
                            "test value should also be reverted",
                        );
                        throw new Error("test error");
                    })(),
                ).toThrow();
                validateStateDidNotChange(
                    "Expected state to not change after error in transaction with many statements",
                );

                // Execute a transaction with many statements that should be rolled back
                expect(() =>
                    db.transaction(() => {
                        insertStatement.run("this value should be reverted");
                        insertStatement.run(
                            "test value should also be reverted",
                        );
                        // Triggers an error
                        insertStatement.run(null);
                        insertStatement.run(
                            "this value should never be reached",
                        );
                    })(),
                ).toThrow();
                validateStateDidNotChange(
                    "Expected state to not change after database error in transaction with many statements",
                );
            });
        });
    });

    describeDbTests("drizzle", (itWithDb) => {
        itWithDb(
            "should properly rollback changes on error",
            async ({ db }) => {
                const insertBeat = async (duration: number | null = 0.5) =>
                    await db.insert(schema.beats).values({
                        duration: duration as number,
                        position: 1,
                    });

                const getBeats = async () =>
                    await db.select().from(schema.beats);
                const startBeats = await getBeats();
                // insert a valid beat to ensure db works
                await insertBeat();
                const endBeats = await getBeats();
                expect(endBeats).toHaveLength(startBeats.length + 1);

                const validateStateDidNotChange = async (message?: string) => {
                    const currentBeats = await getBeats();
                    expect(currentBeats, message).toHaveLength(endBeats.length);
                    expect(
                        currentBeats[currentBeats.length - 1].position,
                        message,
                    ).toBe(1);
                    expect(
                        currentBeats[currentBeats.length - 1].duration,
                        message,
                    ).toBe(0.5);
                };

                await validateStateDidNotChange();

                // Ensure basic error does not change state
                await expect(() => insertBeat(null)).rejects.toThrow();
                await validateStateDidNotChange(
                    "Basic error should not change db values",
                );

                // Ensure basic error in transaction does not change state
                await expect(
                    db.transaction(() => insertBeat(null)),
                ).rejects.toThrow();
                await validateStateDidNotChange(
                    "Basic error in transaction should not change db values",
                );

                // Ensure error in transaction with many statements does not change state
                await expect(
                    db.transaction(async () => {
                        await insertBeat(0.5);
                        await insertBeat(0.5);
                        throw new Error("test error");
                    }),
                ).rejects.toThrow();
                await validateStateDidNotChange(
                    "Error in transaction with many statements should not change db values",
                );

                // Expect transaction to successfully add values
                await db.transaction(async () => {
                    await insertBeat(0.5);
                    await insertBeat(0.5);
                });
                const beatsAfterSuccessfulTransaction = await getBeats();
                expect(beatsAfterSuccessfulTransaction).toHaveLength(
                    endBeats.length + 2,
                );
                // delete the last two beats
                const beatsToDelete = beatsAfterSuccessfulTransaction.slice(-2);
                await db.delete(schema.beats).where(
                    inArray(
                        schema.beats.id,
                        beatsToDelete.map((beat) => beat.id),
                    ),
                );
                const beatsAfterDeletion = await getBeats();
                expect(beatsAfterDeletion).toHaveLength(endBeats.length);

                // Ensure error in transaction with many statements does not change state
                await expect(
                    db.transaction(async () => {
                        await insertBeat(0.5);
                        await insertBeat(0.5);
                        // Triggers an error
                        await insertBeat(null);
                        await insertBeat(0.5);
                    }),
                ).rejects.toThrow();
                await validateStateDidNotChange(
                    "Error in transaction with many statements and database error should not change db values",
                );
            },
        );
        itWithDb(
            "should properly rollback changes on error with tx variable",
            async ({ db }) => {
                const insertBeat = async (
                    tx: DbConnection | DbTransaction,
                    duration: number | null = 0.5,
                ) =>
                    await tx.insert(schema.beats).values({
                        duration: duration as number,
                        position: 1,
                    });

                const getBeats = async () =>
                    await db.select().from(schema.beats);
                const startBeats = await getBeats();
                // insert a valid beat to ensure db works
                await insertBeat(db);
                const endBeats = await getBeats();
                expect(endBeats).toHaveLength(startBeats.length + 1);

                const validateStateDidNotChange = async (message?: string) => {
                    const currentBeats = await getBeats();
                    expect(currentBeats, message).toHaveLength(endBeats.length);
                    expect(
                        currentBeats[currentBeats.length - 1].position,
                        message,
                    ).toBe(1);
                    expect(
                        currentBeats[currentBeats.length - 1].duration,
                        message,
                    ).toBe(0.5);
                };

                await validateStateDidNotChange();

                // Ensure basic error does not change state
                await expect(() => insertBeat(db, null)).rejects.toThrow();
                await validateStateDidNotChange(
                    "Basic error should not change db values",
                );

                // Ensure basic error in transaction does not change state
                await expect(
                    db.transaction(() => insertBeat(db, null)),
                ).rejects.toThrow();
                await validateStateDidNotChange(
                    "Basic error in transaction should not change db values",
                );

                // Expect transaction to successfully add values
                await db.transaction(async (tx) => {
                    await insertBeat(tx, 0.5);
                    await insertBeat(tx, 0.5);
                });
                const beatsAfterSuccessfulTransaction = await getBeats();
                expect(beatsAfterSuccessfulTransaction).toHaveLength(
                    endBeats.length + 2,
                );
                // delete the last two beats
                const beatsToDelete = beatsAfterSuccessfulTransaction.slice(-2);
                await db.delete(schema.beats).where(
                    inArray(
                        schema.beats.id,
                        beatsToDelete.map((beat) => beat.id),
                    ),
                );
                const beatsAfterDeletion = await getBeats();
                expect(beatsAfterDeletion).toHaveLength(endBeats.length);

                // Ensure error in transaction with many statements does not change state
                await expect(
                    db.transaction(async (tx) => {
                        await insertBeat(tx, 0.5);
                        await insertBeat(tx, 0.5);
                        throw new Error("test error");
                    }),
                ).rejects.toThrow();
                await validateStateDidNotChange(
                    "Error in transaction with many statements should not change db values",
                );

                // Ensure error in transaction with many statements does not change state
                await expect(
                    db.transaction(async (tx) => {
                        await insertBeat(tx, 0.5);
                        await insertBeat(tx, 0.5);
                        // Triggers an error
                        await insertBeat(tx, null);
                        await insertBeat(tx, 0.5);
                    }),
                ).rejects.toThrow();
                await validateStateDidNotChange(
                    "Error in transaction with many statements and database error should not change db values",
                );
            },
        );
    });
});
