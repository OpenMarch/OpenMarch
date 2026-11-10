import { toast } from "sonner";
import { db } from "@/global/database/db";
import tolgee from "@/global/singletons/Tolgee";
import type { DbConnection } from "@/db-functions/types";
import {
    holdOverWindow,
    type HoldOverWindowResult,
    type HoldOverWindowSkipReason,
} from "@/db-functions/timelineHoldOverWindow";
import { marcherNamesText, type MarcherNameOf } from "./timelineKeepLater";
import { toastTimelineError } from "./timelineErrorMessages";
import { holdTerms } from "./holdTerms";
import { holdOverWindowStart, holdWindowInShow } from "./holdExtent";
import type { BeatRange, HoldLight } from "./timelineHoldBars";
import type { HeldMark } from "@/db-functions/timelineHeldMarks";

/**
 * **Hold over the window** (the start flag to the playhead; holds, fork #476) as the UI runs it.
 * One undo step, and it says nothing when it holds everyone it was given: the timeline and the
 * field show the hold. Only the marchers it left alone get a toast, naming them and why (a shape
 * or follow-the-leader member keeps refusing, with a reason, until #434 / #504). A refusal is a
 * toast, never thrown.
 */

type SkipReason = HoldOverWindowSkipReason;

/** Why a marcher wasn't held, as the toast says it, by reason. */
const SKIP_WORDS: Record<SkipReason, { key: string; defaultValue: string }> = {
    held: {
        key: "timeline.expertHolds.held",
        defaultValue:
            "{names}: already {heldLower} from the start flag to the playhead",
    },
    shape: {
        key: "timeline.expertHolds.shape",
        defaultValue:
            "{names}: in a shape between the start flag and the playhead",
    },
    followLeader: {
        key: "timeline.expertHolds.followLeader",
        defaultValue:
            "{names}: follows the leader between the start flag and the playhead",
    },
    followLeaderOrder: {
        key: "timeline.expertHolds.followLeaderOrder",
        defaultValue:
            "{names}: shares a curved move with a follow-the-leader order",
    },
    arrivalShape: {
        key: "timeline.expertHolds.arrivalShape",
        defaultValue: "{names}: the hold would start where a shape ends",
    },
    arrivalFollowLeader: {
        key: "timeline.expertHolds.arrivalFollowLeader",
        defaultValue:
            "{names}: the hold would start where a follow-the-leader move ends",
    },
    homeShape: {
        key: "timeline.expertHolds.homeShape",
        defaultValue:
            "{names}: a shape sets the starting spot. Ungroup it at the start of the show to hold them one by one",
    },
    endsWithoutArriving: {
        key: "timeline.expertHolds.endsWithoutArriving",
        defaultValue:
            "{names}: the last move before the start flag ends without arriving there",
    },
};

/**
 * What the toast after Hold over the window says about the marchers it left alone, or null when it
 * held everyone (no toast).
 */
export function expertHoldSkipMessage(
    result: HoldOverWindowResult,
    nameOf: MarcherNameOf | undefined,
): { title: string; description: string } | null {
    if (result.skipped.length === 0) return null;
    const t = (key: string, defaultValue: string, params = {}) =>
        tolgee.t(key, defaultValue, { ...holdTerms(), ...params });
    const names = (ids: readonly number[]) =>
        marcherNamesText(ids, nameOf, t) ??
        t(
            "timeline.expertHolds.count",
            "{count, plural, one {# marcher} other {# marchers}}",
            { count: ids.length },
        );
    const reasons = (Object.keys(SKIP_WORDS) as SkipReason[]).flatMap(
        (reason) => {
            const ids = result.skipped
                .filter((s) => s.reason === reason)
                .map((s) => s.marcherId);
            if (ids.length === 0) return [];
            const words = SKIP_WORDS[reason];
            return [t(words.key, words.defaultValue, { names: names(ids) })];
        },
    );
    return {
        title: t(
            "timeline.expertHolds.notHeld",
            "{count, plural, one {# marcher} other {# marchers}} not {heldLower}",
            { count: result.skipped.length },
        ),
        description: reasons.join("; "),
    };
}

/** **Hold over the window** `[start, end)` for `marcherIds` (`holdOverWindow`). */
export async function holdOverWindowOn(
    window: { start: number; end: number },
    marcherIds: readonly number[],
    nameOf: MarcherNameOf | undefined,
    database: DbConnection = db,
): Promise<HoldOverWindowResult> {
    try {
        const result = await holdOverWindow({
            db: database,
            window,
            marcherIds,
        });
        const message = expertHoldSkipMessage(result, nameOf);
        if (message)
            toast.info(message.title, { description: message.description });
        return result;
    } catch (error) {
        toastTimelineError(error, "Error holding marchers");
        return { held: [], skipped: [] };
    }
}

/**
 * What **Hold over the window** would make, for the bars while it's highlighted: for each selected
 * marcher it would change, from where the write would start it (`holdOverWindowStart`) to the
 * playhead. Null when it would change no one. A marcher only the command can rule out (a shape's
 * move, say) shows here and is skipped, and named, on the click.
 *
 * @param rowsOf a marcher's moves
 * @param showStart where the show's first page starts
 * @param showEnd the last page flag
 */
export function holdOverWindowLight({
    window: asked,
    marcherIds,
    marks,
    rowsOf,
    showStart,
    showEnd,
}: {
    window: BeatRange;
    marcherIds: readonly number[];
    marks: readonly HeldMark[];
    rowsOf: (marcherId: number) => readonly BeatRange[];
    showStart: number;
    showEnd: number;
}): HoldLight | null {
    const window = holdWindowInShow(asked, showStart, showEnd);
    if (!window) return null;
    const byMarcher = new Map<number, readonly BeatRange[]>();
    for (const id of marcherIds) {
        const own = marks.filter((m) => m.marcherId === id);
        if (own.some((m) => m.start <= window.start && window.end <= m.end))
            continue;
        const start = holdOverWindowStart({
            windowStart: window.start,
            rows: rowsOf(id),
            marks: own,
            showStart,
        });
        byMarcher.set(id, [{ start, end: window.end }]);
    }
    return byMarcher.size > 0 ? { byMarcher, wouldHold: true } : null;
}
