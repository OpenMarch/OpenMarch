/**
 * **Shaping a hold** (holds README decisions 3, 5 and 6; 01-edit-rules "Bar-end drag", "Bar-start
 * drag", "Split hold here"; 04-anchors "Touching holds merge into one"; fork #475): where a Held
 * hold's ends may go. Pure, in spec beats, so the timeline's handles (`holdEdgeHandles`) and the
 * write (`setHoldEdge`) agree on the limits.
 *
 * - **The end** (`[start, end)`'s `end`, its departure) goes anywhere from one count after the
 *   hold's start to the marcher's next move, and never past the show's end. Shortening it is
 *   **leaving early**: the counts after it are Not defined, and an edit there starts a new move
 *   where the hold now ends.
 * - **The start** goes back to an earlier flag or count only while the hold still grows out of
 *   something: the last arrival (a move of the marcher ending there), or, for a hold from the
 *   starting spots, any count back to the show's start. A hold that starts at its arrival can't
 *   move its start: back would cross the move it grows out of, and forward would leave it
 *   borrowing its spot, which is #474's (04-anchors).
 * - Holds that **touch or overlap** after a drag become one (`mergeTouchingMarks`).
 */

/** A beat range `[start, end)`, in spec beats. */
export interface BeatRange {
    readonly start: number;
    readonly end: number;
}

/** A Held mark as the renderer and the write both see it. */
export interface HoldMark extends BeatRange {
    readonly id: number;
    readonly marcherId: number;
}

export type HoldEdge = "start" | "end";

/** What stops a dragged hold edge. */
export type HoldEdgeBlock =
    /** The hold keeps at least one count */
    | "minimum"
    /** The marcher's next move starts there */
    | "nextMove"
    /** The show ends there */
    | "showEnd"
    /** The move the hold grows out of ends there */
    | "arrival"
    /** The show starts there (a hold from the starting spots) */
    | "showStart";

/** Where one edge of one hold, or of several holds together, may be dragged. */
export interface HoldEdgeLimits {
    /** The edge's beat now */
    readonly from: number;
    readonly min: number;
    readonly max: number;
    readonly minBlock: HoldEdgeBlock;
    readonly maxBlock: HoldEdgeBlock;
    /**
     * When only some beats in `[min, max]` are allowed (a start that has to stay on an arrival),
     * those beats, ascending; absent when every beat is
     */
    readonly only?: readonly number[];
}

/**
 * Where `edge` of `mark` may go, or null when it can't move.
 *
 * @param moves the marcher's moves (its rows, or its resolver move spans): none overlaps the mark
 * @param showEnd the last page flag
 */
export function holdEdgeLimits({
    edge,
    mark,
    moves,
    showEnd,
}: {
    edge: HoldEdge;
    mark: BeatRange;
    moves: readonly BeatRange[];
    showEnd: number;
}): HoldEdgeLimits | null {
    if (edge === "end") {
        const next = moves
            .filter((m) => m.start >= mark.end)
            .reduce((at, m) => Math.min(at, m.start), Infinity);
        const nextMove = next <= showEnd;
        const max = nextMove ? next : showEnd;
        const min = mark.start + 1;
        if (max < min || (min === mark.end && max === mark.end)) return null;
        return {
            from: mark.end,
            min,
            max: Math.max(max, mark.end),
            minBlock: "minimum",
            maxBlock: nextMove ? "nextMove" : "showEnd",
        };
    }
    const fromHome = !moves.some((m) => m.start < mark.start);
    const max = mark.end - 1;
    if (fromHome) {
        if (max <= 0 && mark.start === 0) return null;
        return {
            from: mark.start,
            min: 0,
            max,
            minBlock: "showStart",
            maxBlock: "minimum",
        };
    }
    // Back to the last arrival only: a start anywhere else would grow out of nothing (#474)
    const lastArrival = moves
        .filter((m) => m.end <= mark.start)
        .reduce((at, m) => Math.max(at, m.end), 0);
    if (lastArrival === mark.start) return null;
    return {
        from: mark.start,
        min: lastArrival,
        max: mark.start,
        minBlock: "arrival",
        maxBlock: "minimum",
        only: [lastArrival, mark.start],
    };
}

/** Whether `limits` lets the edge land on `beat`. */
export const holdEdgeAllows = (limits: HoldEdgeLimits, beat: number) =>
    beat >= limits.min &&
    beat <= limits.max &&
    (limits.only === undefined || limits.only.includes(beat));

/**
 * The limits several holds' edge has when dragged together: the tightest of each (`each`), or
 * null when that leaves nowhere to go. They share `from`.
 */
export function intersectHoldEdgeLimits(
    each: readonly (HoldEdgeLimits | null)[],
): HoldEdgeLimits | null {
    if (each.length === 0 || each.some((l) => l === null)) return null;
    const all = each as readonly HoldEdgeLimits[];
    let out = all[0]!;
    for (const l of all.slice(1)) {
        const min = Math.max(out.min, l.min);
        const max = Math.min(out.max, l.max);
        const only =
            out.only === undefined
                ? l.only
                : l.only === undefined
                  ? out.only
                  : out.only.filter((b) => l.only!.includes(b));
        out = {
            from: out.from,
            min,
            max,
            minBlock: l.min > out.min ? l.minBlock : out.minBlock,
            maxBlock: l.max < out.max ? l.maxBlock : out.maxBlock,
            ...(only === undefined ? {} : { only }),
        };
    }
    const reach = out.only?.filter((b) => b >= out.min && b <= out.max);
    if (out.max < out.min) return null;
    if (reach !== undefined && reach.every((b) => b === out.from)) return null;
    if (reach === undefined && out.min === out.max && out.min === out.from)
        return null;
    return reach === undefined ? out : { ...out, only: reach };
}

