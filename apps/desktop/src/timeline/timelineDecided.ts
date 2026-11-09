import type { CarrySpan } from "./timelineCarryForward";

/**
 * Where a marcher's position is **decided** (holds decisions 8 and 9, review M8; fork #478), for
 * the field's look: solid when decided, dashed only when **Not defined**.
 *
 * A marcher is decided on a count when it is
 *
 * - on the first page (beat 0), always;
 * - walking in a move of its own, or arriving where one ends (`start < count <= end` of any span
 *   that isn't a hold, moved or not: a stored move is designer intent, decision 13);
 * - **Held** there (`start < count <= end` of a Held mark, `timeline_held_marks`);
 * - a member of a shape carried onto this count (owner, 2026-11-01 on #477: a shape carried onto
 *   later pages is the shape's hold). The shapes shown move per count, so the caller passes them
 *   per count (`notDefinedAt`'s `carried`).
 *
 * Everywhere else it is Not defined: an unedited stretch, including the counts before its first
 * move. The count a move starts on is decided only when something else decides it (an arrival
 * there, or a hold over it): the move hasn't moved the marcher yet.
 *
 * Each marcher's decided stretches are worked out once per resolver version and set of marks
 * (`marcherDecided`) and looked up per count (`isDecidedAt`, `notDefinedAt`), as the Set beats
 * are (`timelineSetFollowing.ts`).
 */

/** A stretch of counts `(start, end]` where a marcher is decided. */
export interface DecidedStretch {
    readonly start: number;
    readonly end: number;
}

/** The part of a Held mark this reads (`HeldMark`). */
export interface DecidedMark {
    readonly marcherId: number;
    readonly start: number;
    readonly end: number;
}

/**
 * One marcher's decided stretches, `(start, end]`, ascending and merged.
 *
 * @param spans the marcher's resolver spans (`resolverSpans`)
 * @param marks the marcher's Held marks
 */
export function marcherDecided(
    spans: readonly CarrySpan[],
    marks: readonly Pick<DecidedMark, "start" | "end">[],
): DecidedStretch[] {
    const stretches = [
        ...spans.filter(
            (s) =>
                s.kind !== "hold" &&
                Number.isFinite(s.start) &&
                Number.isFinite(s.end),
        ),
        ...marks,
    ]
        .filter((s) => s.end > s.start)
        .map(({ start, end }) => ({ start, end }))
        .sort((a, b) => a.start - b.start || a.end - b.end);
    const merged: DecidedStretch[] = [];
    for (const stretch of stretches) {
        const last = merged[merged.length - 1];
        // Touching stretches join: a move arriving where the next one starts leaves no gap
        if (last && stretch.start <= last.end)
            merged[merged.length - 1] = {
                start: last.start,
                end: Math.max(last.end, stretch.end),
            };
        else merged.push(stretch);
    }
    return merged;
}

/** Whether a marcher with these decided stretches (`marcherDecided`) is decided at `beat`. */
export function isDecidedAt(
    stretches: readonly DecidedStretch[],
    beat: number,
): boolean {
    if (beat === 0) return true;
    // The first stretch that ends at or after the beat
    let low = 0;
    let high = stretches.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (stretches[mid]!.end < beat) low = mid + 1;
        else high = mid;
    }
    const stretch = stretches[low];
    return stretch !== undefined && stretch.start < beat;
}

/** Each marcher's Held marks, by id. */
export function marksByMarcher(
    marks: readonly DecidedMark[],
): Map<number, DecidedMark[]> {
    const byMarcher = new Map<number, DecidedMark[]>();
    for (const mark of marks) {
        const own = byMarcher.get(mark.marcherId);
        if (own) own.push(mark);
        else byMarcher.set(mark.marcherId, [mark]);
    }
    return byMarcher;
}

/**
 * The marchers Not defined at `beat`, from each one's decided stretches by id.
 *
 * @param carried the members of the shapes carried onto `beat` (`placedBoxesAt`), decided there;
 *   a function, so it's only worked out when someone would otherwise be Not defined
 */
export function notDefinedAt(
    decided: ReadonlyMap<number, readonly DecidedStretch[]>,
    beat: number,
    carried: () => ReadonlySet<number> = () => NOBODY,
): Set<number> {
    const notDefined = new Set<number>();
    if (beat === 0) return notDefined;
    for (const [id, stretches] of decided)
        if (!isDecidedAt(stretches, beat)) notDefined.add(id);
    if (notDefined.size === 0) return notDefined;
    const inShapes = carried();
    for (const id of inShapes) notDefined.delete(id);
    return notDefined;
}

const NOBODY: ReadonlySet<number> = new Set();
