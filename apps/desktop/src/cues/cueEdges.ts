/**
 * Dragging a cue's edges in a cue lane (fork #992), as a move's clip edges are dragged: pure, in
 * the timeline's beats, so the lane and its tests read the same answers. A cue starts on a beat;
 * a momentary cue lasts `length` beats (counts), a lasting one (null) until the next cue for its
 * performers.
 */

import type { DatabaseCue } from "@/db-functions/cues";

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
 * The cue's neighbours for its performers, in counts (fork #992): where the latest cue before it
 * starts, and where the next lasting and next momentary cues after it start. A lasting cue runs
 * until its performers' next lasting cue; a momentary cue only sits on top of the cue under it, so
 * it doesn't end one. Cues of other types, and of other performers, don't count.
 */
export interface CueNeighbours {
    readonly previous: number | null;
    readonly nextLasting: number | null;
    readonly nextMomentary: number | null;
}

export function cueNeighbours({
    cues,
    cue,
    countOf,
}: {
    cues: readonly DatabaseCue[];
    cue: DatabaseCue;
    /** A beat's count, or undefined for one that isn't a count */
    countOf: (beatId: number) => number | undefined;
}): CueNeighbours {
    const start = countOf(cue.beatId);
    const near = {
        previous: null as number | null,
        nextLasting: null as number | null,
        nextMomentary: null as number | null,
    };
    if (start === undefined) return near;
    const who = new Set(cue.marcherIds);
    for (const other of cues) {
        if (other.id === cue.id || other.type !== cue.type) continue;
        if (!other.marcherIds.some((id) => who.has(id))) continue;
        const at = countOf(other.beatId);
        if (at === undefined) continue;
        if (at < start) near.previous = Math.max(near.previous ?? at, at);
        else if (at > start) {
            const key = other.length === null ? "nextLasting" : "nextMomentary";
            near[key] = Math.min(near[key] ?? at, at);
        }
    }
    return near;
}

/**
 * The cue after dragging one edge `delta` (already snapped, whole), as a move's clip edge:
 *
 * - `end`: sets where it ends. A lasting cue becomes momentary, so its performers go back to what
 *   they held before; reaching (or passing) `until`, the next lasting cue or the show's end, makes
 *   it lasting again. A momentary cue stops at `nextMomentary`, the next momentary cue, and stays
 *   momentary. It never ends before it starts: at least 1 count.
 * - `start`: moves where it starts and keeps where it ends: no earlier than `first`, nor than just
 *   after `previous` (the cue before it, which it would otherwise pass), and at least 1 count
 *   before the end.
 */
export function cueEdgeDrag({
    edge,
    cue,
    until,
    nextMomentary = null,
    previous = null,
    delta,
    first = 1,
}: {
    edge: "start" | "end";
    cue: CueSpan;
    until: number;
    nextMomentary?: number | null;
    previous?: number | null;
    delta: number;
    /** The earliest beat a cue can start on (home and the first beat are one moment) */
    first?: number;
}): CueEdgeResult {
    const end = cue.length !== null ? cue.start + cue.length : until;
    if (edge === "end") {
        let next = Math.max(cue.start + 1, end + delta);
        if (
            cue.length !== null &&
            nextMomentary !== null &&
            nextMomentary > cue.start
        )
            next = Math.min(next, nextMomentary);
        return next >= until
            ? { start: cue.start, length: null, end: until }
            : { start: cue.start, length: next - cue.start, end: next };
    }
    const lowest = Math.max(first, previous === null ? first : previous + 1);
    const start = Math.min(Math.max(cue.start + delta, lowest), end - 1);
    return {
        start,
        length: cue.length === null ? null : end - start,
        end,
    };
}

/** Why End cue at playhead can't end a cue on a count, as the action's reason picks it. */
export type EndRefusal = "beforeStart" | "pastNext" | "endsThere";

/**
 * Ending `cue` on `count` (End cue at playhead), by the end edge's rule: its new length, or why
 * not. Before its start, or past where the drag would stop (the next lasting cue, or a momentary
 * cue's next momentary one), it's refused; on the next lasting cue it already ends there.
 */
export function endAtCount({
    cues,
    cue,
    countOf,
    count,
    showEnd,
}: {
    cues: readonly DatabaseCue[];
    cue: DatabaseCue;
    countOf: (beatId: number) => number | undefined;
    count: number;
    /** The show's last count: a lasting cue with nothing after it runs to here */
    showEnd: number;
}): { readonly length: number | null } | { readonly refused: EndRefusal } {
    const start = countOf(cue.beatId);
    if (start === undefined || count <= start)
        return { refused: "beforeStart" };
    const near = cueNeighbours({ cues, cue, countOf });
    const until = near.nextLasting ?? showEnd;
    const span = { start, length: cue.length };
    const end = cue.length !== null ? start + cue.length : until;
    const result = cueEdgeDrag({
        edge: "end",
        cue: span,
        until,
        nextMomentary: near.nextMomentary,
        delta: count - end,
    });
    if (result.end !== count) return { refused: "pastNext" };
    if (result.length === cue.length) return { refused: "endsThere" };
    return { length: result.length };
}
