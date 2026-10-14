import {
    type TimelineEditTarget,
    type TimelineMarcherMove,
    type TimelineMovePage,
} from "@/db-functions/timelineMoves";
import type { DbConnection } from "@/db-functions/types";
import { withTimelineWriteLock } from "@/db-functions/history";
import {
    useTimelineSelectionStore,
    type TimelineSelectionState,
} from "@/stores/TimelineSelectionStore";
import {
    editingPositionAt,
    useIsolationPlanStore,
} from "./timelineIsolationPlan";
import type { CoordinateRecord } from "@/utilities/CoordinateActions";
import { pageEndBeat } from "./timelineCanvas";
import { TimelineEditRefusedError } from "./timelineEditRefusals";
import { moveMarchersAndOfferFollowUp } from "./timelineMoveThemToo";
import { isBasicMode } from "@/stores/EditorModeStore";
import {
    timelineResolverSettled,
    useTimelineResolverStore,
} from "./timelineStore";

/**
 * The seam between the coordinate tools and timeline writes (docs/timeline/phases/07-page-parity.md
 * P7.2, reworked for UI-9 by P8.15 and UI-10 by P8.17). Canvas drag, nudges, snap, align,
 * distribute, flip, swap, circle, the line tool and the inspector's coordinate edits all compute
 * new x/y for the selected marchers. They edit against the **edit window** (docs/timeline/ui.md UI-10), not a page
 * (`planCanvasEdit`):
 *
 * - a window `[S, P)`: where the moved marchers arrive at the playhead P, leaving the start flag
 *   S. The move creates the window's timeline and adds the marchers to it as needed
 *   (`moveMarchersInRangeInTransaction`), starting from the resolver's positions at P;
 * - home (the playhead on beat 0): the marchers' homes;
 * - an isolated timeline (docs/timeline/research/ownership/09-isolation.md): the timeline's own
 *   endings, from where its plan puts its members (`editingPositionAt`), for stolen members too.
 *   The playhead goes to the timeline's end first (`snapIsolatedPlayheadToEnd`), so the edit is
 *   seen where it lands.
 *
 * Nothing selected is refused with a hint (`TimelineEditRefusedError`). "Set marchers to the
 * previous or next page" (P7.6) plans with `copyPagePositions` and writes over the selected page's
 * box with the same range writer (`neighborPageTarget`), so it works on a page the marchers only
 * hold through.
 */

/** The x/y fields every coordinate tool reads and writes. */
export interface MarcherXY {
    marcher_id: number;
    x: number;
    y: number;
}

/** Thrown when timeline mode can't read positions because the resolver isn't ready yet. */
export class TimelineNotReadyError extends Error {
    constructor() {
        super("The timeline is still loading. Try again in a moment.");
        this.name = "TimelineNotReadyError";
    }
}

export {
    CANVAS_EDIT_REFUSALS,
    TimelineEditRefusedError,
    type CanvasEditRefusal,
} from "./timelineEditRefusals";

/** What a canvas move edits, and the beat whose positions the canvas shows for it. */
export type CanvasEditPlan =
    | {
          readonly ok: true;
          readonly target: TimelineEditTarget;
          /** Where the edited positions are read: 0 for homes, else the playhead (the window's end) */
          readonly beat: number;
      }
    | {
          readonly ok: false;
          readonly error: TimelineEditRefusedError | TimelineNotReadyError;
      };

/**
 * What a canvas move edits right now (UI-10), from the edit window:
 *
 * - a window `[S, P)`: the timeline over it, created and joined by the move as needed;
 * - home: the homes;
 * - nothing selected: refused.
 */
