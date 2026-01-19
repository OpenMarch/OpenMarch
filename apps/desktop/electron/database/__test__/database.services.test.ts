import { beforeEach, describe, expect, it } from "vitest";
import Database from "libsql";
import { handleSqlProxyWithDb } from "../database.services";

describe("Database Services", () => {
    describe("sql proxy", () => {
        let db: Database.Database;

        beforeEach(() => {
            db = new Database(":memory:");
            // Set up a test table
            db.exec("CREATE TABLE test (id INTEGER, name TEXT)");
            db.exec(
                "INSERT INTO test (id, name) VALUES (1, 'test1'), (2, 'test2')",
            );
        });

        it("should handle all - returns {rows: string[][]}", async () => {
            const result = await handleSqlProxyWithDb(
                db,
                "SELECT * FROM test",
                [],
                "all",
            );
            expect(result).toEqual({
                rows: [
                    [1, "test1"],
                    [2, "test2"],
                ],
            });
            expect(Array.isArray(result.rows)).toBe(true);
            expect(Array.isArray(result.rows[0])).toBe(true); // Should be string[][]
        });

        it("should handle get - returns {rows: string[]}", async () => {
            const result = await handleSqlProxyWithDb(
                db,
                "SELECT * FROM test WHERE id = ?",
                [1],
                "get",
            );
            expect(result).toEqual({
                rows: [1, "test1"],
            });
            expect(Array.isArray(result.rows)).toBe(true);
            expect(Array.isArray(result.rows[0])).toBe(false); // Should be string[], not string[][]
        });

        it("should handle run for insert - returns {rows: string[][]}", async () => {
            const result = await handleSqlProxyWithDb(
                db,
                "INSERT INTO test (id, name) VALUES (?, ?)",
                [3, "test3"],
                "run",
            );
            expect(result.rows).toEqual([]);

            // Verify the insert worked
            const selectResult = await handleSqlProxyWithDb(
                db,
                "SELECT * FROM test WHERE id = ?",
                [3],
                "get",
            );
            expect(selectResult).toEqual({
                rows: [3, "test3"],
            });
        });

        it("should handle empty results", async () => {
            const result = await handleSqlProxyWithDb(
                db,
                "SELECT * FROM test WHERE id = ?",
                [999],
                "all",
            );
            expect(result).toEqual({ rows: [] });
        });
    });
});
