/**
 * `.dots` file-format version, stored in SQLite's `PRAGMA user_version`.
 *
 * See ADR 0012 §6 (docs/adr/0012-timeline-motion-model.md). The app reads the
 * version before it changes anything in a file, and refuses a file written by a
 * newer release instead of rewriting its version and migrating it.
 *
 * - 7: page model. 7 is left over from the pre-Drizzle migration system; every
 *   Drizzle-era file before timelines is at 7. The app converts it to 8 when it
 *   opens it, once the person confirms (`convertOnOpen.ts`).
 * - 8: timeline model. New files start here.
 * - 9: a fork-only floor model (the field image as an embedded Base floor), since parked. No
 *   release wrote it. Such a file opens as the timeline file it is and is written back as 8,
 *   with its floor's image put back as the field image (`parkedFloor.ts`).
 * - 10: route model (ADR 0014, pathways steps 1 to 15, fork lab builds only). A move could follow
 *   a drawn path, stored in `timeline_routes` and walked by one-slot `route` transitions. Such a
 *   file opens here: migration 0025 moves its paths to lanes, and it is then written as 11.
 * - 11: lane model (ADR 0015 §9, pathways step 24). A slot walks a route through a lane
 *   (`timeline_lanes`), so a path no longer moves a marcher out of its move. A build that doesn't
 *   know lanes would play such a file wrong and edit it wrong (compact, split or recast a laned
 *   show and leave lanes on the wrong spot), so a file is written as 11 with its first lane (drawing
 *   a path), or when it opens with lanes (a migrated version-10 file). A file without a lane stays
 *   at the version it had. ADR 0015 §9: each later step that stores a fact an older build would
 *   play or edit wrong takes the next number; a number a lab build wrote is never reused.
 * - 12: Adjust (pathways step 3b, spec J.1 and J.2): a lane has its own displacement profile. A
 *   build that doesn't know it would walk that spot on the plain lane, so a file is written as 12
 *   with its first Adjust. A file without one stays at the version it had. The number is not
 *   lowered when an Adjust is reset or undone, as 11 isn't when the last path goes.
 * - 13: trails (pathways step 4, spec Appendix K): a follow-the-leader move follows a drawn trail
 *   (`timeline_transitions.route_id`), may have no destination shape (I-T5′, R-13′) and may be
 *   reversed (`path_params.reverse`, R-12′). A build that doesn't know trails would fail to resolve
 *   such a move, or walk it straight, so a file is written as 13 with its first Follow. A file
 *   without one stays at the version it had, and the number is not lowered when the trail goes.
 * - 14: arc legs (pathways step 10a, spec Appendix L, R-14″): a route point may carry `bulge` and
 *   a route `toBulge`, so a leg of a path or trail is a circular arc. A build that doesn't know
 *   them would walk the leg straight, or refuse the route, so a file is written as 14 when a route
 *   first gets a bulge. A file without one stays at the version it had, and the number is not
 *   lowered when the last arc goes.
 */
import type { DatabaseSync } from "node:sqlite";
import { recoverParkedFloorInTransaction } from "./parkedFloor";

/** Version of a page-model file. */
export const PAGE_MODEL_USER_VERSION = 7;
/** Version of a timeline-model file (new files, and files the conversion wrote). */
export const TIMELINE_MODEL_USER_VERSION = 8;

/** Version of a fork-internal file from the parked floor model. Opened, then written as 8. */
export const PARKED_FLOOR_USER_VERSION = 9;
/** Version a fork lab build (pathways steps 1 to 15) wrote with a file's first route (ADR 0014). */
export const ROUTE_MODEL_USER_VERSION = 10;
/** Version of a file that has a lane, a drawn path (ADR 0015 §9, pathways step 24). */
export const LANE_MODEL_USER_VERSION = 11;

/** Version of a file with an Adjust on a lane (ADR 0015 §9, pathways step 3b). */
export const ADJUST_MODEL_USER_VERSION = 12;

/** Version of a file with a follow-the-leader trail (pathways step 4, spec Appendix K). */
export const TRAIL_MODEL_USER_VERSION = 13;

/** Version of a file with an arc leg on a route (pathways step 10a, spec Appendix L). */
export const ARC_MODEL_USER_VERSION = 14;

/** Oldest version this build opens. Older files must go through 0.0.10 first. */
export const MIN_SUPPORTED_USER_VERSION = PAGE_MODEL_USER_VERSION;
/** Newest version this build opens. Anything higher was written by a newer release. */
export const MAX_SUPPORTED_USER_VERSION = ARC_MODEL_USER_VERSION;
/** Version written into a brand-new file: a new show is a timeline show. */
export const NEW_FILE_USER_VERSION = TIMELINE_MODEL_USER_VERSION;

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
    /** A parked floor-model file (9): write `version` (8) and open it as a timeline file. */
    | { action: "downgrade"; version: number }
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
    if (userVersion === PARKED_FLOOR_USER_VERSION) {
        return { action: "downgrade", version: TIMELINE_MODEL_USER_VERSION };
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

/**
 * True when this build can open (and migrate) a file at `userVersion` as it is. A parked
 * floor-model file (9) isn't: it is written back as 8 first (`decideFileVersion`).
 */
export function isSupportedUserVersion(userVersion: number): boolean {
    return (
        userVersion >= MIN_SUPPORTED_USER_VERSION &&
        userVersion <= MAX_SUPPORTED_USER_VERSION &&
        userVersion !== PARKED_FLOOR_USER_VERSION
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
 * Sets the version of a new file, or of a parked floor-model file, when `decideFileVersion` says
 * to, and never otherwise. Returns the decision so callers can act on a refusal.
 */
export function applyFileVersionDecision(
    db: DatabaseSync,
    isNewFile: boolean,
): FileVersionDecision {
    const decision = decideFileVersion(readUserVersion(db), isNewFile);
    if (decision.action === "initialize") {
        db.prepare(`PRAGMA user_version = ${decision.version}`).run();
    } else if (decision.action === "downgrade") {
        // The floor's image goes back in the same transaction as the version, so a failure
        // leaves the file at 9 to try again
        db.exec("BEGIN IMMEDIATE");
        try {
            recoverParkedFloorInTransaction(db);
            db.prepare(`PRAGMA user_version = ${decision.version}`).run();
            db.exec("COMMIT");
        } catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
    }
    return decision;
}

/** Message for a file from a newer release. The renderer shows a translated one. */
export function fileTooNewMessage(userVersion: number): string {
    return `This file was saved by a newer version of OpenMarch (file format ${userVersion}; this version supports up to ${MAX_SUPPORTED_USER_VERSION}). Update OpenMarch to open it.`;
}

/**
 * Writes the lane-model version (11) when the file has a lane and an older version: a version-10
 * file whose paths migration 0025 moved to lanes. Run after the migrations, on every open; a file
 * without lanes, or already at 11, is left as it is (ADR 0015 §9, QA-FV-L1).
 */
export function markLaneModelIfLaned(db: DatabaseSync): void {
    const hasTable = db
        .prepare(
            "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'timeline_lanes'",
        )
        .get();
    if (!hasTable) return;
    if (!db.prepare("SELECT 1 FROM timeline_lanes LIMIT 1").get()) return;
    if (readUserVersion(db) < LANE_MODEL_USER_VERSION)
        db.prepare(`PRAGMA user_version = ${LANE_MODEL_USER_VERSION}`).run();
}
