/**
 * Leftover rollback journals next to a show file.
 *
 * Show files use SQLite's rollback journal (`<file>-journal`). A journal that is still there
 * when the file opens is "hot": SQLite takes it for an unfinished save and plays it back into
 * the file before anything reads it. Usually that is crash recovery doing its job. Two cases
 * go wrong:
 *
 * - SQLite can't open the journal to play it back (no permission, read-only, a folder the app
 *   may not write to). Every read then fails with SQLITE_CANTOPEN, "unable to open database
 *   file", and the show doesn't open.
 * - The journal isn't this file's (it was copied or downloaded with it). SQLite can't tell, so
 *   it plays it back anyway and may change the show.
 *
 * So before a show with a journal opens, the file and its journal are copied into the backups
 * folder (`backupBeforeJournalRecovery`), which makes any playback undoable. When the journal
 * can't be used, the open is refused with `LEFTOVER_JOURNAL_STATUS` and the person may recover
 * the show from copies (`electron/main/leftoverJournalRecovery.ts`).
 *
 * `setDbPath` uses the detection here, so the web build's worker loads this module too (its
 * `fs` shim has no files to find). No translated text here.
 */
import * as fs from "fs";
import * as path from "path";

export { LEFTOVER_JOURNAL_STATUS } from "./leftoverJournalStatus";

/** SQLite primary result codes (extended codes keep them in the low byte). */
const SQLITE_READONLY = 8;
const SQLITE_CANTOPEN = 14;

/** The first 8 bytes of a rollback journal's header. A zeroed or empty journal isn't hot. */
const JOURNAL_MAGIC = Buffer.from([
    0xd9, 0xd5, 0x05, 0xf9, 0x20, 0xa1, 0x63, 0xd7,
]);

/** Where SQLite keeps `dbPath`'s rollback journal. */
export function journalPathFor(dbPath: string): string {
    return `${dbPath}-journal`;
}

/**
 * True when a journal SQLite would try to play back sits next to `dbPath`: it starts with the
 * journal header. A journal that exists but can't be read counts too, since SQLite can't use
 * it either.
 */
export function hasLeftoverJournal(dbPath: string): boolean {
    const journal = journalPathFor(dbPath);
    let stat: fs.Stats;
    try {
        stat = fs.statSync(journal);
    } catch {
        return false;
    }
    if (!stat.isFile() || stat.size < JOURNAL_MAGIC.length) return false;

    let fd: number | undefined;
    try {
        fd = fs.openSync(journal, "r");
        const header = Buffer.alloc(JOURNAL_MAGIC.length);
        fs.readSync(fd, header, 0, header.length, 0);
        return header.equals(JOURNAL_MAGIC);
    } catch {
        return true;
    } finally {
        if (fd !== undefined) fs.closeSync(fd);
    }
}

/** The primary result code of a `node:sqlite` error, or undefined for other errors. */
function sqliteResultCode(error: unknown): number | undefined {
    if (typeof error !== "object" || error === null) return undefined;
    const errcode = (error as { errcode?: unknown }).errcode;
    return typeof errcode === "number" ? errcode & 0xff : undefined;
}

/** True for a `node:sqlite` error whose result code is SQLITE_CANTOPEN. */
export function isCantOpenError(error: unknown): boolean {
    return sqliteResultCode(error) === SQLITE_CANTOPEN;
}

/**
 * True for a `node:sqlite` error saying SQLite couldn't write next to a file it may write:
 * SQLITE_CANTOPEN (it couldn't open or create the journal) or SQLITE_READONLY (on Linux, a
 * folder it can't create the journal in makes the file read-only to it).
 */
export function isFolderAccessError(error: unknown): boolean {
    const code = sqliteResultCode(error);
    return code === SQLITE_CANTOPEN || code === SQLITE_READONLY;
}

/** `backup_<time>_<name>` in `backupDir`, the naming `backupBeforeMigrations` uses. */
export function backupNameFor(dbPath: string, now: Date): string {
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    return `backup_${timestamp}_${path.basename(dbPath)}`;
}

export interface JournalBackup {
    /** The copy of the show file. */
    showCopy: string;
    /** The copy of its journal, or null when the journal couldn't be read. */
    journalCopy: string | null;
}

/**
 * Copies `dbPath` and its leftover journal into `backupDir` before SQLite plays the journal
 * back, so a wrong playback can be undone. Does nothing (null) when there's no leftover
 * journal. The copies sit side by side under one name, `<name>` and `<name>-journal`, so
 * opening the copy plays its journal back exactly as the original would have.
 */
export function backupBeforeJournalRecovery(
    dbPath: string,
    backupDir: string,
    now = new Date(),
): JournalBackup | null {
    if (!hasLeftoverJournal(dbPath)) return null;
    fs.mkdirSync(backupDir, { recursive: true });
    const showCopy = path.join(backupDir, backupNameFor(dbPath, now));
    fs.copyFileSync(dbPath, showCopy);
    let journalCopy: string | null = journalPathFor(showCopy);
    try {
        fs.copyFileSync(journalPathFor(dbPath), journalCopy);
    } catch {
        // Unreadable: SQLite can't use it either, and the open offers to recover without it.
        journalCopy = null;
    }
    return { showCopy, journalCopy };
}
