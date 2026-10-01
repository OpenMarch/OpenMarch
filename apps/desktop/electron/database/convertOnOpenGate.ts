/**
 * The light half of convert on open (P9.3): the gate, the status code, and
 * how a new file starts in timeline mode. It imports nothing from the renderer,
 * so the main process (and the renderer, for the status code) can load it at
 * startup. The conversion itself is in `convertOnOpen.ts`, which the main
 * process loads only once the gate is on.
 *
 * Until P9.4 removes the dev flag, convert on open only runs when the
 * `OPENMARCH_CONVERT_ON_OPEN` environment variable is `1` or `true`. It is off
 * by default, so the app behaves as before.
 */
import type { DatabaseSync } from "node:sqlite";
import { TIMELINE_MODEL_USER_VERSION } from "./fileVersion";

/** Environment variable that turns convert on open on until P9.4 removes the dev flag. */
export const CONVERT_ON_OPEN_ENV = "OPENMARCH_CONVERT_ON_OPEN";

/** True when convert on open is turned on: the variable is `1` or `true` (any case). */
export function isConvertOnOpenEnabled(
    env: Record<string, string | undefined> = process.env,
): boolean {
    const value = env[CONVERT_ON_OPEN_ENV]?.trim().toLowerCase();
    return value === "1" || value === "true";
}

/**
 * Status an open returns when it stopped and the main process already told the
 * person why in a dialog (a failed backup or conversion, or they chose not to
 * open the file). Nothing is open. The main process doesn't send it as a
 * `load-file-response`, and the renderer shows nothing more for it.
 */
export const OPEN_STOPPED_STATUS = 499;

/**
 * Workspace-settings key that marks a file as converted to timelines (P9.3;
 * ADR 0001 §6): an ISO timestamp, written in the conversion transaction and
 * when a new file starts as a timeline file. It outlives the version: a release
 * without the version guard resets `user_version` to 7 but keeps this key
 * unless it saves the workspace settings (its schema drops unknown keys).
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
 * `workspace_settings.json_data` with `timelineMode: true` and the conversion
 * marker set to `convertedAt`, keeping the other settings. Missing, unparsable
 * or non-object JSON becomes just those two keys; the renderer would have read
 * it as the defaults anyway.
 */
export function withTimelineModeOn(
    json: string | null | undefined,
    convertedAt: string,
): string {
    return JSON.stringify({
        ...parseSettings(json),
        timelineMode: true,
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

/** Reads `workspace_settings.json_data` (the first row), or undefined when there is none. */
export function readWorkspaceSettingsJson(
    db: DatabaseSync,
): string | undefined {
    const row = db
        .prepare("SELECT json_data FROM workspace_settings LIMIT 1")
        .get() as { json_data: string } | undefined;
    return row?.json_data;
}

/**
 * Makes a file the app just created (migrated and initialized) a timeline file:
 * the `timelineMode` flag on, the conversion marker, and `user_version = 8`,
 * in one transaction. It has no marchers yet; marchers added later get their
 * homes from the timeline write paths. Like a converted show with only page 0,
 * it has no timeline rows. Lead decision for P9.3: with the gate on, new files
 * are created converted, with no backup.
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
        const json = withTimelineModeOn(row?.json_data, now().toISOString());
        if (row)
            db.prepare(
                "UPDATE workspace_settings SET json_data = ? WHERE id = ?",
            ).run(json, row.id);
        else
            db.prepare(
                "INSERT INTO workspace_settings (id, json_data) VALUES (1, ?)",
            ).run(json);
        db.exec(`PRAGMA user_version = ${TIMELINE_MODEL_USER_VERSION}`);
        db.exec("COMMIT");
    } catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }
}