export function planCanvasEdit(
    state: Pick<TimelineSelectionState, "selection" | "isolation"> &
        Partial<
            Pick<TimelineSelectionState, "pageBoxes">
        > = useTimelineSelectionStore.getState(),
    basic: boolean = isBasicMode(),
): CanvasEditPlan {
    const { selection, isolation } = state;
    // Isolation always edits the isolated timeline's end (owner, 2026-10-04). Until its plan is
    // loaded (or reloaded after an undo), positions would come from the real show: refuse
    if (isolation) {
        if (
            useIsolationPlanStore.getState().current?.timelineId !==
            isolation.timelineId
        )
            return { ok: false, error: new TimelineNotReadyError() };
        return {
            ok: true,
            target: {
                kind: "timeline",
                timelineId: isolation.timelineId,
                ghosts: true,
            },
            beat: isolation.end,
        };
    }
    if (selection.kind === "range") {
        // UI-19: Basic edits where each marcher is at the playhead, inside its page box
        // (docs/timeline/research/basic-mode, "How Basic writes")
        if (basic) {
            const box = basicPageBox(
                { pageBoxes: state.pageBoxes ?? [] },
                selection.end,
            );
            // Basic never falls back to the window: its moves would cross flags it can't show
            if (!box)
                return {
                    ok: false,
                    error:
                        (state.pageBoxes ?? []).length === 0
                            ? new TimelineNotReadyError()
                            : new TimelineEditRefusedError("pastLastPage"),
                };
            return {
                ok: true,
                target: { kind: "point", beat: selection.end, box },
                beat: selection.end,
            };
        }
        return {
            ok: true,
            target: {
                kind: "range",
                start: selection.start,
                end: selection.end,
            },
            beat: selection.end,
        };
    }
    if (selection.kind === "home")
        return { ok: true, target: { kind: "home" }, beat: 0 };
    return { ok: false, error: new TimelineEditRefusedError("noTimeline") };
}

/**
 * The page box Basic edits at playhead `beat`: the box holding it, or ending on it (a page's flag
 * edits that page). `null` before the boxes load or past the last flag.
 */
export function basicPageBox(
    state: Pick<TimelineSelectionState, "pageBoxes">,
    beat: number,
): { start: number; end: number } | null {
    const box = state.pageBoxes.find((b) => b.start < beat && beat <= b.end);
    return box ? { start: box.start, end: box.end } : null;
}

/**
 * Inside isolation, an edit goes to the isolated timeline's end; the playhead goes there first,
 * so the edit is drawn where it lands. Does nothing outside isolation or with the playhead there.
 */
export function snapIsolatedPlayheadToEnd(): void {
    const store = useTimelineSelectionStore.getState();
    if (store.isolation && store.playheadBeat !== store.isolation.end)
        store.seek(store.isolation.end);
}

/**
 * Canvas drops inside isolation with the playhead before the isolated move's end: each becomes
 * the plan's position at the end plus the drag's offset from the plan's position at the playhead.
 * Unchanged outside isolation, at the end, or before the plan loads.
 */
export function atIsolatedEnd<A extends MarcherXY>(changes: readonly A[]): A[] {
    const { isolation, playheadBeat } = useTimelineSelectionStore.getState();
    const plan = useIsolationPlanStore.getState().current;
    const resolver = useTimelineResolverStore.getState().resolver;
    if (!isolation || !plan || !resolver || playheadBeat === isolation.end)
        return [...changes];
    return changes.map((c) => {
        const [px, py] = editingPositionAt(
            resolver,
            c.marcher_id,
            playheadBeat,
            plan,
        );
        const [ex, ey] = editingPositionAt(
            resolver,
            c.marcher_id,
            isolation.end,
            plan,
        );
        return { ...c, x: ex + (c.x - px), y: ey + (c.y - py) };
    });
}

/**
 * `coordinates` with each x/y replaced by the resolver's position at `beat` (a spec beat), the
 * position the canvas draws there. Other fields are kept, so `MarcherPage` objects can go straight
 * into the coordinate helpers (`CoordinateActions`). Marchers the resolver doesn't know are dropped.
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
            const [x, y] = editingPositionAt(resolver, c.marcher_id, beat);
            return { ...c, x, y };
        });
}

/**
 * The marchers as coordinate records at the resolver's positions at `beat`, for the coordinate
 * helpers (`CoordinateActions`). Built from the marcher ids alone. `pageId` only fills the records' `page_id`, which the timeline write path
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
 * `useUpdateSelectedMarchers`'s write: applies `transform` to the marchers' current positions
 * where the selection edits (`planCanvasEdit`; from the resolver)
 * and writes the result as one `moveMarchersInTarget` edit, saying what it passed through and
 * offering **Move them too** (`moveMarchersAndOfferFollowUp`).
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
    snapIsolatedPlayheadToEnd();
    const next = transform(timelineCoordinateRecords(plan.beat, marcherIds));
    const moves = toTimelineMoves(next);
    // Basic's locked marchers are dropped there (UI-19)
    await moveMarchersAndOfferFollowUp({
        database: db,
        target: plan.target,
        moves,
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
    /** One move per marcher in `marcherIds`, to its source position, changed or not */
    targets: TimelineMarcherMove[];
}

