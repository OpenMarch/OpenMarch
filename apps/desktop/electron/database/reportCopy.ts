/**
 * The copy of a show that goes with a bug report (fork #801).
 *
 * People send their show so we can reproduce a bug, not so we can read their
 * roster. The copy is scrubbed here, before it leaves the computer:
 * - performer names become "Performer <id>" (kept non-empty, so bugs that
 *   need names still show up), and performer and page notes are cleared;
 * - the undo/redo history and the timeline change log are emptied, because
 *   they keep old copies of rows, names included;
 * - the music is dropped unless the person asks to include it, and an audio
 *   file's path keeps only its file name (a path can hold a user name);
 * - the file is rebuilt with VACUUM, so nothing scrubbed survives in free pages.
 *
 * Tables or columns an older file lacks are skipped.
 */
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";

export interface ReportCopyOptions {
    /** Keep the music (`audio_files.data`). Off unless the person ticks "Include music". */
    readonly includeAudio: boolean;
}

/** The parts of a SQLite connection the scrub needs (node:sqlite's `DatabaseSync`). */
export interface ScrubbableDatabase {
    exec(sql: string): void;
    prepare(sql: string): { all(...params: unknown[]): unknown[] };
}

function columnsOf(db: ScrubbableDatabase, table: string): Set<string> {
    const rows = db
        .prepare(`SELECT name FROM pragma_table_info(?)`)
        .all(table) as { name: string }[];
    return new Set(rows.map((r) => r.name));
}

/**
 * Scrubs an already-made copy in place. Runs the changes first and empties
 * the history last, so rows the undo and change-log triggers write while
 * scrubbing are removed too.
 */
export function scrubReportCopy(
    db: ScrubbableDatabase,
    { includeAudio }: ReportCopyOptions,
) {
    const marchers = columnsOf(db, "marchers");
    if (marchers.has("name"))
        db.exec(
            "UPDATE marchers SET name = 'Performer ' || id WHERE name IS NOT NULL AND name != ''",
        );
    if (marchers.has("notes")) db.exec("UPDATE marchers SET notes = NULL");

    if (columnsOf(db, "pages").has("notes"))
        db.exec("UPDATE pages SET notes = NULL");

    const audio = columnsOf(db, "audio_files");
    if (audio.has("path")) {
        const rows = db.prepare("SELECT id, path FROM audio_files").all() as {
            id: number;
            path: string;
        }[];
        for (const { id, path } of rows) {
            const fileName = path.split(/[\\/]/).pop() ?? "";
            db.prepare("UPDATE audio_files SET path = ? WHERE id = ?").all(
                fileName,
                id,
            );
        }
    }
    if (!includeAudio && audio.has("data"))
        db.exec("UPDATE audio_files SET data = NULL");

    for (const table of [
        "history_undo",
        "history_redo",
        "timeline_change_log",
    ]) {
        if (columnsOf(db, table).size > 0) db.exec(`DELETE FROM ${table}`);
    }
}

/**
 * Writes a scrubbed copy of the show at `sourcePath` to `destinationPath`.
 * Reads through its own read-only connection, so the open show is untouched,
 * and `VACUUM INTO` takes a consistent snapshot even mid-write (WAL included).
 */
export function writeReportCopy(
    sourcePath: string,
    destinationPath: string,
    options: ReportCopyOptions,
) {
    if (fs.existsSync(destinationPath)) fs.rmSync(destinationPath);

    const source = new DatabaseSync(sourcePath, { readOnly: true });
    try {
        source.prepare("VACUUM INTO ?").all(destinationPath);
    } finally {
        source.close();
    }

    const copy = new DatabaseSync(destinationPath);
    try {
        copy.exec("PRAGMA journal_mode = DELETE");
        copy.exec("BEGIN");
        try {
            scrubReportCopy(copy, options);
            copy.exec("COMMIT");
        } catch (error) {
            copy.exec("ROLLBACK");
            throw error;
        }
        copy.exec("VACUUM");
    } finally {
        copy.close();
    }
}
