import {
    moveMarchersInTarget,
    type TimelineEditTarget,
    type TimelineMarcherMove,
    type TimelineMovePage,
} from "@/db-functions/timelineMoves";
import type { DbConnection } from "@/db-functions/types";
import { withTimelineWriteLock } from "@/db-functions/history";
import {
    selectedStoredTimeline,
    useTimelineSelectionStore,
    type TimelineSelectionState,
} from "@/stores/TimelineSelectionStore";
import type { CoordinateRecord } from "@/utilities/CoordinateActions";
import { pageEndBeat } from "./timelineCanvas";
import {
    timelineResolverSettled,
    useTimelineResolverStore,
} from "./timelineStore";

/**
 * The seam between the page-era coordinate tools and timeline writes in timeline mode
 * (docs/timeline/phases/07-page-parity.md P7.2, reworked for UI-9 by P8.15). Canvas drag, nudges,
 * snap, align, distribute, flip, swap, circle, the line tool and the inspector's coordinate edits
 * all compute new x/y for the selected marchers. In timeline mode they edit against the
 * **selection** (docs/timeline/ui.md UI-9 Editing, Home), not a page (`planCanvasEdit`):
 *
 * - a selected stored timeline, with the paused playhead on its end beat: the endings of the
 *   moved marchers' transitions in it (`moveMarchersInTimelineInTransaction`), starting from the
 *   resolver's positions at that end beat;
 * - no timeline selected (home or nothing) with the playhead on beat 0: the marchers' homes.
 *
 * Anything else is refused with a hint (`TimelineEditRefusedError`). "Set marchers to the previous
 * or next page" (P7.6) still copies page positions through `copyPagePositions` until P8.12 moves
 * it onto the selection. With the flag off, nothing here runs.
 */

/** The x/y fields every page-era coordinate tool reads and writes. */
export interface MarcherXY {
    marcher_id: number;
    x: number;
    y: number;
}

/** The parts of a `Page` the page-based write path needs. */
export type TimelineWritePage = TimelineMovePage & { readonly id: number };

/** Thrown when timeline mode can't read positions because the resolver isn't ready yet. */
export class TimelineNotReadyError extends Error {
    constructor() {
        super("The timeline is still loading. Try again in a moment.");
        this.name = "TimelineNotReadyError";
    }
}

/**
 * Why a canvas move can't run in timeline mode (UI-9 Editing, Editing off the end). Each has a
 * Tolgee key with the English text as its default; `timelineErrorMessage` shows it.
 */
export const CANVAS_EDIT_REFUSALS = {
    /** No timeline is selected and the playhead isn't on beat 0 */
    noTimeline: {
        key: "timeline.edit.selectTimeline",
        defaultMessage:
            "Select a timeline (click a page box) to move marchers, or go to the start of the show to move their homes.",
    },
    /** The selected range has no stored timeline: nobody has been added to it */
    emptyTimeline: {
        key: "timeline.edit.emptyTimeline",
        defaultMessage:
            "Nobody is in this timeline yet. Right-click it and choose Add selected marchers first.",
    },
    /** TEMPORARY (UI-9 Editing off the end): the playhead isn't on the selected timeline's end */
    offEnd: {
        key: "timeline.edit.goToEnd",
        defaultMessage:
            "Go to the end of the selected timeline to move marchers. For now, a move sets where marchers are at its end.",
    },
} as const;

export type CanvasEditRefusal = keyof typeof CANVAS_EDIT_REFUSALS;

/** A canvas move refused by the selection (see `CANVAS_EDIT_REFUSALS`). */
export class TimelineEditRefusedError extends Error {
    readonly key: string;
    constructor(readonly refusal: CanvasEditRefusal) {
        super(CANVAS_EDIT_REFUSALS[refusal].defaultMessage);
        this.key = CANVAS_EDIT_REFUSALS[refusal].key;
        this.name = "TimelineEditRefusedError";
    }
}

/** What a canvas move edits, and the beat whose positions the canvas shows for it. */
export type CanvasEditPlan =
    | {
          readonly ok: true;
          readonly target: TimelineEditTarget;
          /** Where the edited positions are read: 0 for homes, else the timeline's end beat */
          readonly beat: number;
      }
    | {
          readonly ok: false;
          readonly error: TimelineEditRefusedError | TimelineNotReadyError;
      };

