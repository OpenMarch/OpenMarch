/**
 * The copy of a show that goes with a bug report (fork #801).
 *
 * People send their show so we can reproduce a bug, not so we can read their
 * roster. The copy is scrubbed here, before it leaves the computer:
 * - every notes, description, nickname and label column is cleared, and names
 *   (performers, tags, timelines, shapes, …) become "<label> <id>";
 * - the undo/redo history and the timeline change log are emptied, because
 *   they keep old copies of rows, names included;
 * - the music is dropped unless the person asks to include it, and an audio
 *   file's path keeps only its file name (a path can hold a user name);
 * - imported models and other show assets (fork #1027) leave their files out
 *   unless the person asks to include them, but keep what debugging needs: each
 *   asset's sidecar (size, triangles, detail level) and, under
 *   `sidecar.reportCopy`, how many bytes each stored part had and whether the
 *   files came along. Names become "Model <n>", and credits keep only the
 *   license (author, source and attribution can name people);
 * - the file is rebuilt with VACUUM, so nothing scrubbed survives in free pages.
 *
 * Tables or columns an older file lacks are skipped.
 */
// cspell:ignore notnull
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";

export interface ReportCopyOptions {
    /** Keep the music (`audio_files.data`). Off unless the person ticks "Include music". */
    readonly includeAudio: boolean;
    /**
     * Keep imported models' files (`show_asset_blobs`). Off unless the person ticks "Include
     * imported models"; missing means off.
     */
    readonly includeAssets?: boolean;
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
 * Free-text columns cleared in every table that has them. `label` is a cue's (ADR 0015 D-9): it
 * says how the cue's performers were picked, which is often a tag's or a group's name.
 */
const CLEARED_COLUMNS = new Set(["notes", "description", "nickname", "label"]);
/** What a table's `name` becomes, "<label> <rowid>"; other tables use their own name. */
const NAME_LABELS: Readonly<Record<string, string>> = {
    marchers: "Performer",
    tags: "Tag",
    timelines: "Timeline",
    timeline_shapes: "Shape",
    shapes: "Shape",
};

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/**
 * Scrubs an already-made copy in place. Works from the file's own tables
 * rather than a fixed list, so older and fork-only tables are covered too:
 * every `notes`, `description`, `nickname` and `label` column is cleared, and every
 * nullable `name` column becomes "<label> <rowid>" (kept non-empty, so bugs
 * that need names still show up). Runs the changes first and empties the
 * history last, so rows the undo and change-log triggers write while
 * scrubbing are removed too.
 */
export function scrubReportCopy(
    db: ScrubbableDatabase,
    { includeAudio, includeAssets = false }: ReportCopyOptions,
) {
    const tables = (
        db
            .prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'",
            )
            .all() as { name: string }[]
    ).map((t) => t.name);

    // Guard triggers (e.g. "no changes to the first beat") would refuse the
    // scrub, and undo triggers would copy the old values into the history.
    // Set them aside and put them back exactly as they were.
    const triggers = db
        .prepare(
            "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL",
        )
        .all() as { name: string; sql: string }[];
    for (const { name } of triggers) db.exec(`DROP TRIGGER ${quote(name)}`);

    for (const table of tables) {
        const columns = db
            .prepare(
                `SELECT name, "notnull" AS required FROM pragma_table_info(?)`,
            )
            .all(table) as { name: string; required: number }[];
        for (const { name: column, required } of columns) {
            if (required) continue;
            if (CLEARED_COLUMNS.has(column))
                db.exec(
                    `UPDATE ${quote(table)} SET ${quote(column)} = NULL WHERE ${quote(column)} IS NOT NULL`,
                );
            else if (column === "name") {
                const label = (NAME_LABELS[table] ?? table).replaceAll(
                    "'",
                    "''",
                );
                db.exec(
                    `UPDATE ${quote(table)} SET name = '${label} ' || rowid WHERE name IS NOT NULL AND name != ''`,
                );
            }
        }
    }

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

    scrubShowAssets(db, includeAssets);

    for (const { sql } of triggers) db.exec(sql);

    for (const table of [
        "history_undo",
        "history_redo",
        "timeline_change_log",
    ]) {
        if (columnsOf(db, table).size > 0) db.exec(`DELETE FROM ${table}`);
    }
}

/** What an asset's name becomes in the copy, by kind: "Model <rowid>" */
const ASSET_LABELS: Readonly<Record<string, string>> = { model: "Model" };

/**
 * The show asset store in a report copy (fork #1027): names and credits scrubbed, each asset's
 * stored part sizes noted in its sidecar, and the files themselves dropped unless asked for.
 */
function scrubShowAssets(db: ScrubbableDatabase, includeFiles: boolean) {
    if (columnsOf(db, "show_assets").size === 0) return;
    const hasBlobs = columnsOf(db, "show_asset_blobs").has("data");
    const assets = db
        .prepare(
            "SELECT rowid AS row, kind, parts, sidecar, credits FROM show_assets",
        )
        .all() as {
        row: number;
        kind: string;
        parts: string;
        sidecar: string;
        credits: string;
    }[];
    const sizeOf = db.prepare(
        "SELECT length(data) AS bytes FROM show_asset_blobs WHERE hash = ?",
    );
    const update = db.prepare(
        "UPDATE show_assets SET name = ?, sidecar = ?, credits = ? WHERE rowid = ?",
    );
    for (const asset of assets) {
        const parts = parseObject(asset.parts);
        const partBytes: Record<string, number | null> = {};
        for (const [role, hash] of Object.entries(parts)) {
            const [row] = hasBlobs
                ? (sizeOf.all(hash) as { bytes: number | null }[])
                : [];
            partBytes[role] = row?.bytes ?? null;
        }
        const sidecar = {
            ...parseObject(asset.sidecar),
            reportCopy: { partBytes, filesIncluded: includeFiles && hasBlobs },
        };
        const license = parseObject(asset.credits).license;
        update.all(
            `${ASSET_LABELS[asset.kind] ?? "Asset"} ${asset.row}`,
            JSON.stringify(sidecar),
            JSON.stringify(typeof license === "string" ? { license } : {}),
            asset.row,
        );
    }
    if (!includeFiles && hasBlobs) db.exec("DELETE FROM show_asset_blobs");
}

function parseObject(json: string): Record<string, unknown> {
    try {
        const value: unknown = JSON.parse(json);
        return value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};
    } catch {
        return {};
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
        scrubAndCompact(copy, options);
    } finally {
        copy.close();
    }
}

/**
 * Scrubs a copy in one transaction, then rebuilds it with VACUUM so nothing
 * scrubbed survives in free pages. The web editor runs this on an in-memory
 * copy in its worker (`web/worker/index.ts`).
 */
export function scrubAndCompact(
    copy: ScrubbableDatabase,
    options: ReportCopyOptions,
) {
    copy.exec("BEGIN");
    try {
        scrubReportCopy(copy, options);
        copy.exec("COMMIT");
    } catch (error) {
        copy.exec("ROLLBACK");
        throw error;
    }
    copy.exec("VACUUM");
}
