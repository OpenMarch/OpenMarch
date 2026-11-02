import type { TimelineTextArg } from "./timelineText";

/**
 * Why a canvas move can't run in timeline mode (UI-10, UI-19). Each has a Tolgee key with the
 * English text as its default; `timelineErrorMessage` shows it. Kept apart from
 * `timelineCoordinateWrites.ts` (which re-exports them) so the write functions in `db-functions`
 * can throw them without importing the renderer's coordinate tools.
 */
export const CANVAS_EDIT_REFUSALS = {
    /** Nothing is selected and the playhead isn't on beat 0 */
    noTimeline: {
        key: "timeline.edit.selectTimeline",
        defaultMessage:
            "Click the timeline to choose when marchers arrive, then move them.",
    },
    /**
     * Basic mode (UI-19): a marcher isn't simple on the page (a move across a page flag, moves
     * overlapping in time, a shape or a non-direct path), so only Expert can edit it there
     */
    notSimple: {
        key: "timeline.edit.notSimple",
        defaultMessage:
            "Some of these marchers use Expert moves on this page. Switch to Expert to edit them.",
    },
    /**
     * Basic mode (UI-19): the playhead is past the last page's flag, where Basic has no page box
     * to edit; a page added there (**+**) makes one
     */
    pastLastPage: {
        key: "timeline.edit.pastLastPage",
        defaultMessage:
            "There's no page here yet. Right-click the playhead and choose Create page at playhead (F) to write a set after the last page.",
    },
    /**
     * Holds (owner, 2026-10-30, until fork #504): a command that takes marchers out of their move
     * leaves shape and follow-the-leader members in it and does the rest (`skippedRefusal`, which
     * names them in the message and its parameters). Shown as a warning, since the rest was done
     */
    inShapeOrFollowTheLeader: {
        key: "timeline.edit.inShapeOrFollowTheLeader",
        defaultMessage:
            "Some of these marchers are in a shape or follow the leader, so they keep their move here.",
    },
} as const;

export type CanvasEditRefusal = keyof typeof CANVAS_EDIT_REFUSALS;

/** A canvas move refused by the selection or by Basic mode (see `CANVAS_EDIT_REFUSALS`). */
export class TimelineEditRefusedError extends Error {
    readonly key: string;
    /** `notSimple` and `inShapeOrFollowTheLeader`: the refused marchers, by id, in id order */
    readonly marcherIds: readonly number[];
    /**
     * The key's parameters (the marcher names), when its text has any; a name list is text
     * translated where it is shown (`TimelineTextArg`), since db-functions can't use Tolgee
     */
    readonly params: Readonly<Record<string, TimelineTextArg>> | undefined;
    constructor(
        readonly refusal: CanvasEditRefusal,
        {
            marcherIds = [],
            message,
            params,
        }: {
            marcherIds?: readonly number[];
            message?: string;
            params?: Record<string, TimelineTextArg>;
        } = {},
    ) {
        super(message ?? CANVAS_EDIT_REFUSALS[refusal].defaultMessage);
        this.key = CANVAS_EDIT_REFUSALS[refusal].key;
        this.marcherIds = marcherIds;
        this.params = params;
        this.name = "TimelineEditRefusedError";
    }
}
