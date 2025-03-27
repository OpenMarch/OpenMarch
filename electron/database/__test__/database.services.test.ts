import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import Database from "better-sqlite3";
import { setDbPath, getDbPath, databaseIsReady } from "../database.services";
import path from "path";
import os from "os";

describe("Database Services", () => {
    let tempDbPath: string;

    beforeEach(() => {
        // Create a temporary directory for the test database
        tempDbPath = path.join(os.tmpdir(), `test-db-${Date.now()}.db`);

        // Reset mocks before each test
        vi.clearAllMocks();

        // Mock console to avoid cluttering test output
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        // Reset the DB_PATH by calling setDbPath with an invalid path
        vi.mocked(fs.existsSync).mockReturnValueOnce(false);
        setDbPath("invalid/path");

        // Clean up the temporary database file if it exists
        try {
            if (fs.existsSync(tempDbPath)) {
                fs.unlinkSync(tempDbPath);
            }
        } catch (e) {
            // Ignore cleanup errors
        }

        // Restore console mocks
        vi.restoreAllMocks();
    });

    describe("setDbPath", () => {
        test("should set the database path when file exists", () => {
            // Create a real SQLite database file
            const db = new Database(tempDbPath);
            db.pragma("user_version = 1");
            db.close();

            // Mock fs.existsSync to return true for our temp path
            vi.mocked(fs.existsSync).mockImplementation((path) => {
                if (path === tempDbPath) return true;
                return false;
            });

            const result = setDbPath(tempDbPath);

            expect(result).toBe(200);
            expect(getDbPath()).toBe(tempDbPath);
            expect(fs.existsSync).toHaveBeenCalledWith(tempDbPath);
        });

        test("should set the database path for a new file", () => {
            // Mock fs.existsSync to return false for our temp path
            vi.mocked(fs.existsSync).mockImplementation((path) => {
                if (path === tempDbPath) return false;
                return false;
            });

            const result = setDbPath(tempDbPath, true);

            expect(result).toBe(200);
            expect(getDbPath()).toBe(tempDbPath);
            expect(fs.existsSync).toHaveBeenCalledWith(tempDbPath);
        });

        test("should return -1 when file does not exist and isNewFile is false", () => {
            // Mock fs.existsSync to return false
            vi.mocked(fs.existsSync).mockReturnValue(false);

            const result = setDbPath(tempDbPath);

            expect(result).toBe(-1);
            expect(getDbPath()).toBe("");
            expect(fs.existsSync).toHaveBeenCalledWith(tempDbPath);
            expect(console.error).toHaveBeenCalled();
        });

        test("should return -1 when database has invalid user_version", () => {
            // Mock fs.existsSync to return true
            vi.mocked(fs.existsSync).mockReturnValue(true);

            // Create a database with invalid user_version
            const db = new Database(tempDbPath);
            db.pragma("user_version = -1");
            db.close();

            const result = setDbPath(tempDbPath);

            expect(result).toBe(-1);
            expect(getDbPath()).toBe("");
            expect(console.error).toHaveBeenCalled();
        });
    });

    describe("getDbPath", () => {
        test("should return the current database path", () => {
            // Mock fs.existsSync to return true
            vi.mocked(fs.existsSync).mockReturnValue(true);

            // Create a real SQLite database file
            const db = new Database(tempDbPath);
            db.pragma("user_version = 1");
            db.close();

            setDbPath(tempDbPath);

            const result = getDbPath();

            expect(result).toBe(tempDbPath);
        });

        test("should return empty string when no path is set", () => {
            // Reset the path
            vi.mocked(fs.existsSync).mockReturnValue(false);
            setDbPath("invalid/path");

            const result = getDbPath();

            expect(result).toBe("");
        });
    });

    describe("databaseIsReady", () => {
        test("should return true when path is set and file exists", () => {
            // Mock fs.existsSync to return true
            vi.mocked(fs.existsSync).mockReturnValue(true);

            // Create a real SQLite database file
            const db = new Database(tempDbPath);
            db.pragma("user_version = 1");
            db.close();

            setDbPath(tempDbPath);

            const result = databaseIsReady();

            expect(result).toBe(true);
            expect(console.log).toHaveBeenCalledWith("databaseIsReady:", true);
            expect(console.log).toHaveBeenCalledWith(
                "Database path:",
                tempDbPath,
            );
        });

        test("should return false when path is empty", () => {
            // Reset the path
            vi.mocked(fs.existsSync).mockReturnValue(false);
            setDbPath("invalid/path");

            const result = databaseIsReady();

            expect(result).toBe(false);
            expect(console.log).toHaveBeenCalledWith("databaseIsReady:", false);
            expect(console.log).toHaveBeenCalledWith("Database path is empty");
        });

        test("should return false when file does not exist", () => {
            // Set a path first
            vi.mocked(fs.existsSync).mockReturnValueOnce(true); // For setDbPath

            // Create a real SQLite database file
            const db = new Database(tempDbPath);
            db.pragma("user_version = 1");
            db.close();

            setDbPath(tempDbPath);

            // Now mock that the file doesn't exist for databaseIsReady check
            vi.mocked(fs.existsSync).mockReturnValueOnce(false);

            const result = databaseIsReady();

            expect(result).toBe(false);
            expect(console.log).toHaveBeenCalledWith("databaseIsReady:", false);
            expect(console.log).toHaveBeenCalledWith(
                "Database path:",
                tempDbPath,
            );
        });
    });
});
