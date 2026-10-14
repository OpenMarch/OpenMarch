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
            "There's no page here yet. Add a page with + to write a set after the last page.",
    },
} as const;

export type CanvasEditRefusal = keyof typeof CANVAS_EDIT_REFUSALS;

/** A canvas move refused by the selection or by Basic mode (see `CANVAS_EDIT_REFUSALS`). */
export class TimelineEditRefusedError extends Error {
    readonly key: string;
    /** `notSimple`: the refused marchers, by id, in id order */
    readonly marcherIds: readonly number[];
    constructor(
        readonly refusal: CanvasEditRefusal,
        {
            marcherIds = [],
            message,
        }: { marcherIds?: readonly number[]; message?: string } = {},
    ) {
        super(message ?? CANVAS_EDIT_REFUSALS[refusal].defaultMessage);
        this.key = CANVAS_EDIT_REFUSALS[refusal].key;
        this.marcherIds = marcherIds;
        this.name = "TimelineEditRefusedError";
    }
}
