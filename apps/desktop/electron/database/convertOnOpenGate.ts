/**
 * The light half of convert on open (ADR 0001 §6): the status codes, the
 * conversion marker, and how a new file starts as a timeline file. It imports
 * nothing from the renderer, so the main process (and the renderer, for the
 * status codes) can load it at startup. The conversion itself is in
 * `convertOnOpen.ts`.
 */
import type { DatabaseSync } from "node:sqlite";

/**
 * Status an open returns when it stopped and the main process already told the
 * person why in a dialog (a failed backup or conversion, or they chose not to
 * open the file). Nothing is open. The main process doesn't send it as a
 * `load-file-response`, and the renderer shows nothing more for it.
 */
export const OPEN_STOPPED_STATUS = 499;

/**
 * Status an open returns for a page-era file the person hasn't agreed to
 * convert yet (HTTP 428, "Precondition Required"). Nothing was written to the
 * file and nothing is open. The main process keeps the file as the pending
 * conversion and the renderer asks the person (`ConvertShowDialog`); it isn't
 * sent as a `load-file-response`.
 */
export const NEEDS_CONVERSION_STATUS = 428;

/**
 * A page-era file waiting for the person to agree to convert it. The main
 * process holds one at a time; the renderer reads it (`conversion:getPending`)
 * and answers with `conversion:confirm` or `conversion:cancel`.
 */
export interface PendingConversion {
    /** The show's absolute path. */
    filePath: string;
    /** The show's file name, for example `Fall Show.dots`. */
    fileName: string;
    /** Where the untouched copy will be written, next to the show. */
    backupPath: string;
    /** The backup's file name, for example `Fall Show.pre-conversion.dots`. */
    backupFileName: string;
    /** The folder the show and its backup are in. */
    folder: string;
}

/**
 * Workspace-settings key that marks a file as converted to timelines (P9.3;
 * ADR 0001 §6): an ISO timestamp, written in the conversion transaction and
 * when a new file starts as a timeline file. Opening a file doesn't read it:
 * every version-7 file is converted alike. The worker host reads it to tell
 * whether a worker that ended without a result committed its conversion, and
 * the previous-show import reads it to pick the tables to read.
 */
export const TIMELINE_CONVERTED_AT_KEY = "timelineConvertedAt";

/** The settings object in `json`, or `{}` when it's missing, unparsable or not an object. */
function parseSettings(
    json: string | null | undefined,
): Record<string, unknown> {
    try {
        const parsed: unknown = json == null ? {} : JSON.parse(json);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
            return parsed as Record<string, unknown>;
    } catch {
        // fall through
    }
    return {};
}

/**
 * `workspace_settings.json_data` with the conversion marker set to
 * `convertedAt`, keeping the other settings except the retired `timelineMode`
 * dev flag. Missing, unparsable or non-object JSON becomes just the marker;
 * the renderer would have read it as the defaults anyway.
 */
export function withConversionMarker(
    json: string | null | undefined,
    convertedAt: string,
): string {
    const { timelineMode: _retired, ...settings } = parseSettings(json);
    return JSON.stringify({
        ...settings,
        [TIMELINE_CONVERTED_AT_KEY]: convertedAt,
    });
}

/** The conversion marker's time in the settings JSON, or undefined when there is none. */
export function conversionMarkerOf(
    json: string | null | undefined,
): string | undefined {
    const marker = parseSettings(json)[TIMELINE_CONVERTED_AT_KEY];
    return typeof marker === "string" ? marker : undefined;
}

/** True when the settings JSON carries the conversion marker. */
export function hasConversionMarker(json: string | null | undefined): boolean {
    return conversionMarkerOf(json) !== undefined;
}

/**
 * Reads `workspace_settings.json_data` (the first row), or undefined when
 * there is none or the file predates the table.
 */
export function readWorkspaceSettingsJson(
    db: DatabaseSync,
): string | undefined {
    const table = db
        .prepare(
            "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'workspace_settings'",
        )
        .get();
    if (!table) return undefined;
    const row = db
        .prepare("SELECT json_data FROM workspace_settings LIMIT 1")
        .get() as { json_data: string } | undefined;
    return row?.json_data;
}

/**
 * Marks a file the app just created (migrated and initialized, already at
 * `user_version = 8`) as a timeline file with the conversion marker. It has no
 * marchers yet, and no timeline rows, like a converted show with only page 0.
 */
export function initializeNewFileAsTimeline(
    db: DatabaseSync,
    now: () => Date = () => new Date(),
): void {
    db.exec("BEGIN IMMEDIATE");
    try {
        const row = db
            .prepare("SELECT id, json_data FROM workspace_settings LIMIT 1")
            .get() as { id: number; json_data: string } | undefined;
        const json = withConversionMarker(row?.json_data, now().toISOString());
        if (row)
            db.prepare(
                "UPDATE workspace_settings SET json_data = ? WHERE id = ?",
            ).run(json, row.id);
        else
            db.prepare(
                "INSERT INTO workspace_settings (id, json_data) VALUES (1, ?)",
            ).run(json);
        db.exec("COMMIT");
    } catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }
}

const tableExists = (db: DatabaseSync, name: string) =>
    !!db
        .prepare(
            "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?",
        )
        .get(name);

/**
 * Number of timelines plus timeline shapes (transitions live under
 * timelines), or 0 for a file that predates the timeline tables.
 */
export function countTimelineRows(db: DatabaseSync): number {
    if (!tableExists(db, "timelines") || !tableExists(db, "timeline_shapes"))
        return 0;
    const row = db
        .prepare(
            "SELECT (SELECT count(*) FROM timelines) + (SELECT count(*) FROM timeline_shapes) AS n",
        )
        .get() as { n: number };
    return Number(row.n);
}

/**
 * True when the file still has the page-era table the converter reads positions from
 * (`marcher_pages`). Every page-era file has it; the conversion's `0020_drop_page_era` drops it.
 */
export function hasPageEraTables(db: DatabaseSync): boolean {
    return tableExists(db, "marcher_pages");
}

/**
 * Why a version-7 file without its page-era tables can't be converted. The
 * open's "Couldn't convert your file" dialog shows it,
 * and it isn't reported as an error.
 */
export const NO_PAGES_TO_CONVERT_MESSAGE =
    "It has no pages to convert from. It may have been converted to timelines already and then saved by an older version of OpenMarch.";
