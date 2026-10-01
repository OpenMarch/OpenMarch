import type { ModifiedMarcherPageArgs } from "@/db-functions/marcherPage";
import type { MarcherPagesByMarcher } from "@/global/classes/MarcherPageIndex";
import type Page from "@/global/classes/Page";
import { getNextPage, getPreviousPage } from "@/global/classes/Page";
import {
    copyPagePositions,
    timelinePositionsSettled,
    type PagePositionCopy,
    type TimelineMoveRequest,
} from "@/timeline/timelineCoordinateWrites";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";

/**
 * "Set all or selected marchers to the previous or next page", the four batch-edit actions in
 * `RegisteredActionsHandler`, as a plain function so both modes can be tested without React.
 *
 * - **Page mode** (unchanged): copies the neighbor page's `marcher_pages` rows to the selected page.
 * - **Timeline mode** (docs/timeline/phases/07-page-parity.md P7.6): waits for earlier timeline
 *   writes to reach the resolver, plans the moves with `copyPagePositions` (the resolver at the
 *   neighbor page's end beat), and writes them as one `moveMarchersOnPage` edit. `marcher_pages` is
 *   never read. The success message shows only once the edit is written; a refused edit writes
 *   nothing and the write's own error handler shows why.
 */

export type NeighborPageDirection = "previous" | "next";
export type NeighborPageScope = "all" | "selected";

export interface SetMarchersToNeighborPageArgs {
    timelineMode: boolean;
    direction: NeighborPageDirection;
    scope: NeighborPageScope;
    selectedPage: Page;
    pages: Page[];
    selectedMarcherIds: readonly number[];
    /** Page mode only: the neighbor page's rows by marcher id. Not read in timeline mode. */
    neighborMarcherPages: MarcherPagesByMarcher | undefined;
    /** Page mode's write (`updateMarcherPages`) */
    writePages: (changes: ModifiedMarcherPageArgs[]) => void;
    /**
     * Timeline mode's write (`moveMarchersOnPage`'s `mutateAsync`). It rejects when the edit is
     * refused, after its own error handler has shown the reason.
     */
    writeTimeline: (request: TimelineMoveRequest) => Promise<unknown>;
    notify: {
        success: (message: string) => unknown;
        error: (message: string) => unknown;
    };
    t: (key: string, params?: Record<string, string | number>) => string;
    /** Shows a timeline planning error; `toastTimelineError` by default */
    reportError?: (error: unknown) => void;
}

const MESSAGES = {
    previous: {
        none: "actions.batchEdit.noPreviousPage",
        all: "actions.batchEdit.setAllToPreviousSuccess",
        selected: "actions.batchEdit.setSelectedToPreviousSuccess",
        param: "previousPage",
    },
    next: {
        none: "actions.batchEdit.noNextPage",
        all: "actions.batchEdit.setAllToNextSuccess",
        selected: "actions.batchEdit.setSelectedToNextSuccess",
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
    timelineMode,
    direction,
    scope,
    selectedPage,
    pages,
    selectedMarcherIds,
    neighborMarcherPages,
    writePages,
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
        notify.success(
            t(messages[scope], {
                count,
                currentPage: selectedPage.name,
                [messages.param]: neighbor!.name,
            }),
        );
        return count;
    };

    if (!timelineMode) {
        if (!neighbor || !neighborMarcherPages) {
            notify.error(t(messages.none));
            return null;
        }
        const rows =
            scope === "all"
                ? Object.values(neighborMarcherPages)
                : selectedMarcherIds
                      .map((id) => neighborMarcherPages[id])
                      .filter(Boolean);
        if (scope === "selected" && rows.length === 0) return null;
        writePages(
            rows.map((marcherPage) => ({
                marcher_id: marcherPage.marcher_id,
                page_id: selectedPage.id,
                x: marcherPage.x as number,
                y: marcherPage.y as number,
                notes: marcherPage.notes || undefined,
            })),
        );
        return succeed(rows.length);
    }

    if (!neighbor) {
        notify.error(t(messages.none));
        return null;
    }
    const marcherIds = scope === "all" ? undefined : selectedMarcherIds;
    if (marcherIds?.length === 0) return null;
    // A write still in flight (a nudge pressed just before) must reach the resolver first, or the
    // plan starts from stale positions
    await timelinePositionsSettled();
    let copy: PagePositionCopy;
    try {
        copy = copyPagePositions({
            page: selectedPage,
            source: neighbor,
            marcherIds,
        });
    } catch (e) {
        reportError(e);
        return null;
    }
    const count = copy.marcherIds.length;
    if (count === 0) return null;
    if (copy.moves.length > 0) {
        try {
            await writeTimeline({ page: selectedPage, moves: copy.moves });
        } catch {
            // Refused or failed: nothing was written, and the write's error handler said why
            return null;
        }
    }
    return succeed(count);
}