/**
 * What a canvas move edits right now (UI-9 Editing, Editing off the end, Home), from the selection
 * and the paused playhead:
 *
 * - a range that resolves to a stored timeline, with the playhead on its end: that timeline;
 * - a range with no stored timeline: refused (nobody is in it yet; it dims nobody, so marchers can
 *   be selected and added to it);
 * - a stored timeline with the playhead elsewhere: refused (TEMPORARY);
 * - home or nothing with the playhead on beat 0: the homes; elsewhere: refused.
 *
 * A range before the stored timelines load is `TimelineNotReadyError`.
 */
export function planCanvasEdit(
    state: Pick<
        TimelineSelectionState,
        "selection" | "storedTimelines" | "playheadBeat"
    > = useTimelineSelectionStore.getState(),
): CanvasEditPlan {
    const refused = (refusal: CanvasEditRefusal): CanvasEditPlan => ({
        ok: false,
        error: new TimelineEditRefusedError(refusal),
    });
    if (state.selection.kind === "range") {
        if (!state.storedTimelines)
            return { ok: false, error: new TimelineNotReadyError() };
        const timeline = selectedStoredTimeline(state);
        if (!timeline) return refused("emptyTimeline");
        if (state.playheadBeat !== timeline.end) return refused("offEnd");
        return {
            ok: true,
            target: { kind: "timeline", timelineId: timeline.id },
            beat: timeline.end,
        };
    }
    if (state.playheadBeat !== 0) return refused("noTimeline");
    return { ok: true, target: { kind: "home" }, beat: 0 };
}

/**
 * `coordinates` with each x/y replaced by the resolver's position at `beat` (a spec beat), the
 * position the canvas draws there. Other fields are kept, so `MarcherPage` objects can go straight
 * into the page-era helpers (`CoordinateActions`). Marchers the resolver doesn't know are dropped.
 *
 * @throws TimelineNotReadyError when no resolver is ready
 */
export function withTimelinePositions<T extends MarcherXY>(
    beat: number,
    coordinates: readonly T[],
): T[] {
    const resolver = useTimelineResolverStore.getState().resolver;
    if (!resolver) throw new TimelineNotReadyError();
    const known = new Set(resolver.marcherIds());
    return coordinates
        .filter((c) => known.has(c.marcher_id))
        .map((c) => {
            const [x, y] = resolver.positionAt(c.marcher_id, beat);
            return { ...c, x, y };
        });
}

/**
 * The marchers as coordinate records at the resolver's positions at `beat`, for the page-era
 * helpers (`CoordinateActions`). Built from the marcher ids alone, so it doesn't need (or trust)
 * `marcher_pages` rows. `pageId` only fills the records' `page_id`, which the timeline write path
 * ignores. Marchers the resolver doesn't know are dropped.
 *
 * @throws TimelineNotReadyError when no resolver is ready
 */
export function timelineCoordinateRecords(
    beat: number,
    marcherIds: readonly number[],
    pageId = 0,
): CoordinateRecord[] {
    return withTimelinePositions(
        beat,
        marcherIds.map(
            (id): CoordinateRecord => ({
                marcher_id: id,
                page_id: pageId,
                x: 0,
                y: 0,
                notes: null,
            }),
        ),
    );
}

/**
 * Timeline mode's `useUpdateSelectedMarchers`: applies `transform` to the marchers' current
 * positions where the selection edits (`planCanvasEdit`; from the resolver, not `marcher_pages`)
 * and writes the result as one `moveMarchersInTarget` edit.
 *
 * @returns the transformed coordinates
 * @throws TimelineEditRefusedError when the selection refuses canvas moves
 * @throws TimelineNotReadyError when no resolver is ready
 */
export async function transformMarchersInSelection<R extends MarcherXY>({
    db,
    marcherIds,
    transform,
    plan = planCanvasEdit(),
}: {
    db: DbConnection;
    marcherIds: readonly number[];
    transform: (current: CoordinateRecord[]) => R[];
    plan?: CanvasEditPlan;
}): Promise<R[]> {
    if (!plan.ok) throw plan.error;
    const next = transform(timelineCoordinateRecords(plan.beat, marcherIds));
    await moveMarchersInTarget({
        db,
        target: plan.target,
        moves: toTimelineMoves(next),
    });
    return next;
}

/**
 * Settles once every timeline write queued so far has committed and reached the resolver, and no
 * cold build is pending. Call it before reading positions to plan a new write from them: without
 * it, a write still in flight (a nudge pressed just before) is missing from the resolver, and the
 * plan starts from stale positions. Never call it from inside a wrapped write.
 */
