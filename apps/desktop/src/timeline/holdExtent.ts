/**
 * **Shaping a hold** (holds README decisions 3, 5 and 6; 01-edit-rules "Bar-end drag", "Split hold
 * here"; 04-anchors "Touching holds merge into one"; fork #475): where a Held hold's end may go, and
 * where a hold's start is. Pure, in spec beats, so the timeline's handles (`holdEdgeHandles`) and
 * the write (`setHoldEdge`) agree on the limits.
 *
 * - **The end** (`[start, end)`'s `end`, its departure) goes anywhere from one count after the
 *   hold's start to the marcher's next move, and never past the show's end. Shortening it is
 *   **leaving early**: the counts after it are Not defined, and an edit there starts a new move
 *   where the hold now ends.
 * - **The start** is fixed by what last put the marcher there (owner, 2026-11-09;
 *   `holdReachBack`), so it has no handle.
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

/** What stops a dragged hold edge. */
export type HoldEdgeBlock =
    /** The hold keeps at least one count */
    | "minimum"
    /** The marcher's next move starts there */
    | "nextMove"
    /** The show ends there */
    | "showEnd";

/** Where one hold's end, or several holds' ends together, may be dragged. */
export interface HoldEdgeLimits {
    /** The edge's beat now */
    readonly from: number;
    readonly min: number;
    readonly max: number;
    readonly minBlock: HoldEdgeBlock;
    readonly maxBlock: HoldEdgeBlock;
}

/**
 * Where the end of `mark` may go, or null when it can't move.
 *
 * @param moves the marcher's moves (its rows, or its resolver move spans): none overlaps the mark
 * @param showEnd the last page flag
 */
