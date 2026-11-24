/**
 * Dragging a cue's edges in a cue lane (fork #992), as a move's clip edges are dragged: pure, in
 * the timeline's beats, so the lane and its tests read the same answers. A cue starts on a beat;
 * a momentary cue lasts `length` beats (counts), a lasting one (null) until the next cue for its
 * performers.
 */

/** Where a cue starts, and how long it lasts (null: until the next cue). */
export interface CueSpan {
    readonly start: number;
    readonly length: number | null;
}

/** A cue's span after an edge drag, and where its bar ends. */
export interface CueEdgeResult extends CueSpan {
    readonly end: number;
}

/**
 * The cue after dragging one edge `delta` beats (already snapped, whole):
 *
 * - `end`: sets where it ends. A lasting cue becomes momentary, so its performers go back to what
 *   they held before; reaching (or passing) `until` makes it lasting again. It never ends before
 *   it starts: at least 1 beat.
 * - `start`: moves where it starts and keeps where it ends, no earlier than `first` and at least 1
 *   beat before the end.
 *
 * `until` is where the next cue for the dragged row's performers starts, or the show's end: where
 * a lasting cue's bar ends.
 */
export function cueEdgeDrag({
    edge,
    cue,
    until,
    delta,
    first = 1,
}: {
    edge: "start" | "end";
    cue: CueSpan;
    until: number;
    delta: number;
    /** The earliest beat a cue can start on (home and the first beat are one moment) */
    first?: number;
}): CueEdgeResult {
    const end = cue.length !== null ? cue.start + cue.length : until;
    if (edge === "end") {
        const next = Math.max(cue.start + 1, end + delta);
        return next >= until
            ? { start: cue.start, length: null, end: until }
            : { start: cue.start, length: next - cue.start, end: next };
    }
    const start = Math.min(Math.max(cue.start + delta, first), end - 1);
    return {
        start,
        length: cue.length === null ? null : end - start,
        end,
    };
}

/**
 * Where the next cue for a lane row's performers starts after the piece starting at `from`: the
 * start of the row's next piece set by another cue, else the row's end. In the lane's counts.
 */
export function nextCueStart(
    pieces: readonly {
        readonly from: number;
        readonly to: number;
        readonly cueId: number | null;
    }[],
    from: number,
    cueId: number,
): number {
    const next = pieces.find(
        (p) => p.from > from && p.cueId !== null && p.cueId !== cueId,
    );
    return next?.from ?? pieces.at(-1)?.to ?? from;
}
