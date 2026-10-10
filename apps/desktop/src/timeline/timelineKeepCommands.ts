import { db } from "@/global/database/db";
import type { DbConnection } from "@/db-functions/types";
import {
    followAgainOnPage,
    keepMarchersOnPage,
    type KeepResult,
} from "@/db-functions/timelineKeepHere";
import { readKeptAssignmentIds } from "@/db-functions/timelineKeptMarkers";
import type { KeptPageBox } from "./timelineKept";
import { keepToggle } from "./timelineKeepLater";
import { toastTimelineError } from "./timelineErrorMessages";
import { useTimelineResolverStore } from "./timelineStore";
import {
    applyKeptChange,
    keepPagesOf,
    sharedPageKeepStates,
} from "./useKeepLaterPages";

/**
 * The keep later pages commands as the UI runs them (the chains, the inspector line, the page box
 * menu and **K**): one undo step each, and a refusal is a toast, never thrown.
 */

const NOTHING: KeepResult = {
    changed: [],
    skipped: [],
    markers: { added: [], removed: [] },
};

/** **Keep** `marcherIds` on the page box `box` (`keepMarchersOnPage`). */
export async function keepOnPage(
    box: KeptPageBox,
    marcherIds: readonly number[],
    database: DbConnection = db,
): Promise<KeepResult> {
    try {
        const result = await keepMarchersOnPage({
            db: database,
            pageBox: box,
            marcherIds,
        });
        applyKeptChange(result.markers);
        return result;
    } catch (error) {
        toastTimelineError(error, "Error keeping marchers on the page");
        return NOTHING;
    }
}

/** **Follow again** for `marcherIds` on the page box `box` (`followAgainOnPage`). */
export async function followAgainOn(
    box: KeptPageBox,
    marcherIds: readonly number[],
    database: DbConnection = db,
): Promise<KeepResult> {
    try {
        const result = await followAgainOnPage({
            db: database,
            pageBox: box,
            marcherIds,
        });
        applyKeptChange(result.markers);
        return result;
    } catch (error) {
        toastTimelineError(error, "Error letting marchers follow again");
        return NOTHING;
    }
}

/**
 * **K**: where the selected marchers hold on the page `currentPageId`, toggles keep there; where
 * they move on it, toggles keep on the next page (`keepToggle`). Reads the kept markers from the
 * file, not the renderer's copy, so a quick second press sees the first. No toast: the chain and
 * the inspector line show what changed.
 *
 * @returns what it did, or null when nothing applied
 */
export async function toggleKeepOnPage({
    database = db,
    pages,
    currentPageId,
    marcherIds,
}: {
    database?: DbConnection;
    pages: Parameters<typeof keepPagesOf>[0];
    currentPageId: number;
    marcherIds: readonly number[];
}): Promise<"keep" | "follow" | null> {
    const resolver = useTimelineResolverStore.getState().resolver;
    if (!resolver || marcherIds.length === 0) return null;
    const keepPages = keepPagesOf(pages);
    let kept: Set<number>;
    try {
        kept = await readKeptAssignmentIds(database);
    } catch (error) {
        toastTimelineError(error, "Error reading the kept spots");
        return null;
    }
    const toggle = keepToggle(
        // The panel's and the inspector's result, when the file's markers match the renderer's
        sharedPageKeepStates({
            resolver,
            version: useTimelineResolverStore.getState().version,
            kept,
            pages,
            marcherIds,
        }),
        currentPageId,
        keepPages[0]?.id ?? null,
    );
    if (!toggle) return null;
    const result =
        toggle.action === "keep"
            ? await keepOnPage(toggle.box, toggle.marcherIds, database)
            : await followAgainOn(toggle.box, toggle.marcherIds, database);
    return result.changed.length > 0 ? toggle.action : null;
}
