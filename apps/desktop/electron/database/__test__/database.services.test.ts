import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, renameSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
    closePersistentConnection,
    handleSqlProxy,
    handleSqlProxyWithDb,
    insertAudioFile,
    setDbPath,
} from "../database.services";

describe("Database Services", () => {
    describe("sql proxy", () => {
        let db: DatabaseSync;

        beforeEach(() => {
            db = new DatabaseSync(":memory:");
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

    describe("persistent connection", () => {
        let tempDir: string;
        let dbPath: string;

        beforeEach(() => {
            tempDir = mkdtempSync(
                join(tmpdir(), "openmarch-persistent-connection-test-"),
            );
            dbPath = join(tempDir, "test.dots");

            const db = new DatabaseSync(dbPath);
            db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");
            db.close();

            setDbPath(dbPath);
        });

        afterEach(() => {
            closePersistentConnection();
            setDbPath("", false);
            rmSync(tempDir, { recursive: true, force: true });
        });

        it("releases the database file so it can be renamed", async () => {
            await handleSqlProxy(null, "SELECT 1", [], "get");

            const renamedPath = join(tempDir, "renamed.dots");
            closePersistentConnection();
            renameSync(dbPath, renamedPath);

            expect(existsSync(renamedPath)).toBe(true);
            expect(existsSync(dbPath)).toBe(false);
        });
    });

    describe("audio files", () => {
        let tempDir: string;
        let dbPath: string;

        beforeEach(() => {
            tempDir = mkdtempSync(join(tmpdir(), "openmarch-audio-test-"));
            dbPath = join(tempDir, "test.dots");

            const db = new DatabaseSync(dbPath);
            db.exec(`
                CREATE TABLE audio_files (
                    id INTEGER PRIMARY KEY,
                    path TEXT NOT NULL,
                    nickname TEXT,
                    data BLOB,
                    selected INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            `);
            db.close();

            setDbPath(dbPath);
        });

        afterEach(() => {
            setDbPath("", false);
            rmSync(tempDir, { recursive: true, force: true });
        });

        it("should ignore non-insert fields when binding named parameters", async () => {
            const result = await insertAudioFile({
                id: -1,
                data: new Uint8Array([1, 2, 3]),
                path: "/tmp/test.mp3",
                nickname: "test.mp3",
                selected: true,
            });

            expect(result.success).toBe(true);
            expect(result.result?.[0].id).toBe(1);

            const db = new DatabaseSync(dbPath);
            const inserted = db
                .prepare(
                    "SELECT id, path, nickname, selected FROM audio_files WHERE id = 1",
                )
                .get();
            db.close();

            expect(inserted).toEqual({
                id: 1,
                path: "/tmp/test.mp3",
                nickname: "test.mp3",
                selected: 1,
            });
        });
    });
});
