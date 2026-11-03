import type { AssignmentRow } from "@openmarch/core";

/**
 * Where a marcher stands with respect to one page box, in timeline mode (keep later pages,
 * defined-coordinates 10, owner decision 2026-10-09; holds decision 1). Pure: works over the
 * assignment rows of a snapshot.
 *
 * - `follows`: no row over any beat of the box, so it holds where an earlier move left it, and an
 *   edit of that earlier page carries into this one (Not set). **Set as shown** applies.
 * - `own`: it moves on this page by rows that lie inside the box (an ordinary page move, or a
 *   shorter window). It is Set there.
 * - `midMove`: a row over the box starts before it or ends after it, so the marcher is partway
 *   through a longer move at one of the box's flags.
 */
export type PageBoxState = "follows" | "own" | "midMove";

/** A page box: its timeline runs from the previous flag to its own. */
export interface PageBoxRange {
    readonly start: number;
    readonly end: number;
}

type Row = Pick<AssignmentRow, "id" | "marcher" | "start" | "end">;

/** One box's states for the asked marchers, with how many are in each. */
export interface PageBoxStates {
    box: PageBoxRange;
    /** By marcher id, for each asked marcher */
    states: Map<number, PageBoxState>;
    counts: Record<PageBoxState, number>;
}

const emptyCounts = (): Record<PageBoxState, number> => ({
    follows: 0,
    own: 0,
    midMove: 0,
});

/** One marcher's state on `box`, from its rows that cover any beat of the box. */
export function pageBoxStateOf(
    rowsOverBox: readonly Row[],
    box: PageBoxRange,
): PageBoxState {
    if (rowsOverBox.length === 0) return "follows";
    if (rowsOverBox.some((r) => r.start < box.start || r.end > box.end))
        return "midMove";
    return "own";
}

/**
 * Each of `marcherIds`' state on each of `boxes` (`PageBoxState`), in the order of `boxes`.
 * Marchers with no rows at all follow everywhere.
 *
 * @param assignments every assignment row (a snapshot's `assignments`)
 */
export function pageBoxStatesForSelection({
    assignments,
    boxes,
    marcherIds,
}: {
    assignments: readonly Row[];
    boxes: readonly PageBoxRange[];
    marcherIds: readonly number[];
}): PageBoxStates[] {
    const asked = new Set(marcherIds);
    const byMarcher = new Map<number, Row[]>();
    for (const row of assignments) {
        if (!asked.has(row.marcher)) continue;
        const list = byMarcher.get(row.marcher);
        if (list) list.push(row);
        else byMarcher.set(row.marcher, [row]);
    }
    return boxes.map((box) => {
        const states = new Map<number, PageBoxState>();
        const counts = emptyCounts();
        for (const marcherId of asked) {
            const over = (byMarcher.get(marcherId) ?? []).filter(
                (r) => r.start < box.end && r.end > box.start,
            );
            const state = pageBoxStateOf(over, box);
            states.set(marcherId, state);
            counts[state]++;
        }
        return { box: { start: box.start, end: box.end }, states, counts };
    });
}
