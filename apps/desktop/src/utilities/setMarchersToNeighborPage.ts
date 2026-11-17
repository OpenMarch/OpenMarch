import type Page from "@/global/classes/Page";
import { getNextPage, getPreviousPage } from "@/global/classes/Page";
import {
    copyPagePositions,
    neighborPageTarget,
    timelinePositionsSettled,
    type PagePositionCopy,
    type TimelineNeighborPageRequest,
} from "@/timeline/timelineCoordinateWrites";
import {
    heldPagesText,
    timelineErrorMessage,
    toastTimelineError,
} from "@/timeline/timelineErrorMessages";
import type { TimelineMoveResult } from "@/db-functions/timelineMoves";
import type { HeldConflict } from "@/db-functions/timelineHeldMarks";
import { joinList } from "@/timeline/translateTimelineText";
import { holdTerms } from "@/timeline/holdTerms";

/**
 * "Set all or selected marchers to the previous or next page", the four batch-edit actions in
 * `useBatchEditActionHandlers`, as a plain function so it can be tested without React
 * (docs/timeline/phases/07-page-parity.md P7.6, reworked for sparse rows by defined-coordinates
 * README, Recommendation 3). It waits for earlier timeline writes to reach the resolver, plans the
 * moves with `copyPagePositions` (the resolver at the neighbor page's end beat), and writes them as
 * one edit over the selected page's box with the range writer (`neighborPageTarget`,
 * `moveMarchersInTarget`), so it works on a page the marchers only hold through:
 *
 * - **Next page** moves each marcher to its next-page position there.
 * - **Previous page** is **Clear this page** (holds decision 16): each marcher is taken out of
 *   every move over the page, so the page is Not set and follows earlier pages again (and later
 *   edits before it carry through). A move shared with others, or longer than the page, is cut in
 *   time at the page's flags first (`takeMarchersOutOfRangeInTransaction`); where others share a
 *   move whose path a cut would change, only a move of the marcher's own is cut, so they keep
 *   their motion. Shape and follow-the-leader members, and marchers split by marcher can't take
 *   into a move of their own (an inheriting follow-the-leader order), are left as they are; the
 *   write names them, and they aren't counted. On the first page of a Held hold that runs on, the
 *   later pages' hold goes too (its arrival is gone).
 *   - **Clear Page N** (#573) keeps the next page where it was: a marcher that would follow back
 *     there gets a move of its own to its old spot, as Remove keyframe does. With `followBack`
 *     (**Clear Page N, Pages N–M follow back**) the later pages follow back instead.
 *   - It shows **no message** when it cleared everyone: the field and timeline show it, and Undo
 *     is the safety net (owner, #573). Only a partial result says something, quietly
 *     (`notify.note`): who was skipped and why, and whose later hold went too.
 *
 * Next page's success message shows only once the edit is written; a refused edit writes nothing
 * and the write's own error handler shows why.
 */

export type NeighborPageDirection = "previous" | "next";
export type NeighborPageScope = "all" | "selected";

export interface SetMarchersToNeighborPageArgs {
    direction: NeighborPageDirection;
    scope: NeighborPageScope;
    selectedPage: Page;
    pages: Page[];
    selectedMarcherIds: readonly number[];
    /** Clear this page: the later pages follow back instead of keeping where they were */
    followBack?: boolean;
    /**
     * The performers "all" sets: items (props and equipment, C2.2) stay put. Every marcher the
     * resolver knows when omitted.
     */
    performerIds?: readonly number[];
    /**
     * The write (`moveMarchersInTarget`'s `mutateAsync`). It rejects when the edit is
     * refused, after its own error handler has shown the reason.
     */
    writeTimeline: (
        request: TimelineNeighborPageRequest,
    ) => Promise<TimelineMoveResult>;
    notify: {
        success: (message: string) => unknown;
        error: (message: string) => unknown;
        /** Clear this page's quiet message for a partial result */
        note?: (message: string) => unknown;
    };
    t: (key: string, params?: Record<string, string | number>) => string;
    /** Shows a timeline planning error; `toastTimelineError` by default */
    reportError?: (error: unknown) => void;
}

