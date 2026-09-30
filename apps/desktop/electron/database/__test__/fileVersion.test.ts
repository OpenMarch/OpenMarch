import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
    applyFileVersionDecision,
    decideFileVersion,
    isSupportedUserVersion,
    MAX_SUPPORTED_USER_VERSION,
    MIN_SUPPORTED_USER_VERSION,
    NEW_FILE_USER_VERSION,
    readUserVersion,
} from "../fileVersion";

describe("file-format version", () => {
    it("supports the page model (7) and the timeline model (8)", () => {
        expect(MIN_SUPPORTED_USER_VERSION).toBe(7);
        expect(MAX_SUPPORTED_USER_VERSION).toBe(8);
        expect(NEW_FILE_USER_VERSION).toBe(7);
    });

    describe("decideFileVersion", () => {
        it("initializes a new, empty file to the new-file version", () => {
            expect(decideFileVersion(0, true)).toEqual({
                action: "initialize",
                version: NEW_FILE_USER_VERSION,
            });
        });

        it.each([7, 8])("accepts an existing file at %i", (version) => {
            expect(decideFileVersion(version, false)).toEqual({
                action: "accept",
                version,
            });
        });

        it.each([7, 8])(
            "accepts a 'new' file already at %i without rewriting it",
            (version) => {
                expect(decideFileVersion(version, true)).toEqual({
                    action: "accept",
                    version,
                });
            },
        );

        it.each([9, 10, 42, 2 ** 31 - 1])(
            "refuses a file at %i as too new, new or not",
            (version) => {
                for (const isNewFile of [false, true]) {
                    expect(decideFileVersion(version, isNewFile)).toEqual({
                        action: "refuse-too-new",
                        version,
                    });
                }
            },
        );

        it.each([0, 1, 5, 6, -1, -(2 ** 31)])(
            "leaves an existing legacy file at %i unchanged (too old)",
            (version) => {
                expect(decideFileVersion(version, false)).toEqual({
                    action: "refuse-too-old",
                    version,
                });
            },
        );

        it("rejects a non-integer version", () => {
            expect(() => decideFileVersion(7.5, false)).toThrow();
            expect(() => decideFileVersion(Number.NaN, false)).toThrow();
        });
    });

    it("isSupportedUserVersion covers exactly 7 and 8", () => {
        expect([0, 6, 7, 8, 9].map(isSupportedUserVersion)).toEqual([
            false,
            false,
            true,
            true,
            false,
        ]);
    });

    describe("applyFileVersionDecision", () => {
        const withDb = (
            userVersion: number,
            fn: (db: DatabaseSync) => void,
        ) => {
            const db = new DatabaseSync(":memory:");
            try {
                db.prepare(`PRAGMA user_version = ${userVersion}`).run();
                fn(db);
            } finally {
                db.close();
            }
        };

        it("writes the version of a new file", () => {
            withDb(0, (db) => {
                applyFileVersionDecision(db, true);
                expect(readUserVersion(db)).toBe(NEW_FILE_USER_VERSION);
            });
        });

        it.each([
            [0, false],
            [6, false],
            [7, false],
            [8, false],
            [8, true],
            [9, false],
            [9, true],
            [1000, false],
        ])("never writes the version of a file at %i (new: %s)", (v, isNew) => {
            withDb(v, (db) => {
                applyFileVersionDecision(db, isNew);
                expect(readUserVersion(db)).toBe(v);
            });
        });
    });
});
