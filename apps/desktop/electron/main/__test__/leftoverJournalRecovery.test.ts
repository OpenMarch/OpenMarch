/**
 * Recovering a show from a leftover journal SQLite can't use where it is
 * (`leftoverJournalRecovery.ts`). The key case is a "torn" show: an unfinished save had already
 * written some pages into it, so it's only sound once its journal is played back.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { journalPathFor } from "../../database/leftoverJournal";
import {
    recoverFromLeftoverJournal,
    JournalRecoveryError,
    SET_ASIDE_MARK,
} from "../leftoverJournalRecovery";

const ROWS = 2000;

const sha256 = (filePath: string) =>
    createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

/** Permissions don't stop root, so the unreadable-journal cases can't happen there. */
const isRoot = process.getuid?.() === 0;

function createDb(filePath: string) {
    const db = new DatabaseSync(filePath);
    try {
        db.exec("CREATE TABLE marchers (id INTEGER PRIMARY KEY, name TEXT)");
        const insert = db.prepare("INSERT INTO marchers (name) VALUES (?)");
        for (let i = 0; i < ROWS; i++)
            insert.run(`Marcher ${i} `.padEnd(200, "."));
    } finally {
        db.close();
    }
}

/** `integrity_check` and the row count of `filePath`, opened read-only. */
function inspect(filePath: string) {
    const db = new DatabaseSync(filePath, { readOnly: true });
    try {
        const integrity = Object.values(
            db.prepare("PRAGMA integrity_check").get() ?? {},
        )[0];
        const { n } = db
            .prepare("SELECT count(*) AS n FROM marchers")
            .get() as { n: number };
        return { integrity, rows: n };
    } finally {
        db.close();
    }
}

/**
 * Leaves `filePath` as a crash mid-save would: a one-page cache spills the changed pages into
 * the file during the transaction, then the file and its journal are copied before it ends.
 */
function tearMidSave(filePath: string) {
    const torn = `${filePath}.torn`;
    const db = new DatabaseSync(filePath);
    try {
        db.exec("PRAGMA cache_size = 1");
        db.exec("BEGIN");
        db.exec("UPDATE marchers SET name = name || ' (edited)'");
        db.exec("DELETE FROM marchers WHERE id % 3 = 0");
        fs.copyFileSync(filePath, torn);
        fs.copyFileSync(journalPathFor(filePath), journalPathFor(torn));
        db.exec("ROLLBACK");
    } finally {
        db.close();
    }
    fs.renameSync(torn, filePath);
    fs.renameSync(journalPathFor(torn), journalPathFor(filePath));
}