const MESSAGES = {
    previous: {
        none: "actions.batchEdit.noPreviousPage",
        all: null,
        selected: null,
        param: "previousPage",
    },
    next: {
        none: "actions.batchEdit.noNextPage",
        all: "actions.batchEdit.movedAllToNextSpots",
        selected: "actions.batchEdit.movedSelectedToNextSpots",
        param: "nextPage",
    },
} as const;

/**
 * Runs one of the four actions (see the module comment).
 *
 * @returns the number of marchers set, or null when nothing was set (no neighbor page, nothing
 *   selected, a planning error or a refused write)
 */
// eslint-disable-next-line max-lines-per-function
export async function setMarchersToNeighborPage({
    direction,
    scope,
    selectedPage,
    pages,
    selectedMarcherIds,
    followBack = false,
    performerIds,
    writeTimeline,
    notify,
    t,
    reportError = (e) => toastTimelineError(e),
}: SetMarchersToNeighborPageArgs): Promise<number | null> {
    const messages = MESSAGES[direction];
    const neighbor =
        direction === "previous"
            ? getPreviousPage(selectedPage, pages)
            : getNextPage(selectedPage, pages);
    const succeed = (count: number) => {
        const key = messages[scope];
        if (key)
            notify.success(
                t(key, {
                    ...holdTerms(),
                    count,
                    currentPage: selectedPage.name,
                    [messages.param]: neighbor!.name,
                }),
            );
        return count;
    };
    // Clear this page's partial result: who it left alone and why, and whose later hold went
    const notePartial = (
        skipped: TimelineMoveResult["skipped"],
        laterHolds: HeldConflict | undefined,
    ) => {
        const parts = [
            ...(skipped ? [timelineErrorMessage(skipped)] : []),
            ...(laterHolds && laterHolds.names.length > 0
                ? [
                      t("actions.batchEdit.clearThisPageHoldsToo", {
                          count: laterHolds.names.length,
                          names: joinList(laterHolds.names),
                          pages: heldPagesText(laterHolds.pages),
                      }),
                  ]
                : []),
        ];
        if (parts.length > 0) notify.note?.(parts.join(" "));
    };

    if (!neighbor) {
        notify.error(t(messages.none));
        return null;
    }
    const marcherIds = scope === "all" ? performerIds : selectedMarcherIds;
    if (marcherIds?.length === 0) return null;
    // A write still in flight (a nudge pressed just before) must reach the resolver first, or the
    // plan starts from stale positions
    await timelinePositionsSettled();
    let copy: PagePositionCopy;
    let target: TimelineNeighborPageRequest["target"];
    try {
        copy = copyPagePositions({
            page: selectedPage,
            source: neighbor,
            marcherIds,
        });
        target = neighborPageTarget(selectedPage);
    } catch (e) {
        reportError(e);
        return null;
    }
    const count = copy.marcherIds.length;
    if (count === 0) return null;
    // Previous clears own moves even where they already go nowhere, so every marcher is sent.
    // Basic's point target on the page's flag clears them too (its mid-page points with them)
    const clearPage = direction === "previous" && target.kind !== "home";
    const moves = clearPage ? copy.targets : copy.moves;
    let skipped = 0;
    if (moves.length > 0) {
        try {
            const written = await writeTimeline({
                target,
                moves,
                clearPage,
                ...(clearPage ? { keepLaterPages: !followBack } : {}),
            });
            skipped = written.skipped?.marcherIds.length ?? 0;
            if (clearPage)
                notePartial(written.skipped, written.clearedLaterHolds);
        } catch {
            // Refused or failed: nothing was written, and the write's error handler said why
            return null;
        }
    }
    // Shape and follow-the-leader members Clear this page left alone aren't counted
    if (count - skipped === 0) return null;
    return succeed(count - skipped);
}
