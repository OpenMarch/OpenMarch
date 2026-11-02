import { useMemo } from "react";
import type { TimelinePageCommandMenu } from "@/components/timeline/TimelineRangeMenu";
import { holdFromPreviousMenu } from "./timelineHoldFromPrevious";
import type { MarcherNameOf } from "./timelineKeepLater";
import { setAsShownMenu } from "./timelineSetAsShown";
import { usePageKeepStates } from "./useKeepLaterPages";

/** The page box name type `usePageKeepStates` reads */
type Pages = Parameters<typeof usePageKeepStates>[0];

/**
 * The two hold commands for the selected marchers, by page id: **Define as shown** (#466) and
 * **Hold from previous page** (#472). The page box menu runs them on the page right-clicked, and
 * the `timelineDefineAsShown` and `timelineHoldFromPrevious` actions on the current page
 * (`useHoldActionHandlers`), so both run the same commands with the same refusals and toasts.
 *
 * @param marcherIds the selected marchers; keep the array stable while the selection is
 */
export function useHoldCommands(
    pages: Pages,
    marcherIds: readonly number[],
    nameOf: MarcherNameOf | undefined,
) {
    const keepStates = usePageKeepStates(pages, marcherIds);
    const defineAsShown = useMemo(
        () => setAsShownMenu(keepStates),
        [keepStates],
    );
    const holdFromPrevious = useMemo(
        () => holdFromPreviousMenu(keepStates, marcherIds, nameOf),
        [keepStates, marcherIds, nameOf],
    );
    return { keepStates, defineAsShown, holdFromPrevious };
}

/** Whether a hold command can run on the page: it's offered there and says no reason not to. */
export function canRunOn(
    command: TimelinePageCommandMenu,
    pageId: string | number | undefined,
): boolean {
    return pageId !== undefined && command.reasonFor(pageId) === null;
}
