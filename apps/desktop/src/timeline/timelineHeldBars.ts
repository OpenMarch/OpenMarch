import type { HeldMark } from "@/db-functions/timelineHeldMarks";

/**
 * The selection's **Held** holds on the timeline (holds README decision 10; fork #472): a solid
 * bar at exact counts from each hold's start, where its arrival's diamond is, to its end. One bar
 * per stretch: selected marchers Held over the same counts share it.
 */
export interface SelectionHeldBar {
    /** Where the hold starts and ends, in beats */
    readonly start: number;
    readonly end: number;
    /** The selected marchers Held over exactly these counts, in selection order */
    readonly marcherIds: readonly number[];
    /** How many marchers are selected */
    readonly total: number;
}

/**
 * The selected marchers' Held holds as bars, by start, then end.
 *
 * @param marks every Held mark (`useHeldMarksStore`)
 * @param marcherIds the selected marchers
 */
export function selectionHeldBars(
    marks: readonly HeldMark[],
    marcherIds: readonly number[],
): SelectionHeldBar[] {
    if (marcherIds.length === 0 || marks.length === 0) return [];
    const order = new Map(marcherIds.map((id, index) => [id, index]));
    const byStretch = new Map<
        string,
        { start: number; end: number; ids: number[] }
    >();
    for (const mark of marks) {
        if (!order.has(mark.marcherId)) continue;
        const key = `${mark.start}:${mark.end}`;
        const bar = byStretch.get(key);
        if (bar) bar.ids.push(mark.marcherId);
        else
            byStretch.set(key, {
                start: mark.start,
                end: mark.end,
                ids: [mark.marcherId],
            });
    }
    return [...byStretch.values()]
        .sort((a, b) => a.start - b.start || a.end - b.end)
        .map(({ start, end, ids }) => ({
            start,
            end,
            marcherIds: ids.sort((a, b) => order.get(a)! - order.get(b)!),
            total: marcherIds.length,
        }));
}
