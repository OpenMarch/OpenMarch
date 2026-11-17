import tolgee from "@/global/singletons/Tolgee";
import { TimelineCommitViolationError } from "@/db-functions/timelineChanges";
import { TimelineWriteError } from "@/db-functions/timelineErrors";
import { conToastError } from "@/utilities/utils";
import { toast } from "sonner";
import { toastBasicLock } from "./basicLockToast";
import type { NotJoined } from "@/db-functions/timelineJoinAtBeat";
import { joinList } from "./translateTimelineText";
import { holdTerms } from "./holdTerms";
import type { HeldConflict } from "@/db-functions/timelineHeldConflict";
import {
    marcherNamesText,
    type KeepTranslate,
    type MarcherNameOf,
} from "./timelineKeepLater";
import { translateTimelineText } from "./translateTimelineText";
import type { TimelineTextArg } from "./timelineText";

/**
 * User-facing messages for the timeline's refusals (spec section 6, P8.6). One place maps every
 * error code a timeline write can fail with to a short message a person can act on, so the
 * toasts never show a raw code, a SQLite message or a stack.
 *
 * - The spec's codes (`E-S1`, `E-P1`, `E-T1` to `E-T6`, `E-A1` to `E-A3`), the app's `E-D2` and
 *   `E-N2`, and the Held marks' `E-H1` and `E-H3` each have a message. The combined codes the database reports when one trigger checks
 *   two invariants (`E-A1/E-A2`, `E-T3/E-T4`) have their own, which name both halves.
 * - `E-ARGS` is a refusal the write path words itself ("select the marchers to add"): its `text`
 *   (a key and arguments) is translated and shown. One without `text` is a developer-only message
 *   (a call the app never makes) and gets the generic message.
 * - `E-DB` is any other database rejection. The user gets a generic message; the original error
 *   (kept as the `cause`) goes to the log.
 * - Commit-time violations (`TimelineCommitViolationError`) map by their code, like row errors.
 * - Anything else is not a timeline refusal, and the caller's own message is used.
 *
 * Each message is a Tolgee key under `timeline.errors` with the English text as the default, so a
 * missing translation still reads well.
 */

export interface TimelineErrorMessage {
    key: string;
    defaultMessage: string;
}

/** Message by error code. */
export const TIMELINE_ERROR_MESSAGES: Readonly<
    Record<string, TimelineErrorMessage>
> = {
    "E-S1": {
        key: "timeline.errors.shapeInvalid",
        defaultMessage:
            "That shape isn't valid. Its points must be on the field, a line needs two different end points, a freehand path needs some length, and a circle, box or block needs a positive size.",
    },
    "E-P1": {
        key: "timeline.errors.pathParamsInvalid",
        defaultMessage:
            "That path setting isn't valid. An arc's bulge can be at most half the distance between its ends, and waypoints must be points on the field.",
    },
    "E-D2": {
        key: "timeline.errors.destinationInvalid",
        defaultMessage:
            "A destination isn't valid. Destinations must be finite points on the field.",
    },
    "E-N2": {
        key: "timeline.errors.numberOutOfRange",
        defaultMessage:
            "A number is out of range. Beats, layers, slot counts and positions must be whole or finite numbers within the allowed limits.",
    },
    "E-T1": {
        key: "timeline.errors.transitionSpansTimeline",
        defaultMessage:
            "A transition must span its whole timeline, starting and ending with it. Change the timeline's range instead, and its transitions move with it.",
    },
    "E-T3": {
        key: "timeline.errors.followLeaderBlock",
        defaultMessage:
            "A follow-the-leader transition can't end on a block. Choose a line, curve, circle or box instead.",
    },
    "E-T4": {
        key: "timeline.errors.blockTooSmall",
        defaultMessage:
            "The block doesn't have enough places for every slot. Add rows or columns, or use fewer slots.",
    },
    "E-T3/E-T4": {
        key: "timeline.errors.destinationShapeUnsuitable",
        defaultMessage:
            "That destination doesn't fit the transition. A follow-the-leader transition can't end on a block, and a block needs at least as many places as the transition has slots.",
    },
    "E-T5": {
        key: "timeline.errors.followLeaderNeedsShape",
        defaultMessage:
            "A follow-the-leader transition needs a shape to follow.",
    },
    "E-T6": {
        key: "timeline.errors.shapeOrDestinations",
        defaultMessage:
            "A transition uses either a shape or one individual destination for every slot, never both and never fewer.",
    },
    "E-A1": {
        key: "timeline.errors.assignmentOutsideTransition",
        defaultMessage:
            "A marcher's move must stay inside its transition. Adjust the transition's range, or the move's.",
    },
    "E-A2": {
        key: "timeline.errors.slotOutOfRange",
        defaultMessage:
            "That slot doesn't exist. A transition's slots are numbered from 0 up to one less than its slot count.",
    },
    "E-A1/E-A2": {
        key: "timeline.errors.assignmentDoesNotFit",
        defaultMessage:
            "That marcher's move doesn't fit the transition: it must stay inside the transition's range, and use a slot the transition has.",
    },
    "E-H1": {
        key: "timeline.errors.moveInHeldHold",
        defaultMessage:
            "That would put a move inside a {held} hold. {clearThisPage} to remove the hold, or drag inside it to move it.",
    },
    "E-H3": {
        key: "timeline.errors.heldHoldsOverlap",
        defaultMessage:
            "A marcher can't have two {held} holds over the same counts.",
    },
    "E-A3": {
        key: "timeline.errors.assignmentOverlap",
        defaultMessage:
            "That marcher already has a move on the same layer at those beats. Put one of them on a different layer, or move it.",
    },
};

