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
import { holdEntryStates, marcherPageStates } from "./holdMenuState";
import { holdReachBack } from "./holdExtent";
import type { BeatRange, HoldLight } from "./timelineHoldBars";
import type { HeldMark } from "@/db-functions/timelineHeldMarks";

/**
 * **Hold from last keyframe** as the UI runs it (holds, fork #472): one undo step, and a refusal
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
        key: "timeline.holdFromPrevious.endsWithoutArriving",
        defaultValue: "{names}: a move ends at {page} without arriving there",
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
 * What the toast after **Hold from last keyframe** says: who is Held now, and who wasn't and why,
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
        t(
            "timeline.holdFromPrevious.count",
            "{count, plural, one {# marcher} other {# marchers}}",
            { count: ids.length },
        );
    const reasons = (
        Object.keys(SKIP_WORDS) as HoldFromPreviousSkipReason[]
    ).flatMap((reason) => {
        const skips = result.skipped.filter((s) => s.reason === reason);
        const words = SKIP_WORDS[reason];
        // A move that ended without arriving, further back, names the page it ended at
        return [...new Set(skips.map((s) => s.atPage))].map((atPage) =>
            t(words.key, words.defaultValue, {
                names: names(
                    skips
                        .filter((s) => s.atPage === atPage)
                        .map((s) => s.marcherId),
                ),
                page: atPage === undefined ? page : pagesText([atPage]),
            }),
        );
    });
    if (result.held.length === 0 && reasons.length === 0) return null;
    const title =
        result.held.length > 0
            ? t("timeline.holdFromPrevious.done", "{names} {held} on {page}", {
                  names: names(result.held),
                  page: result.pagesCovered
                      ? pagesText(result.pagesCovered)
                      : page,
              })
            : t("timeline.holdFromPrevious.none", "Nobody {held} on {page}", {
                  page,
              });
    return {
        title,
        description:
            reasons.length === 0
                ? null
                : t(
                      "timeline.holdFromPrevious.notHeldReasons",
                      "Not {heldLower}: {reasons}",
                      { reasons: reasons.join("; ") },
                  ),
    };
}

/** **Hold from last keyframe** for `marcherIds` on the page box `box` (`holdFromPreviousPage`). */
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
 * What **Hold from last keyframe** would make on a page, for the pulsing bars while it's hovered:
 * for each selected marcher it would change, from what last put them there (`holdReachBack`, as
 * the command reaches) to the end of the page. Null when it would change no one. A marcher only
 * the command can rule out (a shape's move, say) shows here and is skipped, and named, on the click.
 *
 * @param rowsOf a marcher's rows
 * @param showStart where the show's first page starts
 */
export function holdFromPreviousLight({
    state,
    marcherIds,
    marks,
    rowsOf,
    showStart,
}: {
    state: PageKeepState;
    marcherIds: readonly number[];
    marks: readonly HeldMark[];
    rowsOf: (marcherId: number) => readonly BeatRange[];
    showStart: number;
}): HoldLight | null {
    const known = marcherPageStates(state, marks);
    const byMarcher = new Map<number, readonly BeatRange[]>();
    for (const id of marcherIds) {
        const own = marks.filter((m) => m.marcherId === id);
        // Held over any of the box, the command leaves them alone, a move of their own or not
        const heldThere = own.some(
            (m) => m.start < state.box.end && m.end > state.box.start,
        );
        if (heldThere || known.get(id) === "midMove") continue;
        const { beat } = holdReachBack({
            start: state.box.start,
            rows: rowsOf(id),
            marks: own,
            showStart,
        });
        byMarcher.set(id, [{ start: beat, end: state.box.end }]);
    }
    return byMarcher.size > 0 ? { byMarcher, wouldHold: true } : null;
}

/**
 * The page box menu's **Hold from last keyframe** entry from the selection's states on each page
 * box (`usePageKeepStates`) and the Held marks: it runs for every selected marcher and says what
 * it did, and is unavailable, saying why, where no selected marcher could become Held
 * (`holdEntryStates`). With nothing selected the states are empty, so the entry doesn't show.
 *
 * @param run the command, for tests; defaults to `holdFromPreviousOn`
 * @param marks every Held mark (`useHeldMarksStore`)
 */
export function holdFromPreviousMenu(
    states: readonly PageKeepState[],
    marcherIds: readonly number[],
    nameOf: MarcherNameOf | undefined,
    run: (
        box: PageBoxRange,
        marcherIds: readonly number[],
    ) => Promise<HoldFromPreviousResult> = holdFromPreviousOn,
    marks: readonly HeldMark[] = [],
): TimelinePageCommandMenu {
    const of = (pageId: string | number) =>
        states.find((s) => String(s.pageId) === String(pageId));
    const entryOn = (pageId: string | number) => {
        const state = of(pageId);
        return state && marcherIds.length > 0
            ? holdEntryStates(state, marks).holdFromPrevious
            : undefined;
    };
    return {
        entryOn,
        reasonFor: (pageId) => {
            const entry = entryOn(pageId);
            if (!entry) return undefined;
            if (entry.changes > 0) return null;
            return tolgee.t(
                "timeline.rangeMenu.holdFromPreviousNone",
                "Every selected marcher is already {heldLower} on {page}, or partway through a move",
                { ...holdTerms(), page: pagesText([of(pageId)!.pageName]) },
            );
        },
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
