/**
 * A leftover rollback journal next to a show file (`leftoverJournal.ts`): a journal SQLite
 * can't use refuses the open with `LEFTOVER_JOURNAL_STATUS` instead of a raw "unable to open
 * database file", and the file and journal can be backed up before SQLite plays it back.
 * Recovery is in `electron/main/__test__/leftoverJournalRecovery.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { closePersistentConnection, setDbPath } from "../database.services";
import {
    backupBeforeJournalRecovery,
    hasLeftoverJournal,
    isCantOpenError,
    journalPathFor,
    LEFTOVER_JOURNAL_STATUS,
} from "../leftoverJournal";

const sha256 = (filePath: string) =>
    createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

/** Permissions don't stop root, so the read-only cases can't happen there. */
const isRoot = process.getuid?.() === 0;

/** A small database with some rows, at the timeline file version. */
function createDb(filePath: string) {
    const db = new DatabaseSync(filePath);
    try {
        db.exec("PRAGMA user_version = 8");
        db.exec("CREATE TABLE marchers (id INTEGER PRIMARY KEY, name TEXT)");
        const insert = db.prepare("INSERT INTO marchers (name) VALUES (?)");
        // Many pages, so an edit of them all spills past a tiny cache.
        for (let i = 0; i < 2000; i++)
            insert.run(`Marcher ${i} `.padEnd(200, "."));
    } finally {
        db.close();
    }
}

/**
 * Leaves a real hot journal next to `filePath`, as an interrupted save does: copies the
 * journal of an open write transaction, rolls the transaction back, then puts the copy back.
 */
function leaveHotJournal(filePath: string) {
    const journal = journalPathFor(filePath);
    const saved = `${journal}.saved`;
    const db = new DatabaseSync(filePath);
    try {
        // A one-page cache spills changed pages into the file mid-transaction, which first
        // syncs the journal and gives it its header, as a long save does.
        db.exec("PRAGMA cache_size = 1");
        db.exec("BEGIN");
        db.exec("UPDATE marchers SET name = name || ' (edited)'");
        fs.copyFileSync(journal, saved);
        db.exec("ROLLBACK");
    } finally {
        db.close();
    }
    fs.renameSync(saved, journal);
}

describe("leftover journals", () => {
    let tempDir: string;
    let backupDir: string;
    let showPath: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-journal-"));
        backupDir = path.join(tempDir, "backups");
        showPath = path.join(tempDir, "show", "As Time Flies.dots");
        fs.mkdirSync(path.dirname(showPath));
        createDb(showPath);
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        closePersistentConnection();
        setDbPath("", false);
        // Undo the read-only cases so the folder can be removed.
        fs.chmodSync(path.dirname(showPath), 0o755);
        if (fs.existsSync(journalPathFor(showPath)))
            fs.chmodSync(journalPathFor(showPath), 0o644);
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    describe("hasLeftoverJournal", () => {
        it("is false with no journal", () => {
            expect(hasLeftoverJournal(showPath)).toBe(false);
        });

        it("is false for an empty or zeroed journal, which SQLite ignores", () => {
            fs.writeFileSync(journalPathFor(showPath), "");
            expect(hasLeftoverJournal(showPath)).toBe(false);
            fs.writeFileSync(journalPathFor(showPath), Buffer.alloc(512));
            expect(hasLeftoverJournal(showPath)).toBe(false);
        });

        it("is true for a journal an interrupted save left", () => {
            leaveHotJournal(showPath);
            expect(hasLeftoverJournal(showPath)).toBe(true);
        });
    });

    it("recognizes SQLITE_CANTOPEN, extended codes included", () => {
        expect(isCantOpenError({ errcode: 14 })).toBe(true);
        expect(isCantOpenError({ errcode: 14 | (1 << 8) })).toBe(true);
        expect(isCantOpenError({ errcode: 10 })).toBe(false);
        expect(isCantOpenError(new Error("unable to open database file"))).toBe(
            false,
        );
    });

    it.skipIf(isRoot)(
        "refuses a file whose journal can't be used, leaving it unchanged",
        () => {
            leaveHotJournal(showPath);
            fs.chmodSync(journalPathFor(showPath), 0o444);
            const hashBefore = sha256(showPath);

            expect(setDbPath(showPath)).toBe(LEFTOVER_JOURNAL_STATUS);

            expect(sha256(showPath)).toBe(hashBefore);
            expect(fs.existsSync(journalPathFor(showPath))).toBe(true);
        },
    );

    it.skipIf(isRoot)(
        "refuses as no folder access when SQLite can't create a journal",
        () => {
            fs.chmodSync(path.dirname(showPath), 0o555);

            expect(setDbPath(showPath)).toBe(403);
        },
    );

    it("lets SQLite play back a journal it can use, as before", () => {
        leaveHotJournal(showPath);

        expect(setDbPath(showPath)).toBe(200);
        expect(fs.existsSync(journalPathFor(showPath))).toBe(false);
    });

    describe("backupBeforeJournalRecovery", () => {
        it("does nothing without a leftover journal", () => {
            expect(backupBeforeJournalRecovery(showPath, backupDir)).toBe(null);
            expect(fs.existsSync(backupDir)).toBe(false);
        });

        it("copies the file and its journal side by side, untouched", () => {
            leaveHotJournal(showPath);
            const showHash = sha256(showPath);
            const journalHash = sha256(journalPathFor(showPath));

            const backup = backupBeforeJournalRecovery(showPath, backupDir);

            expect(backup).not.toBeNull();
            expect(sha256(backup!.showCopy)).toBe(showHash);
            expect(backup!.journalCopy).toBe(journalPathFor(backup!.showCopy));
            expect(sha256(backup!.journalCopy!)).toBe(journalHash);
            // The original is left for SQLite to play back.
            expect(sha256(showPath)).toBe(showHash);
            expect(sha256(journalPathFor(showPath))).toBe(journalHash);
        });

        it.skipIf(isRoot)(
            "still copies the file when the journal can't be read",
            () => {
                leaveHotJournal(showPath);
                fs.chmodSync(journalPathFor(showPath), 0o000);

                const backup = backupBeforeJournalRecovery(showPath, backupDir);

                expect(backup?.journalCopy).toBeNull();
                expect(fs.existsSync(backup!.showCopy)).toBe(true);
            },
        );
    });
});
