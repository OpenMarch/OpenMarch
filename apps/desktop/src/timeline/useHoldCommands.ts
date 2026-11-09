import { useMemo } from "react";
import type { TimelinePageCommandMenu } from "@/components/timeline/TimelineRangeMenu";
import { holdFromPreviousMenu } from "./timelineHoldFromPrevious";
import type { MarcherNameOf } from "./timelineKeepLater";
import { setAsShownMenu } from "./timelineSetAsShown";
import { usePageKeepStates } from "./useKeepLaterPages";
import { useHeldMarksStore } from "./useHeldMarks";
import {
    holdEntryStates,
    type HoldCommand,
    type HoldEntryState,
} from "./holdMenuState";

/** The page box name type `usePageKeepStates` reads */
type Pages = Parameters<typeof usePageKeepStates>[0];

/**
 * The two hold commands for the selected marchers, by page id: **Define as shown** (#466) and
 * **Hold from previous page** (#472). The page box menu runs them on the page right-clicked, and
 * the `timelineDefineAsShown` and `timelineHoldFromPrevious` actions on the current page
 * (`useHoldActionHandlers`), so both run the same commands with the same refusals and toasts.
 *
 * Both read the Held marks (`useHeldMarksStore`) with the keep states, so each says what it would
 * do for the selection (`holdEntryStates`), and `entriesOn` gives all three entries, Clear this
 * page's too, by page. They're worked out again whenever the resolver or the marks change, so a
 * menu opened after an edit shows the new states.
 *
 * @param marcherIds the selected marchers; keep the array stable while the selection is
 */
export function useHoldCommands(
    pages: Pages,
    marcherIds: readonly number[],
    nameOf: MarcherNameOf | undefined,
) {
    const keepStates = usePageKeepStates(pages, marcherIds);
    const marks = useHeldMarksStore((s) => s.marks);
    const defineAsShown = useMemo(
        () => setAsShownMenu(keepStates, undefined, marks),
        [keepStates, marks],
    );
    const holdFromPrevious = useMemo(
        () =>
            holdFromPreviousMenu(
                keepStates,
                marcherIds,
                nameOf,
                undefined,
                marks,
            ),
        [keepStates, marcherIds, nameOf, marks],
    );
    const entriesOn = useMemo(
        () =>
            (
                pageId: string | number | undefined,
            ): Record<HoldCommand, HoldEntryState> | null => {
                const state = keepStates.find(
                    (s) => String(s.pageId) === String(pageId),
                );
                return state && marcherIds.length > 0
                    ? holdEntryStates(state, marks)
                    : null;
            },
        [keepStates, marcherIds, marks],
    );
    return { defineAsShown, holdFromPrevious, entriesOn };
}

/**
 * A hold command's action options on a page (`useActionHandler`): checked, and so off, when every
 * selected marcher is already in its state. No counts: the menu can't know every marcher the write
 * will refuse (no arrival, Expert moves, shapes), so a number would promise too much.
 */
export function holdActionOptions(entry: HoldEntryState | null | undefined): {
    checked: boolean;
} {
    return { checked: entry?.checked ?? false };
}

/** Whether a hold command can run on the page: it's offered there and says no reason not to. */
export function canRunOn(
    command: TimelinePageCommandMenu,
    pageId: string | number | undefined,
): boolean {
    return pageId !== undefined && command.reasonFor(pageId) === null;
}