export function holdEdgeLimits({
    mark,
    moves,
    showEnd,
}: {
    mark: BeatRange;
    moves: readonly BeatRange[];
    showEnd: number;
}): HoldEdgeLimits | null {
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

/** What a hold reaches back to (`holdReachBack`). */
export interface HoldReach {
    /** A row of the marcher ends there, the marcher's own earlier hold does, or the show starts */
    readonly kind: "row" | "hold" | "show";
    readonly beat: number;
}

/**
 * **What a hold grows out of** where nothing arrives at `start` (owner, 2026-11-09; ADR 0012): a
 * marcher in a Not defined gap already stands at its last spot, so the hold reaches back over the
 * gap to the latest of the end of the marcher's last row before it, the end of its own earlier hold
 * (touching holds are one hold), or the start of the show.
 *
 * @param rows the marcher's rows
 * @param marks the marcher's other holds
 * @param showStart where the show's first page starts
 */
export function holdReachBack({
    start,
    rows,
    marks,
    showStart,
}: {
    start: number;
    rows: readonly BeatRange[];
    marks: readonly BeatRange[];
    showStart: number;
}): HoldReach {
    const latestEnd = (ranges: readonly BeatRange[]) =>
        ranges.reduce(
            (at, r) => (r.end <= start ? Math.max(at, r.end) : at),
            -Infinity,
        );
    const row = latestEnd(rows);
    const hold = latestEnd(marks);
    if (Number.isFinite(hold) && hold >= row)
        return { kind: "hold", beat: hold };
    if (Number.isFinite(row)) return { kind: "row", beat: row };
    return { kind: "show", beat: Math.min(showStart, start) };
}

/**
 * The part of a window **Hold over the window** can hold, or null for none: a hold can't start on
 * page 0's one beat (it's the same moment as the show's start, and a drag on the hold's first page
 * must still count as starting at the hold) or run past the last flag.
 */
export function holdWindowInShow(
    window: BeatRange,
    showStart: number,
    showEnd: number,
): BeatRange | null {
    const start = Math.max(window.start, showStart);
    const end = Math.min(window.end, showEnd);
    return start < end ? { start, end } : null;
}

/**
 * Where **Hold over the window** (fork #476) starts a marcher's hold, for a window starting at
 * `windowStart`: there, when the marcher is partway through a move there (the cut arrives there)
 * or inside a hold of its own (which it joins); otherwise what last put it there
 * (`holdReachBack`), which is `windowStart` itself when a move or hold of its own ends there. Read
 * by the write and by the highlighted preview, so the two can't disagree.
 *
 * @param rows the marcher's rows
 * @param marks the marcher's holds
 * @param showStart where the show's first page starts
 */
export function holdOverWindowStart({
    windowStart,
    rows,
    marks,
    showStart,
}: {
    windowStart: number;
    rows: readonly BeatRange[];
    marks: readonly BeatRange[];
    showStart: number;
}): number {
    const through = (r: BeatRange) =>
        r.start < windowStart && windowStart < r.end;
    if (rows.some(through) || marks.some(through)) return windowStart;
    return holdReachBack({ start: windowStart, rows, marks, showStart }).beat;
}

/** Whether `limits` lets the edge land on `beat`. */
export const holdEdgeAllows = (limits: HoldEdgeLimits, beat: number) =>
    beat >= limits.min && beat <= limits.max;

/**
 * The limits several holds' end has when dragged together: the tightest of each (`each`), or
 * null when that leaves nowhere to go. They share `from`.
 */
export function intersectHoldEdgeLimits(
    each: readonly (HoldEdgeLimits | null)[],
): HoldEdgeLimits | null {
    if (each.length === 0 || each.some((l) => l === null)) return null;
    const all = each as readonly HoldEdgeLimits[];
    let out = all[0]!;
    for (const l of all.slice(1))
        out = {
            from: out.from,
            min: Math.max(out.min, l.min),
            max: Math.min(out.max, l.max),
            minBlock: l.min > out.min ? l.minBlock : out.minBlock,
            maxBlock: l.max < out.max ? l.maxBlock : out.maxBlock,
        };
    if (out.max < out.min) return null;
    if (out.min === out.max && out.min === out.from) return null;
    return out;
}

/**
 * Where a dragged end lands for the beat `beat` (already snapped): clamped to the limits. `blocked`
 * is what stopped it, when it did.
 */
export function landHoldEdge(
    limits: HoldEdgeLimits,
    beat: number,
): { beat: number; blocked: HoldEdgeBlock | null } {
    return {
        beat: Math.min(limits.max, Math.max(limits.min, beat)),
        blocked:
            beat < limits.min
                ? limits.minBlock
                : beat > limits.max
                  ? limits.maxBlock
                  : null,
    };
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

/** A drag of the end of some selected marchers' holds, all at `from`. */
export interface HoldEdgeDrag {
    readonly from: number;
    readonly to: number;
    readonly marcherIds: readonly number[];
}

/**
 * `marks` as `drag` would leave them: the dragged marks' end at `to`, then touching holds joined
 * (`mergeTouchingMarks`). For the bars' preview while dragging, and what the write stores.
 */
export function applyHoldEdgeDrag<M extends HoldMark>(
    marks: readonly M[],
    drag: HoldEdgeDrag,
): M[] {
    const ids = new Set(drag.marcherIds);
    const moved = marks.map((m) =>
        ids.has(m.marcherId) && m.end === drag.from
            ? { ...m, end: drag.to }
            : m,
    );
    return mergeTouchingMarks(moved);
}

/** A draggable end of the selected marchers' Held holds on the timeline. */
export interface HoldEdgeHandle {
    /** Where the end is, spec beats */
    readonly beat: number;
    /** The selected marchers whose hold has this edge here, in selection order */
    readonly marcherIds: readonly number[];
    readonly limits: HoldEdgeLimits;
}

/**
 * The selection's draggable hold ends: one handle per beat, for every selected marcher whose Held
 * hold ends there, with the limits they move within together (`intersectHoldEdgeLimits`). An end
 * that can't move gets no handle.
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
        number,
        { beat: number; limits: (HoldEdgeLimits | null)[]; ids: number[] }
    >();
    const moves = new Map<number, readonly BeatRange[]>();
    for (const mark of marks) {
        if (!selected.has(mark.marcherId)) continue;
        let own = moves.get(mark.marcherId);
        if (!own) {
            own = movesOf(mark.marcherId);
            moves.set(mark.marcherId, own);
        }
        const group = groups.get(mark.end) ?? {
            beat: mark.end,
            limits: [],
            ids: [],
        };
        group.limits.push(holdEdgeLimits({ mark, moves: own, showEnd }));
        group.ids.push(mark.marcherId);
        groups.set(mark.end, group);
    }
    const out: HoldEdgeHandle[] = [];
    for (const group of groups.values()) {
        const limits = intersectHoldEdgeLimits(group.limits);
        if (!limits) continue;
        out.push({
            beat: group.beat,
            marcherIds: [...group.ids].sort(
                (x, y) => order.get(x)! - order.get(y)!,
            ),
            limits,
        });
    }
    return out.sort((a, b) => a.beat - b.beat);
}