/**
 * "Set all or selected marchers to the previous or next page"
 * (docs/timeline/phases/07-page-parity.md P7.6). Copies each marcher's position on `source` (the
 * resolver at its end beat, what the canvas draws there) to `page`, as moves over the page's box
 * (`neighborPageTarget`).
 *
 * `moves` leaves out marchers already at the source position on `page` (compared exactly, since
 * they are copied); `targets` has every marcher, for set to previous page, which also clears a
 * marcher's own move on the page when it already goes nowhere.
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
    const targets: TimelineMarcherMove[] = [];
    for (const marcherId of ids) {
        const [x, y] = resolver.positionAt(marcherId, sourceBeat);
        const [currentX, currentY] = resolver.positionAt(marcherId, targetBeat);
        targets.push({ marcherId, x, y });
        if (x !== currentX || y !== currentY) moves.push({ marcherId, x, y });
    }
    return { marcherIds: ids, moves, targets };
}

/**
 * Where set to previous or next page writes on `page`: the homes on the first page, otherwise the
 * page's box `[first beat, end beat)` through the range writer, like a drag with the start flag on
 * the previous page's flag and the playhead on this one's (UI-10).
 *
 * @throws Error for a page with no beats
 */
export function neighborPageTarget(
    page: TimelineMovePage,
    basic: boolean = isBasicMode(),
): TimelineEditTarget {
    if (page.previousPageId === null) return { kind: "home" };
    const first = page.beats[0];
    if (!first) throw new Error("This page has no beats, so it has no box.");
    const box = { start: first.index, end: pageEndBeat(page) };
    // UI-19: Basic writes on the page's flag, and keeps every move inside the box
    if (basic) return { kind: "point", beat: box.end, box };
    return { kind: "range", ...box };
}

/** The timeline move for each changed coordinate. Any `page_id` on them is ignored. */
export const toTimelineMoves = (
    changes: readonly MarcherXY[],
): TimelineMarcherMove[] =>
    changes.map((c) => ({ marcherId: c.marcher_id, x: c.x, y: c.y }));

/**
 * What "set marchers to the previous or next page" hands to `moveMarchersInTarget`: the page's box
 * or the homes (`neighborPageTarget`), the moves, and whether to clear the marchers' own moves on
 * the page first (set to previous page).
 */
export interface TimelineNeighborPageRequest {
    target: TimelineEditTarget;
    moves: TimelineMarcherMove[];
    clearOwn: boolean;
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
 * It writes the moves where the selection edits, planned when the move ends (`plan`,
 * `planCanvasEdit` by default, so it never uses a stale selection). The canvas marchers'
 * `coordinate.page_id` is not used. When the selection refuses the move, `onRefused` gets the
 * reason (the canvas shows it and snaps the marchers back).
 */
export function canvasCoordinateWriter<A extends MarcherXY>({
    writeTimeline,
    onRefused,
    plan = () => planCanvasEdit(),
}: {
    writeTimeline: (request: TimelineEditRequest) => void;
    onRefused: (
        error: TimelineEditRefusedError | TimelineNotReadyError,
    ) => void;
    /** The edit plan at the time of the move */
    plan?: () => CanvasEditPlan;
}): (changes: A[]) => void {
    return (changes) => {
        const current = plan();
        if (!current.ok) {
            onRefused(current.error);
            return;
        }
        // A drop is where the marcher was dragged at the playhead; isolation writes the move's
        // end, so carry the drag over as an offset from where the plan has it there
        const moves = toTimelineMoves(atIsolatedEnd(changes));
        snapIsolatedPlayheadToEnd();
        // Basic's locked marchers are dropped by the write (UI-19); a refusal snaps them back
        writeTimeline({ target: current.target, moves });
    };
}
