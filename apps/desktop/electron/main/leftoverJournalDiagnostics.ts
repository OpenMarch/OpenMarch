/**
 * What the leftover journal that stopped an open (`LEFTOVER_JOURNAL_STATUS`) looks like, for the
 * error report. Shows keep stopping at a leftover journal, and the cause isn't known: a sync app
 * locking or restoring it, antivirus or Windows "Controlled folder access" blocking the app, a
 * delete Windows hasn't finished, a read-only share. These facts tell those apart.
 *
 * No paths or names: they hold people's names and show titles. Main process only.
 */
import * as fs from "fs";
import * as path from "path";
import { journalPathFor } from "../database/leftoverJournal";
import { cloudSyncServiceFor } from "./cloudSyncFolder";

export interface LeftoverJournalFacts {
    platform: NodeJS.Platform;
    /** The sync app whose folder holds the show, or "none". */
    syncService: string;
    showBytes: number | null;
    journalBytes: number | null;
    /** Permission bits, in octal. On Windows, 444 means the read-only attribute is set. */
    journalMode: string | null;
    /** Seconds from the show's last change to the journal's; negative when the journal is older. */
    journalAfterShowSeconds: number | null;
    /** How long ago the journal last changed, in seconds. */
    journalAgeSeconds: number | null;
    /** The error code opening the journal to read, or "ok". */
    journalOpenForRead: string;
    /** The error code opening the journal to write (nothing is written), or "ok". */
    journalOpenForWrite: string;
    /** Whether the app may create files in the show's folder. */
    folderWritable: boolean;
}

/** The error code `fn` throws, or "ok". */
function tryCode(fn: () => void): string {
    try {
        fn();
        return "ok";
    } catch (error) {
        return (error as NodeJS.ErrnoException).code ?? "error";
    }
}

function tryOpen(file: string, flags: string): string {
    return tryCode(() => fs.closeSync(fs.openSync(file, flags)));
}

function statOrNull(file: string): fs.Stats | null {
    try {
        return fs.statSync(file);
    } catch {
        return null;
    }
}

export function describeLeftoverJournal(
    dbPath: string,
    now = Date.now(),
): LeftoverJournalFacts {
    const journal = journalPathFor(dbPath);
    const show = statOrNull(dbPath);
    const journalStat = statOrNull(journal);
    return {
        platform: process.platform,
        syncService: cloudSyncServiceFor(dbPath) ?? "none",
        showBytes: show?.size ?? null,
        journalBytes: journalStat?.size ?? null,
        journalMode: journalStat
            ? (journalStat.mode & 0o777).toString(8)
            : null,
        journalAfterShowSeconds:
            show && journalStat
                ? Math.round((journalStat.mtimeMs - show.mtimeMs) / 1000)
                : null,
        journalAgeSeconds: journalStat
            ? Math.round((now - journalStat.mtimeMs) / 1000)
            : null,
        journalOpenForRead: tryOpen(journal, "r"),
        journalOpenForWrite: tryOpen(journal, "r+"),
        folderWritable:
            tryCode(() =>
                fs.accessSync(path.dirname(dbPath), fs.constants.W_OK),
            ) === "ok",
    };
}