export const TIMELINE_DB_ERROR_MESSAGE: TimelineErrorMessage = {
    key: "timeline.errors.database",
    defaultMessage:
        "The change couldn't be saved, so nothing was changed. Try again, and report it if it keeps happening.",
};

export const TIMELINE_UNKNOWN_ERROR_MESSAGE: TimelineErrorMessage = {
    key: "timeline.errors.unknown",
    defaultMessage: "The timeline couldn't make that change.",
};

/**
 * The commit-time E-T1 of a file converted by a development build from before P9.10, which wrote
 * one show-wide timeline holding a differently ranged transition per page. The commit check reads
 * the whole database, so every edit of such a file fails until it is converted again from its
 * backup.
 */
export const TIMELINE_LEGACY_CONVERSION_MESSAGE: TimelineErrorMessage = {
    key: "timeline.errors.legacyConvertedTimeline",
    defaultMessage:
        "This file was converted to timelines by an earlier development build, which put several page moves in one timeline, so it can't be edited. Convert it again: open its backup (the file saved next to it before the conversion).",
};

/**
 * True when a commit-time violation shows a timeline owning transitions of different ranges, the
 * shape an earlier development build's converter wrote (C-11). Each E-T1 row's detail names the
 * transition's range and its timeline's (`triggers.ts`); two rows with the same timeline range but
 * different transition ranges are that shape. The write functions never produce it.
 */
export function isLegacyConversionViolation(error: unknown): boolean {
    if (!(error instanceof TimelineCommitViolationError)) return false;
    const spansByTimeline = new Map<string, Set<string>>();
    for (const v of error.violations) {
        if (v.code !== "E-T1") continue;
        const match =
            /^transition spans (\[[^)]*\)) but its timeline spans (\[[^)]*\))$/.exec(
                v.detail,
            );
        if (!match) continue;
        const spans = spansByTimeline.get(match[2]!) ?? new Set<string>();
        spans.add(match[1]!);
        spansByTimeline.set(match[2]!, spans);
    }
    return [...spansByTimeline.values()].some((spans) => spans.size > 1);
}

/**
 * An E-H1 refusal that knows who (`TimelineCommitViolationError.held`): it names the marchers and
 * the page they are Held on, and the way out. `{count}` is how many marchers it names.
 */
export const HELD_CONFLICT_MESSAGE: TimelineErrorMessage = {
    key: "timeline.errors.heldConflict",
    defaultMessage:
        "{count, plural, =1 {{names} is {held} on {pages}. {clearThisPage} to remove the hold, or drag inside it to move it.} other {{names} are {held} on {pages}. {clearThisPage} to remove the holds, or drag inside them to move them.}}",
};

