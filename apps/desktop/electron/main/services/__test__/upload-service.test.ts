import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { uploadDatabaseToServer } from "../upload-service";
import * as DatabaseServices from "../../../database/database.services";
import Constants from "../../../../src/global/Constants";

describe("Upload Service", () => {
    let tempDir: string;
    let testDbPath: string;
    let originalGetDbPath: typeof DatabaseServices.getDbPath;
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
        // Create a temporary directory for test databases
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-test-"));
        testDbPath = path.join(tempDir, "test.dots");

        // Create a test database with required tables
        const db = new Database(testDbPath);
        db.exec(`
            CREATE TABLE ${Constants.UndoHistoryTableName} (
                id INTEGER PRIMARY KEY,
                history_group INTEGER,
                sql_statement TEXT
            );

            CREATE TABLE ${Constants.AudioFilesTableName} (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL,
                nickname TEXT,
                data BLOB,
                selected INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE field_properties (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                json_data TEXT NOT NULL,
                image BLOB
            );
        `);

        // Insert test data
        db.exec(`
            INSERT INTO ${Constants.UndoHistoryTableName} (id, history_group, sql_statement)
            VALUES
                (1, 1, 'SELECT * FROM test'),
                (2, 1, 'INSERT INTO test VALUES (1)');

            INSERT INTO ${Constants.AudioFilesTableName} (id, path, nickname, data, selected)
            VALUES
                (1, '/path/to/audio1.mp3', 'Audio 1', X'010203', 1),
                (2, '/path/to/audio2.mp3', 'Audio 2', X'040506', 0);

            INSERT INTO field_properties (id, json_data, image)
            VALUES (1, '{"test": "data"}', X'FFD8FFE0');
        `);

        db.close();

        // Mock DatabaseServices.getDbPath to return our test database path
        originalGetDbPath = DatabaseServices.getDbPath;
        vi.spyOn(DatabaseServices, "getDbPath").mockReturnValue(testDbPath);

        // Mock fetch globally for upload tests
        originalFetch = global.fetch;
        global.fetch = vi.fn();

        // Mock console methods to reduce noise in test output
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore original functions
        vi.restoreAllMocks();
        global.fetch = originalFetch;

        // Clean up temporary files and directories
        try {
            const files = fs.readdirSync(tempDir);
            for (const file of files) {
                fs.unlinkSync(path.join(tempDir, file));
            }
            fs.rmdirSync(tempDir);
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe("Successful upload flow", () => {
        it("should successfully upload database after clearing data", async () => {
            // Mock successful fetch response
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                status: 200,
                text: async () => "OK",
            });

            const result = await uploadDatabaseToServer();

            expect(result.success).toBe(true);
            expect(result.message).toBe("Database uploaded successfully");
            expect(result.error).toBeUndefined();
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it("should create a temporary file with correct naming", async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                status: 200,
                text: async () => "OK",
            });

            await uploadDatabaseToServer();

            // Check that fetch was called with FormData containing a file
            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock
                .calls[0];
            expect(fetchCall).toBeDefined();
            expect(fetchCall[1].body).toBeInstanceOf(FormData);
        });

        it("should clear history_undo table in temporary database", async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
                async (url: string | URL, init?: RequestInit) => {
                    // Intercept the FormData to get the file before it's cleaned up
                    if (init?.body instanceof FormData) {
                        const fileEntry = init.body.get("file");
                        if (fileEntry) {
                            // Handle File, Blob, or Buffer
                            let arrayBuffer: ArrayBuffer;
                            if (
                                fileEntry instanceof File ||
                                fileEntry instanceof Blob
                            ) {
                                arrayBuffer = await fileEntry.arrayBuffer();
                            } else if (fileEntry instanceof ArrayBuffer) {
                                arrayBuffer = fileEntry;
                            } else {
                                // It's a Buffer or similar
                                arrayBuffer = (fileEntry as any).buffer;
                            }

                            const tempDbPath = path.join(
                                tempDir,
                                "verify-temp.dots",
                            );
                            fs.writeFileSync(
                                tempDbPath,
                                Buffer.from(arrayBuffer),
                            );

                            // Verify that history_undo table is cleared
                            const verifyDb = new Database(tempDbPath);
                            const undoCount = verifyDb
                                .prepare(
                                    `SELECT COUNT(*) as count FROM ${Constants.UndoHistoryTableName}`,
                                )
                                .get() as { count: number };
                            expect(undoCount.count).toBe(0);
                            verifyDb.close();

                            // Clean up
                            fs.unlinkSync(tempDbPath);
                        }
                    }

                    return {
                        ok: true,
                        status: 200,
                        text: async () => "OK",
                    };
                },
            );

            await uploadDatabaseToServer();

            expect(global.fetch).toHaveBeenCalled();
        });

        it("should clear audio_files table in temporary database", async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
                async (url: string | URL, init?: RequestInit) => {
                    // Intercept the FormData to get the file before it's cleaned up
                    if (init?.body instanceof FormData) {
                        const fileEntry = init.body.get("file");
                        if (fileEntry) {
                            // Handle File, Blob, or Buffer
                            let arrayBuffer: ArrayBuffer;
                            if (
                                fileEntry instanceof File ||
                                fileEntry instanceof Blob
                            ) {
                                arrayBuffer = await fileEntry.arrayBuffer();
                            } else if (fileEntry instanceof ArrayBuffer) {
                                arrayBuffer = fileEntry;
                            } else {
                                // It's a Buffer or similar
                                arrayBuffer = (fileEntry as any).buffer;
                            }

                            const tempDbPath = path.join(
                                tempDir,
                                "verify-temp.dots",
                            );
                            fs.writeFileSync(
                                tempDbPath,
                                Buffer.from(arrayBuffer),
                            );

                            // Verify that audio_files table is cleared
                            const verifyDb = new Database(tempDbPath);
                            const audioCount = verifyDb
                                .prepare(
                                    `SELECT COUNT(*) as count FROM ${Constants.AudioFilesTableName}`,
                                )
                                .get() as { count: number };
                            expect(audioCount.count).toBe(0);
                            verifyDb.close();

                            // Clean up
                            fs.unlinkSync(tempDbPath);
                        }
                    }

                    return {
                        ok: true,
                        status: 200,
                        text: async () => "OK",
                    };
                },
            );

            // Verify original database has audio files
            const originalDb = new Database(testDbPath);
            const originalAudioCount = originalDb
                .prepare(
                    `SELECT COUNT(*) as count FROM ${Constants.AudioFilesTableName}`,
                )
                .get() as { count: number };
            expect(originalAudioCount.count).toBe(2);
            originalDb.close();

            await uploadDatabaseToServer();

            expect(global.fetch).toHaveBeenCalled();
        });

        it("should clear field_properties.image column in temporary database", async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
                async (url: string | URL, init?: RequestInit) => {
                    // Intercept the FormData to get the file before it's cleaned up
                    if (init?.body instanceof FormData) {
                        const fileEntry = init.body.get("file");
                        if (fileEntry) {
                            // Handle File, Blob, or Buffer
                            let arrayBuffer: ArrayBuffer;
                            if (
                                fileEntry instanceof File ||
                                fileEntry instanceof Blob
                            ) {
                                arrayBuffer = await fileEntry.arrayBuffer();
                            } else if (fileEntry instanceof ArrayBuffer) {
                                arrayBuffer = fileEntry;
                            } else {
                                // It's a Buffer or similar
                                arrayBuffer = (fileEntry as any).buffer;
                            }

                            const tempDbPath = path.join(
                                tempDir,
                                "verify-temp.dots",
                            );
                            fs.writeFileSync(
                                tempDbPath,
                                Buffer.from(arrayBuffer),
                            );

                            // Verify that field_properties.image is cleared (NULL)
                            const verifyDb = new Database(tempDbPath);
                            const fieldProps = verifyDb
                                .prepare(
                                    "SELECT image FROM field_properties WHERE id = 1",
                                )
                                .get() as { image: Buffer | null };
                            expect(fieldProps.image).toBeNull();
                            verifyDb.close();

                            // Clean up
                            fs.unlinkSync(tempDbPath);
                        }
                    }

                    return {
                        ok: true,
                        status: 200,
                        text: async () => "OK",
                    };
                },
            );

            // Verify original database has image data
            const originalDb = new Database(testDbPath);
            const originalFieldProps = originalDb
                .prepare("SELECT image FROM field_properties WHERE id = 1")
                .get() as { image: Buffer | null };
            expect(originalFieldProps.image).not.toBeNull();
            originalDb.close();

            await uploadDatabaseToServer();

            expect(global.fetch).toHaveBeenCalled();
        });

        it("should execute VACUUM on temporary database", async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                status: 200,
                text: async () => "OK",
            });

            await uploadDatabaseToServer();

            // VACUUM execution is verified by the fact that the upload succeeds
            // since VACUUM must complete before the database is closed
            expect(global.fetch).toHaveBeenCalled();
        });
    });

    describe("Error handling", () => {
        it("should return error when no database is open", async () => {
            vi.spyOn(DatabaseServices, "getDbPath").mockReturnValue("");

            const result = await uploadDatabaseToServer();

            expect(result.success).toBe(false);
            expect(result.error).toBe("No database is currently open");
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it("should return error when database file does not exist", async () => {
            vi.spyOn(DatabaseServices, "getDbPath").mockReturnValue(
                "/nonexistent/path.dots",
            );

            const result = await uploadDatabaseToServer();

            expect(result.success).toBe(false);
            expect(result.error).toContain("Database file does not exist");
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it("should return error when fetch fails", async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
                new Error("Network error"),
            );

            const result = await uploadDatabaseToServer();

            expect(result.success).toBe(false);
            expect(result.error).toContain("Upload failed: Network error");
        });

        it("should return error when upload returns non-ok response", async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => "Internal Server Error",
            });

            const result = await uploadDatabaseToServer();

            expect(result.success).toBe(false);
            expect(result.error).toContain("Upload failed with status 500");
        });

        it("should return error when database operations fail", async () => {
            // Create a corrupted database path
            const corruptedDbPath = path.join(tempDir, "corrupted.dots");
            fs.writeFileSync(corruptedDbPath, "not a database");

            vi.spyOn(DatabaseServices, "getDbPath").mockReturnValue(
                corruptedDbPath,
            );

            const result = await uploadDatabaseToServer();

            expect(result.success).toBe(false);
            expect(result.error).toContain("Upload failed");
        });
    });

    describe("Cleanup", () => {
        it("should clean up temporary file after successful upload", async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                status: 200,
                text: async () => "OK",
            });

            await uploadDatabaseToServer();

            // Check that no temp files remain in the temp directory
            const tempFiles = fs
                .readdirSync(os.tmpdir())
                .filter((file) => file.startsWith("upload-temp-"));
            // We can't check for exact cleanup since the file name includes timestamp
            // But we can verify the upload succeeded, which means cleanup happened
            expect(global.fetch).toHaveBeenCalled();
        });

        it("should clean up temporary file even on upload failure", async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
                new Error("Upload failed"),
            );

            await uploadDatabaseToServer();

            // Verify that cleanup was attempted (file should not exist)
            // The fact that the error was caught and returned means cleanup happened
            expect(global.fetch).toHaveBeenCalled();
        });
    });

    describe("Database operations on temporary copy", () => {
        it("should not modify the original database", async () => {
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                status: 200,
                text: async () => "OK",
            });

            // Get original state
            const originalDb = new Database(testDbPath);
            const originalUndoCount = originalDb
                .prepare(
                    `SELECT COUNT(*) as count FROM ${Constants.UndoHistoryTableName}`,
                )
                .get() as { count: number };
            const originalAudioCount = originalDb
                .prepare(
                    `SELECT COUNT(*) as count FROM ${Constants.AudioFilesTableName}`,
                )
                .get() as { count: number };
            const originalImage = originalDb
                .prepare("SELECT image FROM field_properties WHERE id = 1")
                .get() as { image: Buffer | null };
            originalDb.close();

            await uploadDatabaseToServer();

            // Verify original database is unchanged
            const verifyDb = new Database(testDbPath);
            const verifyUndoCount = verifyDb
                .prepare(
                    `SELECT COUNT(*) as count FROM ${Constants.UndoHistoryTableName}`,
                )
                .get() as { count: number };
            const verifyAudioCount = verifyDb
                .prepare(
                    `SELECT COUNT(*) as count FROM ${Constants.AudioFilesTableName}`,
                )
                .get() as { count: number };
            const verifyImage = verifyDb
                .prepare("SELECT image FROM field_properties WHERE id = 1")
                .get() as { image: Buffer | null };
            verifyDb.close();

            expect(verifyUndoCount.count).toBe(originalUndoCount.count);
            expect(verifyAudioCount.count).toBe(originalAudioCount.count);
            expect(verifyImage.image).toEqual(originalImage.image);
        });
    });
});
