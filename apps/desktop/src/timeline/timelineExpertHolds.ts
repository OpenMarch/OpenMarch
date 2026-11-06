import { toast } from "sonner";
import { db } from "@/global/database/db";
import tolgee from "@/global/singletons/Tolgee";
import type { DbConnection } from "@/db-functions/types";
import {
    holdOverWindow,
    type HoldOverWindowResult,
    type HoldOverWindowSkipReason,
} from "@/db-functions/timelineHoldOverWindow";
import {
    makeSelectedHeld,
    type MakeHeldResult,
    type MakeHeldSkipReason,
} from "@/db-functions/timelineMakeHeld";
import { marcherNamesText, type MarcherNameOf } from "./timelineKeepLater";
import { toastTimelineError } from "./timelineErrorMessages";
import { holdTerms } from "./holdTerms";

/**
 * The Expert hold tools as the UI runs them (holds, fork #476): **Hold over the window** (the
 * start flag to the playhead) and **Make all selected Held**. Each is one undo step and says
 * nothing when it holds everyone it was given: the timeline and the field show the hold. Only the
 * marchers it left alone get a toast, naming them and why (a shape or follow-the-leader member
 * keeps refusing, with a reason, until #434 / #504). A refusal is a toast, never thrown.
 */

type SkipReason = HoldOverWindowSkipReason | MakeHeldSkipReason;

/** Why a marcher wasn't held, as the toast says it, by reason. */
const SKIP_WORDS: Record<SkipReason, { key: string; defaultValue: string }> = {
    held: {
        key: "timeline.expertHolds.held",
        defaultValue:
            "{names}: already {heldLower} from the start flag to the playhead",
    },
    moving: {
        key: "timeline.expertHolds.moving",
        defaultValue: "{names}: partway through a move at the playhead",
    },
    defined: {
        key: "timeline.expertHolds.defined",
        defaultValue: "{names}: {definedLower} at the playhead",
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
    noArrival: {
        key: "timeline.expertHolds.noArrival",
        defaultValue: "{names}: no move ends where the hold would start",
    },
};

/**
 * What the toast after an Expert hold tool says about the marchers it left alone, or null when it
 * held everyone (no toast).
 */
export function expertHoldSkipMessage(
    result: HoldOverWindowResult | MakeHeldResult,
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

const say = <R extends HoldOverWindowResult | MakeHeldResult>(
    result: R,
    nameOf: MarcherNameOf | undefined,
): R => {
    const message = expertHoldSkipMessage(result, nameOf);
    if (message)
        toast.info(message.title, { description: message.description });
    return result;
};

/** **Hold over the window** `[start, end)` for `marcherIds` (`holdOverWindow`). */
export async function holdOverWindowOn(
    window: { start: number; end: number },
    marcherIds: readonly number[],
    nameOf: MarcherNameOf | undefined,
    database: DbConnection = db,
): Promise<HoldOverWindowResult> {
    try {
        return say(
            await holdOverWindow({ db: database, window, marcherIds }),
            nameOf,
        );
    } catch (error) {
        toastTimelineError(error, "Error holding marchers");
        return { held: [], skipped: [] };
    }
}

/** **Make all selected Held** at `beat` for `marcherIds` (`makeSelectedHeld`). */
export async function makeSelectedHeldAt(
    beat: number,
    marcherIds: readonly number[],
    nameOf: MarcherNameOf | undefined,
    database: DbConnection = db,
): Promise<MakeHeldResult> {
    try {
        return say(
            await makeSelectedHeld({ db: database, beat, marcherIds }),
            nameOf,
        );
    } catch (error) {
        toastTimelineError(error, "Error holding marchers");
        return { held: [], skipped: [] };
    }
}