/** The marchers and pages a hold message names, as its arguments. */
const heldParams = (held: HeldConflict, translate: TimelineTranslate) => {
    const names = held.names;
    return {
        ...holdTerms(),
        count: names.length,
        names:
            marcherNamesText(
                names.map((_, i) => i),
                (i) => names[i],
                (key, defaultValue, params) =>
                    translate(key, defaultValue, params),
            ) ?? joinList(names),
        pages: heldPagesText(held.pages, translate),
    };
};

/** An E-H1's message naming who and where, or null when the error doesn't say. */
function heldConflictMessage(
    error: unknown,
    translate: TimelineTranslate,
): string | null {
    if (!(error instanceof TimelineCommitViolationError)) return null;
    const held = error.held;
    if (!held || held.names.length === 0 || held.pages.length === 0)
        return null;
    return translate(
        HELD_CONFLICT_MESSAGE.key,
        HELD_CONFLICT_MESSAGE.defaultMessage,
        heldParams(held, translate),
    );
}

/** Held pages by name, as the hold messages say them: "Page 3", "Pages 3 and 4". */
export const heldPagesText = (
    pages: readonly string[],
    translate: TimelineTranslate = defaultTranslate,
): string =>
    translate(
        "timeline.errors.heldPages",
        "{count, plural, =1 {Page {pages}} other {Pages {pages}}}",
        { count: pages.length, pages: joinList(pages) },
    );

export const TIMELINE_NOT_READY_MESSAGE: TimelineErrorMessage = {
    key: "timeline.errors.notReady",
    defaultMessage: "The timeline is still loading. Try again in a moment.",
};

/**
 * Remove keyframe's toast for marchers whose moves around the count weren't joined (holds decision
 * 14, #470; `NotJoined`): they keep the plain Remove, so they stand still and then walk.
 */
export const NOT_JOINED_MESSAGE: TimelineErrorMessage = {
    key: "timeline.errors.notJoined.message",
    defaultMessage: "{names} couldn't join their moves: {reason}.",
};

/** Why a join was refused, by `FitRefusal` kind, worded for a join (merge words its own). */
export const NOT_JOINED_REASONS: Readonly<
    Record<NotJoined["reason"], TimelineErrorMessage>
> = {
    partway: {
        key: "timeline.errors.notJoined.partway",
        defaultMessage: "a marcher joins or leaves the next move partway",
    },
    overlap: {
        key: "timeline.errors.notJoined.overlap",
        defaultMessage:
            "the joined move would run into another of their moves on the same layer",
    },
    secondMove: {
        key: "timeline.errors.notJoined.secondMove",
        defaultMessage: "they'd have two moves over the same counts",
    },
};

/**
 * One toast's text for the refused joins `groups`: a sentence per group, naming its marchers
 * (`marcherNamesText`, or a count when a name isn't known) and the reason.
 */
export function notJoinedMessage(
    groups: readonly NotJoined[],
    nameOf: MarcherNameOf,
    t: KeepTranslate = (key, defaultValue, params) =>
        tolgee.t(key, defaultValue, params ?? {}),
): string {
    return groups
        .map(({ marcherIds, reason }) => {
            const names =
                marcherNamesText(marcherIds, nameOf, t) ??
                t(
                    "timeline.errors.notJoined.marcherCount",
                    "{count, plural, one {# marcher} other {# marchers}}",
                    { count: marcherIds.length },
                );
            const why = NOT_JOINED_REASONS[reason];
            return t(
                NOT_JOINED_MESSAGE.key,
                NOT_JOINED_MESSAGE.defaultMessage,
                {
                    names,
                    reason: t(why.key, why.defaultMessage),
                },
            );
        })
        .join(" ");
}

/**
 * Looks a message up by key, default and arguments; the Tolgee singleton by default, anything in
 * tests. A refusal's own text (`E-ARGS`) has no default.
 */
export type TimelineTranslate = (
    key: string,
    defaultMessage: string | undefined,
    params?: Readonly<Record<string, string | number>>,
) => string;

const defaultTranslate: TimelineTranslate = (key, defaultMessage, params) =>
    defaultMessage === undefined
        ? tolgee.t(key, { ...params })
        : tolgee.t(key, defaultMessage, { ...params });