describe("recoverFromLeftoverJournal", () => {
    let tempDir: string;
    let workDir: string;
    let backupDir: string;
    let showPath: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(
            path.join(os.tmpdir(), "openmarch-recover-test-"),
        );
        workDir = path.join(tempDir, "work");
        fs.mkdirSync(workDir);
        backupDir = path.join(tempDir, "backups");
        showPath = path.join(tempDir, "show", "As Time Flies.dots");
        fs.mkdirSync(path.dirname(showPath));
        createDb(showPath);
    });

    afterEach(() => {
        if (fs.existsSync(journalPathFor(showPath)))
            fs.chmodSync(journalPathFor(showPath), 0o644);
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const recover = () =>
        recoverFromLeftoverJournal(showPath, backupDir, { tempDir: workDir });

    it("checks the fixture: a torn show is damaged without its journal", () => {
        tearMidSave(showPath);
        const alone = path.join(tempDir, "alone.dots");
        fs.copyFileSync(showPath, alone);
        expect(() => {
            const { integrity } = inspect(alone);
            if (integrity !== "ok") throw new Error(String(integrity));
        }).toThrow();
    });

    it("plays a read-only journal back on a copy, repairing a torn show", () => {
        tearMidSave(showPath);
        const journalHash = sha256(journalPathFor(showPath));
        fs.chmodSync(journalPathFor(showPath), 0o444);

        const result = recover();

        expect(result).toMatchObject({ outcome: "recovered", from: "journal" });
        expect(inspect(showPath)).toEqual({ integrity: "ok", rows: ROWS });
        // The journal is kept in the backups, not deleted, and is gone from the show's folder.
        expect(fs.existsSync(journalPathFor(showPath))).toBe(false);
        const keptAt = (result as { journalKeptAt: string }).journalKeptAt;
        expect(path.dirname(keptAt)).toBe(backupDir);
        expect(keptAt.endsWith(`${SET_ASIDE_MARK}-journal`)).toBe(true);
        // So is the show as it was, before the recovered copy replaced it.
        const keptShow = keptAt.replace(/-journal$/, "");
        expect(fs.existsSync(keptShow)).toBe(true);
        expect(sha256(keptAt)).toBe(journalHash);
        // Nothing is left behind.
        expect(fs.readdirSync(workDir)).toEqual([]);
        expect(fs.readdirSync(path.dirname(showPath))).toEqual([
            path.basename(showPath),
        ]);
    });

    it.skipIf(isRoot)(
        "keeps a sound show as it is when the journal can't be read",
        () => {
            fs.writeFileSync(journalPathFor(showPath), Buffer.alloc(1024, 7));
            // A real journal header, so it counts as leftover.
            const header = Buffer.from([
                0xd9, 0xd5, 0x05, 0xf9, 0x20, 0xa1, 0x63, 0xd7,
            ]);
            const fd = fs.openSync(journalPathFor(showPath), "r+");
            fs.writeSync(fd, header, 0, header.length, 0);
            fs.closeSync(fd);
            fs.chmodSync(journalPathFor(showPath), 0o000);
            const showHash = sha256(showPath);

            const result = recover();

            expect(result).toMatchObject({
                outcome: "recovered",
                from: "show-alone",
            });
            expect(sha256(showPath)).toBe(showHash);
            expect(fs.existsSync(journalPathFor(showPath))).toBe(false);
        },
    );

    it.skipIf(isRoot)(
        "changes nothing when neither the played-back copy nor the show alone is sound",
        () => {
            tearMidSave(showPath);
            fs.chmodSync(journalPathFor(showPath), 0o000);
            const showHash = sha256(showPath);

            expect(recover()).toEqual({ outcome: "damaged" });

            expect(sha256(showPath)).toBe(showHash);
            expect(fs.existsSync(journalPathFor(showPath))).toBe(true);
            expect(fs.readdirSync(backupDir)).toEqual([]);
            expect(fs.readdirSync(path.dirname(showPath))).toEqual([
                path.basename(showPath),
                path.basename(journalPathFor(showPath)),
            ]);
        },
    );

    it.skipIf(isRoot)(
        "changes nothing when it can't write in the show's folder",
        () => {
            tearMidSave(showPath);
            const showHash = sha256(showPath);
            fs.chmodSync(path.dirname(showPath), 0o555);
            let error: unknown;
            try {
                recover();
            } catch (e) {
                error = e;
            } finally {
                fs.chmodSync(path.dirname(showPath), 0o755);
            }

            expect(error).toBeInstanceOf(JournalRecoveryError);
            expect((error as JournalRecoveryError).step).toBe("stage");

            expect(sha256(showPath)).toBe(showHash);
            expect(fs.existsSync(journalPathFor(showPath))).toBe(true);
        },
    );

    it("stays safe if it stops after replacing the show, before the journal moves", () => {
        tearMidSave(showPath);
        const journal = fs.readFileSync(journalPathFor(showPath));

        expect(recover()).toMatchObject({ from: "journal" });
        // As if the journal move never happened: the journal is back next to the recovered show.
        fs.writeFileSync(journalPathFor(showPath), journal);

        // SQLite plays it back over the recovered show on the next open, to the same result.
        const db = new DatabaseSync(showPath);
        db.prepare("SELECT 1").get();
        db.close();
        expect(fs.existsSync(journalPathFor(showPath))).toBe(false);
        expect(inspect(showPath)).toEqual({ integrity: "ok", rows: ROWS });
    });

    it("does nothing when the journal is gone", () => {
        expect(recover()).toEqual({ outcome: "no-journal" });
        expect(fs.existsSync(backupDir)).toBe(false);
    });
});
