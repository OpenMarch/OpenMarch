import { useEffect } from "react";
import { create } from "zustand";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { toastBasicLock } from "./basicLockToast";
import {
    useTimelineSelectionStore,
    type PageBox,
} from "@/stores/TimelineSelectionStore";
import { useBasicRows } from "@/hooks/queries/useBasicRows";
import type { TimelineEditTarget } from "@/db-functions/timelineMoves";
import type { TimelineMarcherMove } from "@/db-functions/timelineMoves";
import {
    lockedMarchersByPage,
    type BasicRow,
    type SimpleVerdict,
} from "./basicSimple";

/**
 * Basic mode's locks (UI-19, docs/timeline/research/basic-mode, "Simple"): per page box, the
 * marchers Basic can't edit there because their moves there need Expert (a move across a page
 * flag, overlapping moves, a shape, a non-direct path). They still play and draw; edits to them
 * are dropped before writing, with a toast offering **Switch to Expert**. The writer refuses them
 * too (`setPositionsAtBeatInTransaction`), so this is the friendly half.
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
    readonly set: (
        rows: readonly BasicRow[] | null,
        boxes: readonly PageBox[],
    ) => void;
}

const NONE: ReadonlyMap<number, ReadonlyMap<number, Reason>> = new Map();

export const useBasicLocksStore = create<BasicLocksState>((set) => ({
    rows: null,
    boxes: [],
    locked: NONE,
    set: (rows, boxes) =>
        set({
            rows,
            boxes,
            locked:
                rows && boxes.length > 0
                    ? lockedMarchersByPage(rows, boxes)
                    : NONE,
        }),
}));

/** Keeps the locks current: on while `enabled` (a timeline file) and Basic is on. */
export function useBasicLocksHost(enabled: boolean): void {
    const on = useIsBasicMode() && enabled;
    const { data: rows } = useBasicRows(on);
    const boxes = useTimelineSelectionStore((s) => s.pageBoxes);
    useEffect(() => {
        useBasicLocksStore.getState().set(on ? (rows ?? null) : null, boxes);
    }, [on, rows, boxes]);
}

/** "Page 4", "Pages 4 and 6", "Pages 4, 5 and 9" (names as the boxes have them) */
export function describePages(names: readonly string[]): string {
    if (names.length === 1) return `Page ${names[0]}`;
    return `Pages ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
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
 * Splits a Basic edit's moves into the ones it may write and the locked marchers it drops. Any
 * other target (Expert, home, a range) passes through unchanged.
 */
export function withoutLockedMarchers<
    M extends Pick<TimelineMarcherMove, "marcherId">,
>(
    target: TimelineEditTarget,
    moves: readonly M[],
    state?: Pick<BasicLocksState, "boxes" | "locked">,
): { moves: M[]; locked: number[] } {
    if (target.kind !== "point") return { moves: [...moves], locked: [] };
    const locked = lockedOnBox(target.box, state);
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
    const who = count === 1 ? "One marcher uses" : `${count} marchers use`;
    toastBasicLock(
        `${who} Expert moves on this page${wrote ? `, so ${count === 1 ? "it wasn't" : "they weren't"} moved` : ""}. Switch to Expert to edit ${count === 1 ? "it" : "them"}.`,
    );
}