/** The spec error code of a timeline refusal, or null for an error that isn't one. */
export function timelineErrorCode(error: unknown): string | null {
    if (
        error instanceof TimelineWriteError ||
        error instanceof TimelineCommitViolationError
    )
        return error.code;
    return null;
}

/**
 * The message to show for `error`, or `fallback` (when given) for an error that isn't a timeline
 * refusal or is an `E-ARGS` refusal without text for the user (a developer-only message). Either
 * without a fallback gets the generic message.
 */
export function timelineErrorMessage(
    error: unknown,
    {
        fallback,
        translate = defaultTranslate,
    }: { fallback?: string; translate?: TimelineTranslate } = {},
): string {
    const code = timelineErrorCode(error);
    // By name, so this module doesn't import the coordinate writes
    if (error instanceof Error && error.name === "TimelineNotReadyError")
        return translate(
            TIMELINE_NOT_READY_MESSAGE.key,
            TIMELINE_NOT_READY_MESSAGE.defaultMessage,
        );
    // A canvas move the selection refuses (UI-9, P8.15): its own key, default and parameters
    if (
        error instanceof Error &&
        error.name === "TimelineEditRefusedError" &&
        typeof (error as Error & { key?: unknown }).key === "string"
    ) {
        const { key, params } = error as Error & {
            key: string;
            params?: Readonly<Record<string, TimelineTextArg>>;
        };
        // A name list in the parameters is text, translated here as the message is
        const translated =
            params &&
            Object.fromEntries(
                Object.entries(params).map(([name, arg]) => [
                    name,
                    typeof arg === "string" || typeof arg === "number"
                        ? arg
                        : translateTimelineText(arg, (k, p) =>
                              translate(k, undefined, p),
                          ),
                ]),
            );
        return translate(key, error.message, translated);
    }
    if (code === null)
        return (
            fallback ??
            translate(
                TIMELINE_UNKNOWN_ERROR_MESSAGE.key,
                TIMELINE_UNKNOWN_ERROR_MESSAGE.defaultMessage,
            )
        );
    if (code === "E-ARGS" && error instanceof TimelineWriteError) {
        if (error.text)
            return translateTimelineText(error.text, (key, params) =>
                translate(key, undefined, params),
            );
        // A developer-only refusal (a plain string): the caller's words for what failed, if any
        if (fallback !== undefined) return fallback;
    }
    if (code === "E-H1") {
        const held = heldConflictMessage(error, translate);
        if (held) return held;
    }
    const mapped =
        code === "E-DB"
            ? TIMELINE_DB_ERROR_MESSAGE
            : isLegacyConversionViolation(error)
              ? TIMELINE_LEGACY_CONVERSION_MESSAGE
              : TIMELINE_ERROR_MESSAGES[code];
    const message = mapped ?? TIMELINE_UNKNOWN_ERROR_MESSAGE;
    // A message may name a state or a command (`holdTerms`), as E-H1's does
    return translate(message.key, message.defaultMessage, holdTerms());
}

/**
 * Shows a timeline refusal as a toast with its friendly message, and logs the original error (and
 * for `E-DB` its cause) to the console. Errors that aren't timeline refusals show `fallback`, or the generic message.
 */
export function toastTimelineError(
    error: unknown,
    fallback?: string,
    ...additional: unknown[]
): void {
    if (error instanceof Error && error.name === "TimelineEditRefusedError") {
        const { refusal } = error as Error & { refusal?: unknown };
        // UI-19: a Basic lock offers the way out
        if (refusal === "notSimple") {
            toastBasicLock(timelineErrorMessage(error, { fallback }));
            return;
        }
        // One toast per reason: a burst of refused nudges replaces it instead of stacking
        const id = `timeline-refused-${String(refusal)}`;
        // Marchers a holds command left alone while it did the rest: a warning, not an error
        if (refusal === "inShapeOrFollowTheLeader") {
            toast.warning(timelineErrorMessage(error, { fallback }), { id });
            return;
        }
        console.error(error);
        toast.error(timelineErrorMessage(error, { fallback }), { id });
        return;
    }
    const cause =
        timelineErrorCode(error) === "E-DB" && error instanceof Error
            ? [error.cause]
            : [];
    conToastError(
        timelineErrorMessage(error, { fallback }),
        error,
        ...cause,
        ...additional,
    );
}
