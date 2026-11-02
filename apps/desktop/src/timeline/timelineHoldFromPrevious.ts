import { toast } from "sonner";
import { db } from "@/global/database/db";
import tolgee from "@/global/singletons/Tolgee";
import type { DbConnection } from "@/db-functions/types";
import {
    holdFromPreviousPage,
    type HoldFromPreviousResult,
    type HoldFromPreviousSkipReason,
} from "@/db-functions/timelineHoldFromPrevious";
import type { TimelinePageCommandMenu } from "@/components/timeline/TimelineRangeMenu";
import type { PageBoxRange } from "./timelinePageBoxState";
import {
    marcherNamesText,
    pagesText,
    type MarcherNameOf,
    type PageKeepState,
} from "./timelineKeepLater";
import { toastTimelineError } from "./timelineErrorMessages";
import { holdTerms } from "./holdTerms";

/**
 * **Hold from previous page** as the UI runs it (holds, fork #472): one undo step, and a refusal
 * is a toast, never thrown. The page box menu offers it whenever marchers are selected; the
 * command holds those it can and the toast names the others, with why.
 */

const NOTHING: HoldFromPreviousResult = { held: [], skipped: [] };

/** Why a marcher wasn't held, as the toast says it, by reason. */
const SKIP_WORDS: Record<
    HoldFromPreviousSkipReason,
    { key: string; defaultValue: string }
> = {
    noArrival: {
        key: "timeline.holdFromPrevious.noArrival",
        defaultValue: "{names}: no move ends where {page} starts",
    },
    held: {
        key: "timeline.holdFromPrevious.held",
        defaultValue: "{names}: already {held} here",
    },
    crossesFlag: {
        key: "timeline.holdFromPrevious.crossesFlag",
        defaultValue: "{names}: a move runs across one of the page's flags",
    },
    expertMoves: {
        key: "timeline.holdFromPrevious.expertMoves",
        defaultValue: "{names}: Expert moves on this page",
    },
    shape: {
        key: "timeline.holdFromPrevious.shape",
        defaultValue: "{names}: in a shape on this page",
    },
    followLeader: {
        key: "timeline.holdFromPrevious.followLeader",
        defaultValue: "{names}: follows the leader on this page",
    },
    arrivalShape: {
        key: "timeline.holdFromPrevious.arrivalShape",
        defaultValue: "{names}: the move before {page} ends in a shape",
    },
    arrivalFollowLeader: {
        key: "timeline.holdFromPrevious.arrivalFollowLeader",
        defaultValue: "{names}: the move before {page} follows the leader",
    },
    homeShape: {
        key: "timeline.holdFromPrevious.homeShape",
        defaultValue:
            "{names}: a shape sets the starting spot. Ungroup it at the start of the show to hold them one by one",
    },
};

/**
 * What the toast after **Hold from previous page** says: who is Held now, and who wasn't and why,
 * or null when it has nothing to say.
 */
export function holdFromPreviousMessage(
    result: HoldFromPreviousResult,
    pageName: string,
    nameOf: MarcherNameOf | undefined,
): { title: string; description: string | null } | null {
    const page = pagesText([pageName]);
    const t = (key: string, defaultValue: string, params = {}) =>
        tolgee.t(key, defaultValue, { ...holdTerms(), ...params });
    const names = (ids: readonly number[]) =>
        marcherNamesText(ids, nameOf, t) ??
        t("timeline.holdFromPrevious.count", "{count} marchers", {
            count: ids.length,
        });
    const reasons = (
        Object.keys(SKIP_WORDS) as HoldFromPreviousSkipReason[]
    ).flatMap((reason) => {
        const ids = result.skipped
            .filter((s) => s.reason === reason)
            .map((s) => s.marcherId);
        if (ids.length === 0) return [];
        const words = SKIP_WORDS[reason];
        return [t(words.key, words.defaultValue, { names: names(ids), page })];
    });
    if (result.held.length === 0 && reasons.length === 0) return null;
    const title =
        result.held.length > 0
            ? t("timeline.holdFromPrevious.done", "{names} {held} on {page}", {
                  names: names(result.held),
                  page,
              })
            : t("timeline.holdFromPrevious.none", "Nobody {held} on {page}", {
                  page,
              });
    return {
        title,
        description:
            reasons.length === 0
                ? null
                : `${t("timeline.holdFromPrevious.notHeld", "Not {heldLower}:")} ${reasons.join("; ")}`,
    };
}

/** **Hold from previous page** for `marcherIds` on the page box `box` (`holdFromPreviousPage`). */
export async function holdFromPreviousOn(
    box: PageBoxRange,
    marcherIds: readonly number[],
    database: DbConnection = db,
): Promise<HoldFromPreviousResult> {
    try {
        return await holdFromPreviousPage({
            db: database,
            pageBox: box,
            marcherIds,
        });
    } catch (error) {
        toastTimelineError(error, "Error holding marchers");
        return NOTHING;
    }
}

/**
 * The page box menu's **Hold from previous page** entry from the selection's states on each page
 * box (`usePageKeepStates`): it runs for every selected marcher and says what it did. With nothing
 * selected the states are empty, so the entry doesn't show.
 *
 * @param run the command, for tests; defaults to `holdFromPreviousOn`
 */
export function holdFromPreviousMenu(
    states: readonly PageKeepState[],
    marcherIds: readonly number[],
    nameOf: MarcherNameOf | undefined,
    run: (
        box: PageBoxRange,
        marcherIds: readonly number[],
    ) => Promise<HoldFromPreviousResult> = holdFromPreviousOn,
): TimelinePageCommandMenu {
    const of = (pageId: string | number) =>
        states.find((s) => String(s.pageId) === String(pageId));
    return {
        reasonFor: (pageId) =>
            of(pageId) && marcherIds.length > 0 ? null : undefined,
        onSet: (pageId) => {
            const state = of(pageId);
            if (!state || marcherIds.length === 0) return;
            void run(state.box, marcherIds).then((result) => {
                const message = holdFromPreviousMessage(
                    result,
                    state.pageName,
                    nameOf,
                );
                if (message)
                    toast.info(message.title, {
                        ...(message.description
                            ? { description: message.description }
                            : {}),
                    });
            });
        },
    };
}
