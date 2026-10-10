import type { AssignmentRow } from "@openmarch/core";

/**
 * Where a marcher stands with respect to one page box, in timeline mode (keep later pages,
 * defined-coordinates 10, owner decision 2026-10-09). Pure: works over the assignment rows of a
 * snapshot and the stored kept markers (`readKeptAssignmentIds`).
 *
 * - `follows`: no row over any beat of the box, so it holds where an earlier move left it, and an
 *   edit of that earlier page carries into this one. **Keep** applies.
 * - `kept`: its only row over the box is a kept move (a stored marker) over exactly the box.
 *   **Follow again** applies.
 * - `own`: it moves on this page by rows that lie inside the box (an ordinary page move, or a
 *   shorter window).
 * - `midMove`: a row over the box starts before it or ends after it, so the marcher is partway
 *   through a longer move at one of the box's flags. Neither command applies.
 */
export type KeptState = "follows" | "kept" | "own" | "midMove";

/** A page box: its timeline runs from the previous flag to its own. */
export interface KeptPageBox {
    readonly start: number;
    readonly end: number;
}

type Row = Pick<AssignmentRow, "id" | "marcher" | "start" | "end">;

/** One box's states for the asked marchers, with how many are in each. */
export interface KeptStatesOnBox {
    box: KeptPageBox;
    /** By marcher id, for each asked marcher */
    states: Map<number, KeptState>;
    counts: Record<KeptState, number>;
}

const emptyCounts = (): Record<KeptState, number> => ({
    follows: 0,
    kept: 0,
    own: 0,
    midMove: 0,
});

/** One marcher's state on `box`, from its rows that cover any beat of the box. */
export function keptStateOf(
    rowsOverBox: readonly Row[],
    box: KeptPageBox,
    kept: ReadonlySet<number>,
): KeptState {
    if (rowsOverBox.length === 0) return "follows";
    if (rowsOverBox.some((r) => r.start < box.start || r.end > box.end))
        return "midMove";
    const only = rowsOverBox.length === 1 ? rowsOverBox[0]! : null;
    if (
        only &&
        kept.has(only.id) &&
        only.start === box.start &&
        only.end === box.end
    )
        return "kept";
    return "own";
}

/**
 * Each of `marcherIds`' state on each of `boxes` (`KeptState`), in the order of `boxes`, for the
 * page box chains ("2 of 8 kept") and the inspector line. Marchers with no rows at all follow
 * everywhere.
 *
 * @param assignments every assignment row (a snapshot's `assignments`)
 * @param kept the kept assignments' ids
 */
export function keptStatesForSelection({
    assignments,
    kept,
    boxes,
    marcherIds,
}: {
    assignments: readonly Row[];
    kept: ReadonlySet<number>;
    boxes: readonly KeptPageBox[];
    marcherIds: readonly number[];
}): KeptStatesOnBox[] {
    const asked = new Set(marcherIds);
    const byMarcher = new Map<number, Row[]>();
    for (const row of assignments) {
        if (!asked.has(row.marcher)) continue;
        const list = byMarcher.get(row.marcher);
        if (list) list.push(row);
        else byMarcher.set(row.marcher, [row]);
    }
    return boxes.map((box) => {
        const states = new Map<number, KeptState>();
        const counts = emptyCounts();
        for (const marcherId of asked) {
            const over = (byMarcher.get(marcherId) ?? []).filter(
                (r) => r.start < box.end && r.end > box.start,
            );
            const state = keptStateOf(over, box, kept);
            states.set(marcherId, state);
            counts[state]++;
        }
        return { box: { start: box.start, end: box.end }, states, counts };
    });
}
