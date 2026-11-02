import { db } from "@/global/database/db";
import tolgee from "@/global/singletons/Tolgee";
import type { DbConnection } from "@/db-functions/types";
import {
    setAsShownOnPage,
    type SetAsShownResult,
} from "@/db-functions/timelineSetAsShown";
import type { TimelineSetAsShownMenu } from "@/components/timeline/TimelineRangeMenu";
import type { KeptPageBox } from "./timelineKept";
import { pagesText, type PageKeepState } from "./timelineKeepLater";
import { toastTimelineError } from "./timelineErrorMessages";

/**
 * **Set as shown** as the UI runs it (holds, fork #466): one undo step, and a refusal is a toast,
 * never thrown. The page box menu offers it for the selected marchers that are Not set on the
 * page (`PageKeepState.follows`).
 */

const NOTHING: SetAsShownResult = { changed: [], skipped: [] };

/** **Set as shown** for `marcherIds` on the page box `box` (`setAsShownOnPage`). */
export async function setAsShownOn(
    box: KeptPageBox,
    marcherIds: readonly number[],
    database: DbConnection = db,
): Promise<SetAsShownResult> {
    try {
        return await setAsShownOnPage({
            db: database,
            pageBox: box,
            marcherIds,
        });
    } catch (error) {
        toastTimelineError(
            error,
            tolgee.t(
                "timeline.rangeMenu.setAsShownError",
                "Error setting marchers as shown",
            ),
        );
        return NOTHING;
    }
}

/**
 * The page box menu's **Set as shown** entry from the selection's states on each page box
 * (`usePageKeepStates`): it runs for the selected marchers that are Not set there, and says why
 * not when none is. With nothing selected the states are empty, so the entry doesn't show.
 *
 * @param run the command, for tests; defaults to `setAsShownOn`
 */
export function setAsShownMenu(
    states: readonly PageKeepState[],
    run: (
        box: KeptPageBox,
        marcherIds: readonly number[],
    ) => unknown = setAsShownOn,
): TimelineSetAsShownMenu {
    const of = (pageId: string | number) =>
        states.find((s) => String(s.pageId) === String(pageId));
    return {
        reasonFor: (pageId) => {
            const state = of(pageId);
            if (!state) return undefined;
            if (state.follows.length > 0) return null;
            return tolgee.t(
                "timeline.rangeMenu.setAsShownNone",
                "Every selected marcher is already set on {page}, or partway through a move",
                { page: pagesText([state.pageName]) },
            );
        },
        onSet: (pageId) => {
            const state = of(pageId);
            if (state && state.follows.length > 0)
                void run(state.box, state.follows);
        },
    };
}
