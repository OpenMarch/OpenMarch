import { db } from "@/global/database/db";
import tolgee from "@/global/singletons/Tolgee";
import type { DbConnection } from "@/db-functions/types";
import {
    setAsShownOnPage,
    type SetAsShownResult,
} from "@/db-functions/timelineSetAsShown";
import type { TimelineSetAsShownMenu } from "@/components/timeline/TimelineRangeMenu";
import type { PageBoxRange } from "./timelinePageBoxState";
import { pagesText, type PageKeepState } from "./timelineKeepLater";
import { holdTerms } from "./holdTerms";
import { holdEntryStates, marcherPageStates } from "./holdMenuState";
import type { HeldMark } from "@/db-functions/timelineHeldMarks";
import { toastTimelineError } from "./timelineErrorMessages";

/**
 * **Set as shown** as the UI runs it (holds, fork #466): one undo step, and a refusal is a toast,
 * never thrown. The page box menu offers it for the selected marchers that are Not set on the
 * page (`holdEntryStates`).
 */

const NOTHING: SetAsShownResult = { changed: [], skipped: [] };

/** **Set as shown** for `marcherIds` on the page box `box` (`setAsShownOnPage`). */
export async function setAsShownOn(
    box: PageBoxRange,
    marcherIds: readonly number[],
    database: DbConnection = db,
): Promise<SetAsShownResult> {
    try {
        const result = await setAsShownOnPage({
            db: database,
            pageBox: box,
            marcherIds,
        });
        return result;
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
 * (`usePageKeepStates`) and the Held marks: it runs for the selected marchers that are Not defined
 * there (`holdEntryStates`), and says why not when none is. With nothing selected the states are
 * empty, so the entry doesn't show.
 *
 * @param run the command, for tests; defaults to `setAsShownOn`
 * @param marks every Held mark (`useHeldMarksStore`): a Held marcher isn't Not defined
 */
export function setAsShownMenu(
    states: readonly PageKeepState[],
    run: (
        box: PageBoxRange,
        marcherIds: readonly number[],
    ) => unknown = setAsShownOn,
    marks: readonly HeldMark[] = [],
): TimelineSetAsShownMenu {
    const of = (pageId: string | number) =>
        states.find((s) => String(s.pageId) === String(pageId));
    const entryOn = (pageId: string | number) => {
        const state = of(pageId);
        return state && holdEntryStates(state, marks).defineAsShown;
    };
    const notDefined = (state: PageKeepState) => {
        const states = marcherPageStates(state, marks);
        return state.follows.filter((id) => states.get(id) === "notDefined");
    };
    return {
        entryOn,
        reasonFor: (pageId) => {
            const state = of(pageId);
            if (!state) return undefined;
            if (entryOn(pageId)!.changes > 0) return null;
            return tolgee.t(
                "timeline.rangeMenu.setAsShownNone",
                "Every selected marcher is already {definedLower} or {heldLower} on {page}, or partway through a move",
                { ...holdTerms(), page: pagesText([state.pageName]) },
            );
        },
        onSet: (pageId) => {
            const state = of(pageId);
            const ids = state ? notDefined(state) : [];
            if (state && ids.length > 0) void run(state.box, ids);
        },
    };
}
