import { useEffect } from "react";
import { create } from "zustand";
import tolgee from "@/global/singletons/Tolgee";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { toastBasicLock } from "./basicLockToast";
import {
    useTimelineSelectionStore,
    type PageBox,
} from "@/stores/TimelineSelectionStore";
import { useBasicRows } from "@/hooks/queries/useBasicRows";
import { useHeldMarksStore } from "./useHeldMarks";
import type { TimelineEditTarget } from "@/db-functions/timelineMoves";
import type { TimelineMarcherMove } from "@/db-functions/timelineMoves";
import {
    heldArrivalLock,
    lockedMarchersByPage,
    type BasicHold,
    type BasicRow,
    type SimpleVerdict,
} from "./basicSimple";

/**
 * Basic mode's locks (UI-19, docs/timeline/research/basic-mode, "Simple"): per page box, the
 * marchers Basic can't edit there because their moves there need Expert (a move across a page
 * flag, overlapping moves, a shape, a non-direct path), or because they're Held there from such a
 * move. They still play and draw; edits to them are dropped before writing, with a toast offering
 * **Switch to Expert**. The writer refuses them too (`setPositionsAtBeatInTransaction`,
 * `refuseLockedArrivals`), so this is the friendly half.
 *
 * The store is fed by `useBasicLocksHost` while Basic is on in a timeline file, and is empty
 * otherwise, so everything here is a no-op in Expert and page mode.
 */

type Reason = Extract<SimpleVerdict, { simple: false }>["reason"];

interface BasicLocksState {
    /** Every assignment row, as of the last read; `null` outside Basic */
    readonly rows: readonly BasicRow[] | null;
    /** The page boxes the locks are for, in show order */
    readonly boxes: readonly PageBox[];
    /** Per box (index into `boxes`), the locked marchers and why */
    readonly locked: ReadonlyMap<number, ReadonlyMap<number, Reason>>;
    /**
     * The Held holds that grow out of a move Basic can't edit (`heldArrivalLock`), with why: an
     * edit at a count inside one edits that move. A page the hold ends partway through isn't
     * locked for it, so this locks the counts inside it there.
     */
    readonly heldLocks: readonly (BasicHold & { reason: Reason })[];
    /**
     * @param holds the show's Held holds (`readHeldMarks`): a marcher Held from a move Basic
     *   can't edit is locked where it's held (`heldArrivalLock`)
     */
    readonly set: (
        rows: readonly BasicRow[] | null,
        boxes: readonly PageBox[],
        holds?: readonly BasicHold[],
    ) => void;
}

const NONE: ReadonlyMap<number, ReadonlyMap<number, Reason>> = new Map();

export const useBasicLocksStore = create<BasicLocksState>((set) => ({
    rows: null,
    boxes: [],
    locked: NONE,
    heldLocks: [],
    set: (rows, boxes, holds = []) =>
        set({
            rows,
            boxes,
            locked:
                rows && boxes.length > 0
                    ? lockedMarchersByPage(rows, boxes, holds)
                    : NONE,
            heldLocks: rows ? lockedHolds(rows, boxes, holds) : [],
        }),
}));

/** The holds of `holds` Basic can't edit inside (`heldArrivalLock`), with why */
function lockedHolds(
    rows: readonly BasicRow[],
    boxes: readonly PageBox[],
    holds: readonly BasicHold[],
): (BasicHold & { reason: Reason })[] {
    if (holds.length === 0) return [];
    const held = new Set(holds.map((h) => h.marcherId));
    const rowsOf = new Map<number, BasicRow[]>();
    for (const row of rows)
        if (held.has(row.marcherId))
            rowsOf.set(row.marcherId, [
                ...(rowsOf.get(row.marcherId) ?? []),
                row,
            ]);
    return holds.flatMap((hold) => {
        const reason = heldArrivalLock(
            rowsOf.get(hold.marcherId) ?? [],
            hold,
            boxes,
        );
        return reason === null ? [] : [{ ...hold, reason }];
    });
}

/** Keeps the locks current: on while `enabled` (a timeline file) and Basic is on. */
export function useBasicLocksHost(enabled: boolean): void {
    const on = useIsBasicMode() && enabled;
    const { data: rows } = useBasicRows(on);
    const boxes = useTimelineSelectionStore((s) => s.pageBoxes);
    // Read after every edit, undo or redo that may change them (`useHeldMarksHost`)
    const holds = useHeldMarksStore((s) => s.marks);
    useEffect(() => {
        useBasicLocksStore
            .getState()
            .set(on ? (rows ?? null) : null, boxes, holds);
    }, [on, rows, boxes, holds]);
}

/** The index of `box` in the store's boxes, or -1 */
const boxIndexOf = (
    state: Pick<BasicLocksState, "boxes">,
    box: { start: number; end: number },
) => state.boxes.findIndex((b) => b.start === box.start && b.end === box.end);

/** The marchers locked on `box` (empty outside Basic or for an unknown box). */
export function lockedOnBox(
    box: { start: number; end: number },
    state: Pick<
        BasicLocksState,
        "boxes" | "locked"
    > = useBasicLocksStore.getState(),
): ReadonlyMap<number, Reason> {
    return state.locked.get(boxIndexOf(state, box)) ?? new Map();
}

/**
 * Splits a Basic edit's moves into the ones it may write and the locked marchers it drops: those
 * locked on its page, and those Held at its count from a move Basic can't edit (`heldLocks`). Any
 * other target (Expert, home, a range) passes through unchanged.
 */
export function withoutLockedMarchers<
    M extends Pick<TimelineMarcherMove, "marcherId">,
>(
    target: TimelineEditTarget,
    moves: readonly M[],
    state: Pick<BasicLocksState, "boxes" | "locked"> &
        Partial<
            Pick<BasicLocksState, "heldLocks">
        > = useBasicLocksStore.getState(),
): { moves: M[]; locked: number[] } {
    if (target.kind !== "point") return { moves: [...moves], locked: [] };
    const locked = new Set(lockedOnBox(target.box, state).keys());
    // A count inside a hold edits the move arriving at its start (`isInsideHeldMark`)
    for (const hold of state.heldLocks ?? [])
        if (hold.start < target.beat && target.beat <= hold.end)
            locked.add(hold.marcherId);
    if (locked.size === 0) return { moves: [...moves], locked: [] };
    return {
        moves: moves.filter((m) => !locked.has(m.marcherId)),
        locked: moves
            .filter((m) => locked.has(m.marcherId))
            .map((m) => m.marcherId),
    };
}

/**
 * The toast for marchers a Basic edit left alone because they're locked (V-203). `wrote` says
 * whether the others were edited.
 */
export function toastLockedMarchers(count: number, wrote: boolean): void {
    if (count === 0) return;
    toastBasicLock(
        tolgee.t(
            wrote ? "timeline.basic.lockedNotMoved" : "timeline.basic.locked",
            { count },
        ),
    );
}