export async function timelinePositionsSettled(): Promise<void> {
    await withTimelineWriteLock(async () => undefined);
    await timelineResolverSettled();
}

/** What `copyPagePositions` plans: the marchers it covers and the moves that change something. */
export interface PagePositionCopy {
    /** The marchers set to the source page's positions, moved or already there */
    marcherIds: number[];
    /** One move per marcher whose position on the target page changes */
    moves: TimelineMarcherMove[];
}

/**
 * "Set all or selected marchers to the previous or next page" in timeline mode
 * (docs/timeline/phases/07-page-parity.md P7.6). Copies each marcher's position on `source` (the
 * resolver at its end beat, what the canvas draws there) to `page`, as moves for
 * `moveMarchersOnPage`. `marcher_pages` is never read: its rows can be stale or missing in timeline
 * mode.
 *
 * Marchers already at the source position on `page` get no move, so a marcher that holds still
 * across the two pages is not touched (it may have no move ending at the page's end beat, which
 * `moveMarchersOnPage` would refuse). Positions are compared exactly, since they are copied.
 *
 * @param marcherIds the marchers to copy; all marchers the resolver knows when omitted. Marchers
 *   the resolver doesn't know are dropped.
 * @throws TimelineNotReadyError when no resolver is ready
 */
export function copyPagePositions({
    page,
    source,
    marcherIds,
}: {
    page: TimelineMovePage;
    source: TimelineMovePage;
    marcherIds?: readonly number[];
}): PagePositionCopy {
    const resolver = useTimelineResolverStore.getState().resolver;
    if (!resolver) throw new TimelineNotReadyError();
    const known = resolver.marcherIds();
    const knownSet = new Set(known);
    const ids =
        marcherIds === undefined
            ? [...known]
            : marcherIds.filter((id) => knownSet.has(id));
    const sourceBeat = pageEndBeat(source);
    const targetBeat = pageEndBeat(page);
    const moves: TimelineMarcherMove[] = [];
    for (const marcherId of ids) {
        const [x, y] = resolver.positionAt(marcherId, sourceBeat);
        const [currentX, currentY] = resolver.positionAt(marcherId, targetBeat);
        if (x !== currentX || y !== currentY) moves.push({ marcherId, x, y });
    }
    return { marcherIds: ids, moves };
}

/** The timeline move for each changed coordinate. Any `page_id` on them is ignored. */
export const toTimelineMoves = (
    changes: readonly MarcherXY[],
): TimelineMarcherMove[] =>
    changes.map((c) => ({ marcherId: c.marcher_id, x: c.x, y: c.y }));

/**
 * What "set marchers to the previous or next page" hands to `moveMarchersOnPage`: the page and its
 * moves. P8.12 moves that action onto the selection.
 */
export interface TimelineMoveRequest {
    page: TimelineWritePage;
    moves: TimelineMarcherMove[];
}

/** What a canvas move hands to the timeline write path (`moveMarchersInTarget`). */
export interface TimelineEditRequest {
    target: TimelineEditTarget;
    moves: TimelineMarcherMove[];
}

/**
 * The function the canvas calls when a drag or rotate ends (`OpenMarchCanvas.
 * updateMarcherPagesFunction`).
 *
 * - Flag off: `writePages` itself, so page mode is unchanged.
 * - Flag on: a function that writes the moves where the selection edits, planned when the move
 *   ends (`plan`, `planCanvasEdit` by default, so it never uses a stale selection). The canvas
 *   marchers' `coordinate.page_id` is not used. When the selection refuses the move, `onRefused`
 *   gets the reason (the canvas shows it and snaps the marchers back).
 */
export function canvasCoordinateWriter<A extends MarcherXY>({
    timelineMode,
    writePages,
    writeTimeline,
    onRefused,
    plan = () => planCanvasEdit(),
}: {
    timelineMode: boolean;
    writePages: (changes: A[]) => void;
    writeTimeline: (request: TimelineEditRequest) => void;
    onRefused: (
        error: TimelineEditRefusedError | TimelineNotReadyError,
    ) => void;
    /** The edit plan at the time of the move */
    plan?: () => CanvasEditPlan;
}): (changes: A[]) => void {
    if (!timelineMode) return writePages;
    return (changes) => {
        const current = plan();
        if (!current.ok) {
            onRefused(current.error);
            return;
        }
        writeTimeline({
            target: current.target,
            moves: toTimelineMoves(changes),
        });
    };
}