/**
 * Where a dragged edge lands for the beat `beat` (already snapped): clamped to the limits, then,
 * on a beat it can't take, back toward where it started to the nearest one it can. `blocked` is
 * what stopped it, when it did.
 */
export function landHoldEdge(
    limits: HoldEdgeLimits,
    beat: number,
): { beat: number; blocked: HoldEdgeBlock | null } {
    const clamped = Math.min(limits.max, Math.max(limits.min, beat));
    const blocked =
        beat < limits.min
            ? limits.minBlock
            : beat > limits.max
              ? limits.maxBlock
              : null;
    if (limits.only === undefined) return { beat: clamped, blocked };
    // The nearest allowed beat, ties toward where it started
    const best = [...limits.only].sort(
        (a, b) =>
            Math.abs(a - clamped) - Math.abs(b - clamped) ||
            Math.abs(a - limits.from) - Math.abs(b - limits.from),
    )[0];
    return { beat: best ?? limits.from, blocked };
}

/**
 * One marcher's marks with those that touch or overlap joined into one, keeping the earliest's
 * id, ascending (04-anchors: touching holds are one hold).
 */
export function mergeTouchingMarks<M extends HoldMark>(
    marks: readonly M[],
): M[] {
    const sorted = [...marks].sort(
        (x, y) => x.marcherId - y.marcherId || x.start - y.start,
    );
    const out: M[] = [];
    for (const mark of sorted) {
        const last = out[out.length - 1];
        if (last && last.marcherId === mark.marcherId && mark.start <= last.end)
            out[out.length - 1] = {
                ...last,
                end: Math.max(last.end, mark.end),
            };
        else out.push({ ...mark });
    }
    return out;
}

/** A drag of one edge of some selected marchers' holds, all at `from`. */
export interface HoldEdgeDrag {
    readonly edge: HoldEdge;
    readonly from: number;
    readonly to: number;
    readonly marcherIds: readonly number[];
}

/**
 * `marks` as `drag` would leave them: the dragged marks' edge at `to`, then touching holds joined
 * (`mergeTouchingMarks`). For the bars' preview while dragging, and what the write stores.
 */
export function applyHoldEdgeDrag<M extends HoldMark>(
    marks: readonly M[],
    drag: HoldEdgeDrag,
): M[] {
    const ids = new Set(drag.marcherIds);
    const moved = marks.map((m) =>
        ids.has(m.marcherId) && m[drag.edge] === drag.from
            ? { ...m, [drag.edge]: drag.to }
            : m,
    );
    return mergeTouchingMarks(moved);
}

/** A draggable edge of the selected marchers' Held holds on the timeline. */
export interface HoldEdgeHandle {
    readonly edge: HoldEdge;
    /** Where the edge is, spec beats */
    readonly beat: number;
    /** The selected marchers whose hold has this edge here, in selection order */
    readonly marcherIds: readonly number[];
    readonly limits: HoldEdgeLimits;
}

/**
 * The selection's draggable hold edges: one handle per edge and beat, for every selected marcher
 * whose Held hold has that edge there, with the limits they move within together
 * (`intersectHoldEdgeLimits`). An edge that can't move gets no handle.
 *
 * @param movesOf a marcher's moves (its resolver move spans)
 * @param marks every Held mark
 */
export function holdEdgeHandles({
    marcherIds,
    movesOf,
    marks,
    showEnd,
}: {
    marcherIds: readonly number[];
    movesOf: (marcherId: number) => readonly BeatRange[];
    marks: readonly HoldMark[];
    showEnd: number;
}): HoldEdgeHandle[] {
    const selected = new Set(marcherIds);
    const order = new Map(marcherIds.map((id, i) => [id, i]));
    const groups = new Map<
        string,
        {
            edge: HoldEdge;
            beat: number;
            limits: (HoldEdgeLimits | null)[];
            ids: number[];
        }
    >();
    const moves = new Map<number, readonly BeatRange[]>();
    for (const mark of marks) {
        if (!selected.has(mark.marcherId)) continue;
        let own = moves.get(mark.marcherId);
        if (!own) {
            own = movesOf(mark.marcherId);
            moves.set(mark.marcherId, own);
        }
        for (const edge of ["start", "end"] as const) {
            const beat = mark[edge];
            const key = `${edge}:${beat}`;
            const group = groups.get(key) ?? {
                edge,
                beat,
                limits: [],
                ids: [],
            };
            group.limits.push(
                holdEdgeLimits({ edge, mark, moves: own, showEnd }),
            );
            group.ids.push(mark.marcherId);
            groups.set(key, group);
        }
    }
    const out: HoldEdgeHandle[] = [];
    for (const group of groups.values()) {
        const limits = intersectHoldEdgeLimits(group.limits);
        if (!limits) continue;
        out.push({
            edge: group.edge,
            beat: group.beat,
            marcherIds: [...group.ids].sort(
                (x, y) => order.get(x)! - order.get(y)!,
            ),
            limits,
        });
    }
    return out.sort((a, b) => a.beat - b.beat || a.edge.localeCompare(b.edge));
}
