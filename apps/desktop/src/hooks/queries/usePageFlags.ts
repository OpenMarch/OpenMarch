import { useCallback, useMemo } from "react";
import {
    mutationOptions,
    QueryClient,
    useMutation,
    useQueryClient,
} from "@tanstack/react-query";
import { db } from "@/global/database/db";
import {
    addPageFlag,
    deletePageFlags,
    movePageFlag,
    type MovedPageFlag,
    pageFlagGrid,
    planPageFlagInsertion,
    type AddedPageFlag,
    type PageFlagInsertion,
} from "@/db-functions/pageFlags";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import { invalidatePageQueries } from "./usePages";

/**
 * Page flag writes in timeline mode (ui.md UI-9 **+** and Deleting a flag, P8.13). They change only
 * page rows and `last_page_counts`, so they invalidate the page queries and nothing on the
 * timeline side. A refusal (E-ARGS) shows its message as a toast.
 */

/**
 * **+** at a beat. Resolves to the new page and its range `[startBeat, endBeat)`, the page timeline
 * the UI selects next (`onAdded`).
 */
export const addPageFlagMutationOptions = (
    qc: QueryClient,
    onAdded?: (added: AddedPageFlag) => void,
) =>
    mutationOptions({
        mutationFn: (beat: number) => addPageFlag({ db, beat }),
        onSuccess: (added) => {
            void invalidatePageQueries(qc);
            onAdded?.(added);
        },
        onError: (e) => toastTimelineError(e),
    });

/** Deleting page flags: each page's row only, so motion is unchanged. */
export const deletePageFlagsMutationOptions = (qc: QueryClient) =>
    mutationOptions({
        mutationFn: (pageIds: ReadonlySet<number>) =>
            deletePageFlags({ db, pageIds }),
        onSuccess: () => void invalidatePageQueries(qc),
        onError: (e) => toastTimelineError(e),
    });

/**
 * Moving page `pageId`'s flag to `beat` (docs/timeline/research/move-page-flag). Unlike **+** and
 * deleting a flag it ripples the timeline rows on the flag, which the resolver picks up from the
 * database's change events, so only the page queries are invalidated here. `onMoved` gets the
 * move, for the selection to follow it.
 */
export const movePageFlagMutationOptions = (
    qc: QueryClient,
    onMoved?: (moved: MovedPageFlag) => void,
) =>
    mutationOptions({
        mutationFn: ({ pageId, beat }: { pageId: number; beat: number }) =>
            movePageFlag({ db, pageId, beat }),
        // Settles once the pages are read again, so a dragged flag isn't drawn back meanwhile
        onSuccess: async (moved) => {
            if (moved.from !== moved.to) onMoved?.(moved);
            await invalidatePageQueries(qc);
        },
        onError: (e) => toastTimelineError(e),
    });

/**
 * **+** for the paused playhead (UI-9): what it would add at `playheadBeat`, or null where it isn't
 * shown (playing, on a flag, at home, past the show's beats), and `add` to run it as one edit.
 * `pages` are the renderer's pages (`useTimingObjects`) and `beatCount` the show's beat count,
 * beat 0 included. `onAdded` gets the new page and its range, for selecting its page timeline.
 */
export function useAddPageFlag({
    pages,
    beatCount,
    playheadBeat,
    isPlaying,
    onAdded,
}: {
    pages: Parameters<typeof pageFlagGrid>[0];
    beatCount: number;
    playheadBeat: number;
    isPlaying: boolean;
    onAdded?: (added: AddedPageFlag) => void;
}): { insertion: PageFlagInsertion | null; add: () => void } {
    const queryClient = useQueryClient();
    const { mutate } = useMutation(
        addPageFlagMutationOptions(queryClient, onAdded),
    );
    const insertion = useMemo(
        () =>
            isPlaying
                ? null
                : planPageFlagInsertion(
                      pageFlagGrid(pages, beatCount),
                      playheadBeat,
                  ),
        [pages, beatCount, playheadBeat, isPlaying],
    );
    const add = useCallback(() => {
        if (insertion) mutate(insertion.beat);
    }, [insertion, mutate]);
    return { insertion, add };
}
