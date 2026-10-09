/**
 * The rules every dragged timeline edge follows: a page flag (UI-16) and a move's start or end
 * (resize-move). One rule for both, so the two edges feel alike (ui.md UI-15).
 */

/** Page lines and the playhead pull an edge from this far (V-125) */
export const EDGE_SNAP_STRONG_PX = 12;
/** Downbeats pull from this far: close enough to land on, weak enough to place a count beside */
export const EDGE_SNAP_WEAK_PX = 6;

const nearestWithin = (
    beat: number,
    candidates: readonly number[],
    pixelsPerBeat: number,
    thresholdPx: number,
): number | null => {
    let best: number | null = null;
    for (const candidate of candidates)
        if (
            Math.abs(candidate - beat) * pixelsPerBeat <= thresholdPx &&
            (best === null ||
                Math.abs(candidate - beat) < Math.abs(best - beat))
        )
            best = candidate;
    return best;
};

/**
 * Where a dragged edge lands for a pointer at `beat`: the nearest page line or the playhead within
 * 12 px; else the nearest downbeat within 6 px; else the nearest whole beat. Alt (`snapDisabled`)
 * keeps only the whole beat.
 */
export function snapEdgeBeat({
    beat,
    pageBeats,
    downbeats = [],
    playheadBeat,
    pixelsPerBeat,
    snapDisabled = false,
    from,
}: {
    beat: number;
    /** The page lines (flags) */
    pageBeats: readonly number[];
    /** The measures' downbeats */
    downbeats?: readonly number[];
    /** The paused playhead, when the edge should land on it too */
    playheadBeat?: number | null;
    pixelsPerBeat: number;
    snapDisabled?: boolean;
    /**
     * Where the edge started. Never a target: zoomed out, its own line or downbeat would pull a
     * one-count drag back to the start, and the drop would do nothing (review)
     */
    from?: number;
}): number {
    if (!snapDisabled) {
        const away = (b: number) => b !== from;
        const strong = nearestWithin(
            beat,
            (playheadBeat == null
                ? pageBeats
                : [...pageBeats, playheadBeat]
            ).filter(away),
            pixelsPerBeat,
            EDGE_SNAP_STRONG_PX,
        );
        if (strong !== null) return Math.round(strong);
        const weak = nearestWithin(
            beat,
            downbeats.filter(away),
            pixelsPerBeat,
            EDGE_SNAP_WEAK_PX,
        );
        if (weak !== null) return Math.round(weak);
    }
    return Math.round(beat);
}

/**
 * A beat the edge can pass over but not land on (another timeline would get the same range, C-12;
 * or the rows can't follow) moves the edge back toward where it started, to the nearest beat it can
 * take. Returns `beat` itself when it is allowed.
 */
export function stepOffForbidden(
    beat: number,
    from: number,
    forbidden: ReadonlySet<number>,
): number {
    if (!forbidden.has(beat)) return beat;
    const back = beat > from ? -1 : 1;
    let landed = beat;
    while (forbidden.has(landed) && landed !== from) landed += back;
    return landed;
}
