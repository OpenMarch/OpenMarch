/**
 * `.dots` file-format version, stored in SQLite's `PRAGMA user_version`.
 *
 * See ADR 0001 §6 (docs/adr/0001-timeline-motion-model.md). The app reads the
 * version before it changes anything in a file, and refuses a file written by a
 * newer release instead of rewriting its version and migrating it.
 *
 * - 7: page model. 7 is left over from the pre-Drizzle migration system; every
 *   Drizzle-era file is at 7.
 * - 8: timeline model (Phase 9 converts files to it). This release accepts it so
 *   that it can read files written once Phase 9 ships.
 */
import type { DatabaseSync } from "node:sqlite";

/** Version of a page-model file. */
export const PAGE_MODEL_USER_VERSION = 7;
/** Version of a timeline-model file (written by Phase 9's conversion). */
export const TIMELINE_MODEL_USER_VERSION = 8;

/** Oldest version this build opens. Older files must go through 0.0.10 first. */
export const MIN_SUPPORTED_USER_VERSION = PAGE_MODEL_USER_VERSION;
/** Newest version this build opens. Anything higher was written by a newer release. */
export const MAX_SUPPORTED_USER_VERSION = TIMELINE_MODEL_USER_VERSION;
/** Version written into a brand-new file. Phase 9 changes this to 8. */
export const NEW_FILE_USER_VERSION = PAGE_MODEL_USER_VERSION;

/**
 * Status code that `setDbPath` returns for a file from a newer release.
 * 426 is HTTP "Upgrade Required"; the renderer maps it to an "update OpenMarch" dialog.
 */
export const FILE_TOO_NEW_STATUS = 426;

export type FileVersionDecision =
    /** Open the file as it is. Its version is not written. */
    | { action: "accept"; version: number }
    /** A new, empty file: set its version to `version` before migrating. */
    | { action: "initialize"; version: number }
    /** Written by a newer release. Don't write anything to the file. */
    | { action: "refuse-too-new"; version: number }
    /**
     * Older than this build supports (from 0.0.9 or earlier, or not an
     * OpenMarch file). Its version is not written; the migration service rejects
     * it with instructions to open it in 0.0.10 first, as before.
     */
    | { action: "refuse-too-old"; version: number };

/**
 * Decides what to do with a file, given its `user_version`, before anything
 * writes to it.
 *
 * @param userVersion the file's `PRAGMA user_version`
 * @param isNewFile true when the app just created the file (it is empty, so its version is 0)
 */
export function decideFileVersion(
    userVersion: number,
    isNewFile: boolean,
): FileVersionDecision {
    if (!Number.isInteger(userVersion)) {
        throw new Error(`Invalid user_version: ${userVersion}`);
    }
    if (userVersion > MAX_SUPPORTED_USER_VERSION) {
        return { action: "refuse-too-new", version: userVersion };
    }
    if (isNewFile && userVersion === 0) {
        return { action: "initialize", version: NEW_FILE_USER_VERSION };
    }
    if (userVersion >= MIN_SUPPORTED_USER_VERSION) {
        return { action: "accept", version: userVersion };
    }
    return { action: "refuse-too-old", version: userVersion };
}

/** True when this build can open (and migrate) a file at `userVersion`. */
export function isSupportedUserVersion(userVersion: number): boolean {
    return (
        userVersion >= MIN_SUPPORTED_USER_VERSION &&
        userVersion <= MAX_SUPPORTED_USER_VERSION
    );
}

/** Reads `PRAGMA user_version`. Reading never writes to the file. */
export function readUserVersion(db: DatabaseSync): number {
    return (
        db.prepare("PRAGMA user_version").get() as {
            user_version: number;
        }
    ).user_version;
}

/**
 * Sets the version of a new file when `decideFileVersion` says to, and never
 * otherwise. Returns the decision so callers can act on a refusal.
 */
export function applyFileVersionDecision(
    db: DatabaseSync,
    isNewFile: boolean,
): FileVersionDecision {
    const decision = decideFileVersion(readUserVersion(db), isNewFile);
    if (decision.action === "initialize") {
        db.prepare(`PRAGMA user_version = ${decision.version}`).run();
    }
    return decision;
}

/** Message for a file from a newer release. The renderer shows a translated one. */
export function fileTooNewMessage(userVersion: number): string {
    return `This file was saved by a newer version of OpenMarch (file format ${userVersion}; this version supports up to ${MAX_SUPPORTED_USER_VERSION}). Update OpenMarch to open it.`;
}
