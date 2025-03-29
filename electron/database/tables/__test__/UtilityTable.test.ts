import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
    getUtilityRecord,
    updateUtilityRecord,
    UTILITY_RECORD_ID,
    DatabaseUtility,
    ModifiedDatabaseUtility,
} from "../UtilityTable";
import Constants from "../../../../src/global/Constants";
import { initTestDatabase } from "./testUtils";

describe("UtilityTable", () => {
    let db: Database.Database;

    beforeEach(() => {
        // Create in-memory database
        db = initTestDatabase();

        // Ensure the utility table exists with a default record
        db.exec(`
            CREATE TABLE IF NOT EXISTS "${Constants.UtilityTableName}" (
                id INTEGER PRIMARY KEY CHECK (id = 0),
                last_page_counts INTEGER
            );

            INSERT OR IGNORE INTO "${Constants.UtilityTableName}" (id, last_page_counts)
            VALUES (0, NULL);
        `);
    });

    afterEach(() => {
        db.close();
    });

    describe("getUtilityRecord", () => {
        it("should retrieve utility record successfully", () => {
            // Set up test data
            db.prepare(
                `
                UPDATE "${Constants.UtilityTableName}"
                SET last_page_counts = 8
                WHERE id = ${UTILITY_RECORD_ID}
            `,
            ).run();

            const result = getUtilityRecord({ db });

            expect(result.success).toBe(true);
            expect(result.data).toEqual({
                id: UTILITY_RECORD_ID,
                last_page_counts: 8,
            });
        });

        it("should handle when utility record has null last_page_counts", () => {
            // Set up test data with null
            db.prepare(
                `
                UPDATE "${Constants.UtilityTableName}"
                SET last_page_counts = NULL
                WHERE id = ${UTILITY_RECORD_ID}
            `,
            ).run();

            const result = getUtilityRecord({ db });

            expect(result.success).toBe(true);
            expect(result.data).toEqual({
                id: UTILITY_RECORD_ID,
                last_page_counts: null,
            });
        });

        it("should not allow deleting the utility record", () => {
            // Remove the utility record
            expect(() => {
                db.prepare(`DELETE FROM "${Constants.UtilityTableName}"`).run();
            }).toThrow("Deletion not allowed for the utility record.");
        });
    });

    describe("updateUtilityRecord", () => {
        it("should update last_page_counts successfully", () => {
            const utilityRecord: ModifiedDatabaseUtility = {
                last_page_counts: 16,
            };

            const result = updateUtilityRecord({
                db,
                utilityRecord,
            });

            expect(result.success).toBe(true);
            expect(result.data).toEqual({
                id: UTILITY_RECORD_ID,
                last_page_counts: 16,
            });

            // Verify the database was updated
            const dbRecord = db
                .prepare(
                    `
                SELECT * FROM "${Constants.UtilityTableName}"
                WHERE id = ${UTILITY_RECORD_ID}
            `,
                )
                .get() as DatabaseUtility;

            expect(dbRecord).toEqual({
                id: UTILITY_RECORD_ID,
                last_page_counts: 16,
            });
        });

        it("should update to null last_page_counts", () => {
            // First set a value
            db.prepare(
                `
                UPDATE "${Constants.UtilityTableName}"
                SET last_page_counts = 8
                WHERE id = ${UTILITY_RECORD_ID}
            `,
            ).run();

            // Then update to null
            const utilityRecord: ModifiedDatabaseUtility = {
                last_page_counts: null,
            };

            const result = updateUtilityRecord({
                db,
                utilityRecord,
            });

            expect(result.success).toBe(true);
            expect(result.data).toEqual({
                id: UTILITY_RECORD_ID,
                last_page_counts: null,
            });

            // Verify the database was updated
            const dbRecord = db
                .prepare(
                    `
                SELECT * FROM "${Constants.UtilityTableName}"
                WHERE id = ${UTILITY_RECORD_ID}
            `,
                )
                .get() as DatabaseUtility;

            expect(dbRecord).toEqual({
                id: UTILITY_RECORD_ID,
                last_page_counts: null,
            });
        });

        it("should handle database constraint violations", () => {
            // This should fail because the ID must be 0 according to the schema
            expect(() =>
                db
                    .prepare(
                        `
                    INSERT INTO "${Constants.UtilityTableName}" (last_page_counts)
                    VALUES (8)
                `,
                    )
                    .run(),
            ).toThrow("CHECK constraint failed: id = 0");
        });
    });
});
