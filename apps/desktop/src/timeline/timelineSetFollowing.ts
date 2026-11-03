import type { CarrySpan } from "./timelineCarryForward";

/**
 * Set vs Following (#300): on the playhead's exact count, a marcher is **Set** when one of its own
 * moves ends there, and on the first page (beat 0), always. Everywhere else it's **Following**:
 * holding from an earlier count or partway through a move.
 * Read from the marcher's resolver spans, as the inspector's hold line is.
 *
 * A move's end is a keyframe whether or not the marcher moved (holds decision 13, #468): a stored
 * move that goes nowhere is designer intent, so it shows a diamond, draws Set and can be removed.
 * Telling stays apart by motion made them invisible pins that stopped later pages following.
 *
 * "Ends there" means the move's own end, where that move is in charge as it ends: a span that
 * stops because a later move takes the marcher over partway (spec R-2) is a point along the way,
 * not a coordinate anyone set, and no row ends on it for Remove keyframe to take back.
 *
 * The field asks per playhead move, so each marcher's Set beats are worked out once per resolver
 * version (`marcherSetBeats`) and looked up per beat (`isSetAt`, `followingAt`).
 */

/**
 * A resolver span, with its assignment's end for telling a move's end from the count a later move
 * cuts in (`SpanInfo.assignmentEnd`).
 */
export type SetSpan = CarrySpan & {
    readonly assignmentEnd?: number | null;
};

/**
 * The beats one marcher is Set on, ascending, without the first page's (always Set): where each of
 * its own moves ends while in charge, moved or not.
 *
 * @param spans the marcher's spans (`resolverSpans`)
 */
export function marcherSetBeats(spans: readonly SetSpan[]): number[] {
    const beats = new Set<number>();
    for (const span of spans) {
        if (span.kind === "hold" || !Number.isFinite(span.end)) continue;
        if (span.assignmentEnd != null && span.assignmentEnd !== span.end)
            continue;
        beats.add(span.end);
    }
    return [...beats].sort((a, b) => a - b);
}

/** Whether a marcher with these Set beats (`marcherSetBeats`) is Set at `beat`. */
export function isSetAt(setBeats: readonly number[], beat: number): boolean {
    if (beat === 0) return true;
    let low = 0;
    let high = setBeats.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (setBeats[mid]! < beat) low = mid + 1;
        else high = mid;
    }
    return setBeats[low] === beat;
}

/** The marchers Following at `beat`, from each one's Set beats by id. */
export function followingAt(
    setBeats: ReadonlyMap<number, readonly number[]>,
    beat: number,
): Set<number> {
    const following = new Set<number>();
    if (beat === 0) return following;
    for (const [id, beats] of setBeats)
        if (!isSetAt(beats, beat)) following.add(id);
    return following;
}

/**
 * A count where a selected marcher is Set: a keyframe on the timeline. Filled when all the
 * selected marchers are Set there (`set === total`), hollow when only some are.
 */
export interface SelectionKeyframe {
    readonly beat: number;
    /** How many selected marchers are Set on the count */
    readonly set: number;
    /** How many marchers are selected */
    readonly total: number;
    /** The selected marchers Set on the count, in selection order (the diamond names them) */
    readonly marcherIds: readonly number[];
}

/**
 * The selection's keyframes, ascending: every count after the first page where a selected marcher
 * is Set. The first page has none: everyone is Set there, always.
 *
 * @param setBeats each selected marcher's Set beats (`marcherSetBeats`)
 * @param marcherIds the selected marchers, in the same order as `setBeats`
 */
export function selectionKeyframes(
    setBeats: readonly (readonly number[])[],
    marcherIds: readonly number[],
): SelectionKeyframe[] {
    const setOn = new Map<number, number[]>();
    setBeats.forEach((beats, index) => {
        for (const beat of beats) {
            if (beat === 0) continue;
            const ids = setOn.get(beat);
            if (ids) ids.push(marcherIds[index]!);
            else setOn.set(beat, [marcherIds[index]!]);
        }
    });
    const total = setBeats.length;
    return [...setOn]
        .sort(([a], [b]) => a - b)
        .map(([beat, ids]) => ({
            beat,
            set: ids.length,
            total,
            marcherIds: ids,
        }));
}
