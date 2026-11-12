import tolgee from "@/global/singletons/Tolgee";
import type { Resolver, XY } from "@openmarch/core";
import { toast } from "sonner";
import { db } from "@/global/database/db";
import {
    moveMarchersInTarget,
    samePosition,
    shapeBackedTransitionIds,
    shiftSlotDestinations,
    type SlotShift,
    type TimelineEditTarget,
    type TimelineMarcherMove,
    type TimelineMoveResult,
} from "@/db-functions/timelineMoves";
import type { DbConnection, DbTransaction } from "@/db-functions/types";
import {
    useTimelineSelectionStore,
    type PageBox,
} from "@/stores/TimelineSelectionStore";
import {
    MOVE_THEM_TOO_TOAST_MS,
    addShifts,
    continueEditRun,
    editHistoryMark,
    editScope,
    editSurpriseToastId,
    inDrillOrder,
    marcherLabelsById,
    moveThemTooMessage,
    type ShiftTotals,
} from "@/utilities/moveThemToo";
import { editedMarcherEnds, type CarrySpan } from "./timelineCarryForward";
import { toastTimelineError } from "./timelineErrorMessages";
import { toastPassThrough } from "./timelinePassThrough";
import { offerOnlyThisPage, ownMovers } from "./timelineOnlyThisPage";
import { boxMembershipEdit } from "@/shapes/placed/boxMembership";
import { showLeftBoxToast } from "@/shapes/placed/leftBoxToast";
import { invalidatePlacedBoxes } from "@/shapes/placed/placedBoxStore";
import { editingPositionAt } from "./timelineIsolationPlan";
import {
    resolverSpans,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "./timelineStore";
import { toastLockedMarchers, withoutLockedMarchers } from "./basicLocks";
import { TimelineEditRefusedError } from "./timelineEditRefusals";

/**
 * **Move them too** in timeline mode (`utilities/moveThemToo.ts`): after a coordinate edit that
 * split its marchers at a later page flag, some following into it and some keeping their own
 * move's destination there, the ones that kept it. Read
 * from the resolver: where each moved marcher was at the edit's end before and after (its
 * offset), and its spans after. The action moves each such slot's destination by the offset, as
 * one undoable edit (`shiftSlotDestinations`); later pages that hold from it follow.
 */

/** Two offsets closer to zero than this, per axis, are no move (canvas pixels) */
const NO_OFFSET = 1e-6;

/** Where an edit's marchers were at its end beat, read just before it wrote. */
export interface EditStart {
    beat: number;
    positions: ReadonlyMap<number, XY>;
}

/** A moved marcher's later own move, which kept its destination: the slot it arrives in. */
export interface LaterOwnMove extends SlotShift {
    /** The page flag that move ends on */
    flag: number;
}

/**
 * The beat an edit to `target` ends at: the window's end, 0 for homes, the isolated move's end for
 * a stored timeline. `null` for a stored timeline that isn't the isolated one.
 */
export function editEndBeat(
    target: TimelineEditTarget,
    isolation: {
        timelineId: number;
        end: number;
    } | null = useTimelineSelectionStore.getState().isolation,
): number | null {
    if (target.kind === "range") return target.end;
    if (target.kind === "point") return target.beat;
    if (target.kind === "home") return 0;
    return isolation?.timelineId === target.timelineId ? isolation.end : null;
}

/** Where `marcherIds` are at `target`'s end beat now, from the current resolver. */
export function readEditStart(
    target: TimelineEditTarget,
    marcherIds: readonly number[],
    resolver: Resolver | null = useTimelineResolverStore.getState().resolver,
): EditStart | null {
    const beat = editEndBeat(target);
    if (!resolver || beat === null) return null;
    const known = new Set(resolver.marcherIds());
    const positions = new Map<number, XY>();
    for (const id of marcherIds)
        if (known.has(id)) positions.set(id, resolver.positionAt(id, beat));
    return { beat, positions };
}

/**
 * The moved marchers whose next own move kept its destination at a page flag where the edit split
 * them from others: at that flag, at least one moved marcher followed (it holds from the edit's
 * end through the flag) and at least one kept its own spot (its next own move, the first span
 * after the edit's end that isn't a hold, starts at or after that end and ends on the flag). Each
 * kept marcher comes with that move's slot and the offset the edit moved it at its end. Where
 * every moved marcher kept a later move (a written show) or every one followed, there's nothing
 * to say. Marchers the edit didn't move (an offset within `NO_OFFSET`) count for neither side;
 * next moves ending between flags, or starting before the edit's end, keep nothing.
 *
 * @param moved the marchers the edit wrote (`editedMarcherEnds`)
 * @param flags every page flag, ascending
 */
export function laterOwnMoves({
    moved,
    start,
    spansOf,
    positionAt,
    flags,
}: {
    moved: Iterable<number>;
    start: EditStart;
    spansOf: (marcherId: number) => readonly (CarrySpan & {
        transitionId: number | null;
        slot: number | null;
    })[];
    positionAt: (marcherId: number, beat: number) => XY;
    flags: readonly number[];
}): LaterOwnMove[] {
    const kept: LaterOwnMove[] = [];
    /** The flags some moved marcher followed into */
    const followed = new Set<number>();
    const later = flags.filter((f) => f > start.beat);
    for (const marcherId of moved) {
        const before = start.positions.get(marcherId);
        if (!before) continue;
        const [x, y] = positionAt(marcherId, start.beat);
        const dx = x - before[0];
        const dy = y - before[1];
        if (Math.abs(dx) <= NO_OFFSET && Math.abs(dy) <= NO_OFFSET) continue;
        const next = spansOf(marcherId)
            .filter((s) => s.kind !== "hold" && s.end > start.beat)
            .sort((a, b) => a.end - b.end)[0];
        // It holds where the edit put it until its next move starts (or for good)
        for (const flag of later)
            if (!next || flag <= next.start) followed.add(flag);
        if (
            !next ||
            next.start < start.beat ||
            next.transitionId === null ||
            next.slot === null ||
            !flags.includes(next.end)
        )
            continue;
        kept.push({
            marcherId,
            transitionId: next.transitionId,
            slotIndex: next.slot,
            flag: next.end,
            dx,
            dy,
        });
    }
    return kept.filter((m) => followed.has(m.flag));
}

/** The page flags the timeline shows, ascending. */
const flagsOf = (boxes: readonly PageBox[]) =>
    [...new Set(boxes.map((b) => b.end))].sort((a, b) => a - b);

/**
 * After a timeline edit has committed: the later own moves it left behind (`laterOwnMoves`), read
 * from the resolver once the edit has reached it, without shape-backed ones (their slots have no
 * point of their own to shift).
 */
export async function findLaterOwnMoves({
    database = db,
    target,
    result,
    start,
    boxes = useTimelineSelectionStore.getState().pageBoxes,
}: {
    database?: DbConnection;
    target: TimelineEditTarget;
    result: Pick<TimelineMoveResult, "homes" | "slots" | "cleared">;
    start: EditStart | null;
    boxes?: readonly PageBox[];
}): Promise<LaterOwnMove[]> {
    if (!start) return [];
    await timelineResolverSettled();
    const resolver = useTimelineResolverStore.getState().resolver;
    if (!resolver) return [];
    const spansOf = (id: number) => resolverSpans(resolver, id);
    const moved = editedMarcherEnds(target, result, spansOf).keys();
    const found = laterOwnMoves({
        moved,
        start,
        spansOf,
        positionAt: (id, beat) => resolver.positionAt(id, beat),
        flags: flagsOf(boxes),
    });
    if (found.length === 0) return [];
    const transitionIds = found.map((m) => m.transitionId);
    const shaped = await shapeBackedTransitionIds({
        db: database,
        transitionIds,
    });
    return found.filter((m) => !shaped.has(m.transitionId));
}

/** A kept marcher's later move: the marcher, its slot and the flag it ends on */
const laterMoveKey = (m: LaterOwnMove) =>
    `${m.marcherId}:${m.transitionId}:${m.slotIndex}:${m.flag}`;

/**
 * Shows the **Move them too** toast for `found` (an edit surprise toast). Does nothing for none.
 * With the edit's `mark` and `scope` (its window and marchers), edits in a row that keep the same
 * marchers' same later moves add up, so the action shifts by all of them (`continueEditRun`).
 */
export async function toastLaterOwnMoves(
    found: readonly LaterOwnMove[],
    boxes: readonly PageBox[] = useTimelineSelectionStore.getState().pageBoxes,
    mark: number | null = null,
    scope = "",
): Promise<void> {
    if (found.length === 0) return;
    const labels = await marcherLabelsById(found.map((m) => m.marcherId));
    const byMarcher = new Map(found.map((m) => [m.marcherId, m]));
    const kept = inDrillOrder([...byMarcher.keys()], labels).map((id) => ({
        label: labels.get(id)!.label,
        page: boxes.find((b) => b.end === byMarcher.get(id)!.flag)?.name ?? "?",
    }));
    if (kept.length === 0) return;
    const run =
        mark === null
            ? null
            : continueEditRun<ShiftTotals>(
                  "timeline",
                  mark,
                  scope,
                  (previous) => addShifts(previous, found, laterMoveKey).totals,
              );
    // A newer edit's toast already shows
    if (run?.stale) return;
    const moves = found.map((m) => ({
        ...m,
        ...run?.value.get(laterMoveKey(m)),
    }));
    const forget = () => run?.forget();
    const { message, actionLabel } = moveThemTooMessage(kept);
    const id = editSurpriseToastId();
    toast.info(message, {
        id,
        duration: MOVE_THEM_TOO_TOAST_MS,
        action: {
            label: actionLabel,
            onClick: () => {
                forget();
                shiftSlotDestinations({ db, shifts: moves }).catch(
                    (e: unknown) =>
                        toastTimelineError(
                            e,
                            tolgee.t(
                                "marcherPages.moveThemToo.moveError",
                                "Error moving marchers",
                            ),
                        ),
                );
            },
        },
        onDismiss: forget,
        onAutoClose: forget,
    });
    run?.shown(id);
}

/** The window an edit was on, for `editScope` */
const windowKey = (target: TimelineEditTarget) =>
    target.kind === "range"
        ? `range:${target.start}-${target.end}`
        : target.kind === "point"
          ? `point:${target.beat}`
          : target.kind === "home"
            ? "home"
            : `timeline:${target.timelineId}`;

/**
 * A timeline coordinate edit (`moveMarchersInTarget`) with what it says after: the pass-through
 * toast as before; when there's none, once the resolver has the edit, **Move them too** when the
 * edit split its marchers at a later page (`laterOwnMoves`), adding up edits in a row that keep the
 * same marchers; and when it didn't, **Only Page N** when it changed an existing own move and
 * carried into the later pages that follow it (`offerOnlyThisPage`, UI-18 keep later pages).
 * Errors finding them are logged, never thrown: the edit itself has committed.
 */
export async function moveMarchersAndOfferFollowUp({
    database = db,
    target,
    moves: requested,
    clearPage,
    keepLaterPages,
    setUnmovedFrom,
    afterWrite,
    writesShapes = false,
    setAll = false,
}: {
    database?: DbConnection;
    target: TimelineEditTarget;
    moves: readonly TimelineMarcherMove[];
    /**
     * Clear this page: the caller says who was skipped (`setMarchersToNeighborPage`), and nothing
     * is offered after it, since the menu already chose what the later pages do (#573)
     */
    clearPage?: boolean;
    /** With `clearPage`: the next page keeps where it was (`moveMarchersInTarget`) */
    keepLaterPages?: boolean;
    /**
     * Where each marcher stands now: when the moves that are written (Basic's locked marchers
     * left out) move any of them, the ones they leave where they are are written as stays
     * (`moveMarchersInTarget`'s `keepUnchanged`)
     */
    setUnmovedFrom?: ReadonlyMap<number, { x: number; y: number }>;
    /**
     * With `setUnmovedFrom`, write the stays even when nobody moves, unless Basic leaves some of
     * them out (a copy of a shape without them would drop them from it)
     */
    setAll?: boolean;
    /** App data written in the same edit (`moveMarchersInTarget`) */
    afterWrite?: (
        tx: DbTransaction,
        timelineId: number | null,
    ) => Promise<void | boolean>;
    /**
     * The edit saves shape recipes itself (the Shape tool's Place, filling a box), so placed
     * boxes aren't kept up to date around it
     */
    writesShapes?: boolean;
}): Promise<TimelineMoveResult> {
    let start: EditStart | null = null;
    let owned: Set<number> = new Set();
    // UI-19: Basic leaves the marchers it can't edit on this page alone (V-203); with nobody left
    // the edit is refused, and the refusal's toast offers Switch to Expert
    const editable = withoutLockedMarchers(target, requested);
    if (editable.moves.length === 0 && editable.locked.length > 0)
        throw new TimelineEditRefusedError("notSimple", {
            marcherIds: editable.locked,
        });
    const moves = editable.moves;
    const keepUnchanged =
        setUnmovedFrom !== undefined &&
        ((setAll && editable.locked.length === 0) ||
            moves.some((m) => {
                const c = setUnmovedFrom.get(m.marcherId);
                return !c || !samePosition([c.x, c.y], [m.x, m.y]);
            }));
    const marcherIds = moves.map((m) => m.marcherId);
    // Placed boxes follow the edit: moved together, or left with holes (07-placed-boxes.md)
    const membership = writesShapes ? null : membershipFor(target, moves);
    const result = await moveMarchersInTarget({
        db: database,
        target,
        moves,
        clearPage,
        keepLaterPages,
        keepUnchanged,
        afterWrite: membership
            ? async (tx, timelineId) => {
                  const own = afterWrite
                      ? (await afterWrite(tx, timelineId)) !== false
                      : false;
                  const boxes = await membership.afterWrite(tx, timelineId);
                  return own || boxes;
              }
            : afterWrite,
        onStart: () => {
            start = readEditStart(target, marcherIds);
            owned = ownMovers(target, marcherIds);
        },
    });
    const mark = editHistoryMark();
    toastLockedMarchers(editable.locked.length, true);
    // Clear this page's caller says who it skipped, quietly, and it offers nothing after
    if (clearPage) return result;
    // A drag back left shape and follow-the-leader members in their move: say who and why (a
    // warning, since the rest was written)
    if (result.skipped) toastTimelineError(result.skipped);
    // The resolver's change re-reads them (`PlacedBoxesOverlay`), except where nobody moves (#455)
    if (writesShapes) invalidatePlacedBoxes();
    if (membership && membership.leaves.length > 0)
        showLeftBoxToast(membership.leaves, (refill, save) =>
            moveMarchersAndOfferFollowUp({
                database,
                target,
                moves: refill,
                afterWrite: save,
                writesShapes: true,
            }),
        );
    toastPassThrough(result);
    // The pass-through toast and its Keep as a stop win: Move them too would replace it (same id)
    if (result.passThrough) return result;
    const scope = editScope([windowKey(target)], marcherIds);
    void findLaterOwnMoves({ database, target, result, start })
        .then(async (found) => {
            if (found.length > 0)
                return toastLaterOwnMoves(found, undefined, mark, scope);
            // No split: say where a changed move carried, with Only Page N
            await offerOnlyThisPage({
                database,
                target,
                result,
                start,
                mark,
                scope,
                owned,
            });
        })
        .catch((e: unknown) =>
            console.error("Couldn't check the edit's later moves", e),
        );
    return result;
}

/** The moment an edit writes at: its move's end, or beat 0 for homes */
function beatOfTarget(target: TimelineEditTarget): number | undefined {
    if (target.kind === "home") return 0;
    if (target.kind === "range") return target.end;
    if (target.kind === "point") return target.beat;
    return useTimelineSelectionStore
        .getState()
        .storedTimelines?.find((t) => t.id === target.timelineId)?.end;
}

/** Placed box membership for an edit, reading where marchers stand from the resolver */
function membershipFor(
    target: TimelineEditTarget,
    moves: readonly TimelineMarcherMove[],
) {
    const beat = beatOfTarget(target);
    if (beat === undefined) return null;
    return boxMembershipEdit({
        moves,
        beat,
        // Read inside the edit, when the resolver has every earlier write but not this one
        positionOf: (id) => {
            const resolver = useTimelineResolverStore.getState().resolver;
            if (!resolver) return undefined;
            // A marcher the resolver doesn't know isn't on a spot: never fail the edit over it
            try {
                const [x, y] = editingPositionAt(resolver, id, beat);
                return { x, y };
            } catch {
                return undefined;
            }
        },
    });
}
