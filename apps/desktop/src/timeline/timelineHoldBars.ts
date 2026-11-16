import type { HeldMark } from "@/db-functions/timelineHeldArrival";
import type { CarrySpan } from "./timelineCarryForward";
import { windowWinsOverHold } from "./heldRules";

/**
 * The selection's holds on the timeline (holds README decisions 10 and 11; fork #472, #477): for
 * each selected marcher, every stretch where it stands still, as a bar at exact counts from its
 * arrival (where the keyframe diamond is) to its departure (where its next move takes over).
 *
 * - **Held** (a stored mark, `timeline_held_marks`) draws solid.
 * - **Not defined** (nothing decided: the marcher shows the last spot, and moves with edits to
 *   it) draws light and dashed.
 * - A **shape carried on** draws solid too: the shape carried onto later pages is the shape's
 *   hold, and it stays until changed (owner, 2026-11-01, on #477). Where it's carried is the
 *   field's rule (`carriedStretches`, `boxesAt`): only while every member stands on its spot.
 * - A **departure** tick marks where the next move takes over.
 *
 * Bars light up where an edit would carry: during a field drag, the stretch the drag moves
 * (`dragLitRanges`), and while **Remove keyframe, Pages N–M move back too** is hovered or focused,
 * the pages that would follow back (`useHoldLightStore`).
 *
 * One bar per stretch, kind and lit state: selected marchers holding over the same counts share
 * it. Everything here is pure, in spec beats.
 */

export type HoldBarKind = "held" | "notDefined";

/** A beat range `[start, end)`, in spec beats. */
export interface BeatRange {
    readonly start: number;
    readonly end: number;
}

export interface SelectionHoldBar extends BeatRange {
    readonly kind: HoldBarKind;
    /** Held because a shape is carried on (no Held mark): drawn as Held */
    readonly shape: boolean;
    /** An edit would carry here (a drag, or a hovered follow-back) */
    readonly lit: boolean;
    /** Not there yet: the Held bar a hovered command would make, drawn over what's there */
    readonly preview?: boolean;
    /** The selected marchers holding over exactly these counts, in selection order */
    readonly marcherIds: readonly number[];
    /** How many marchers are selected */
    readonly total: number;
}

/** Where a selected marcher's hold ends because its next move takes over. */
export interface SelectionDeparture {
    readonly beat: number;
    /** The selected marchers that leave there, in selection order */
    readonly marcherIds: readonly number[];
    readonly total: number;
}

export interface SelectionHolds {
    readonly bars: readonly SelectionHoldBar[];
    readonly departures: readonly SelectionDeparture[];
}

export const NO_HOLDS: SelectionHolds = { bars: [], departures: [] };

/** One stretch a marcher stands still over, from its resolver spans. */
export interface MarcherHold extends BeatRange {
    /** Whether a move takes over at `end` (false where the hold runs on past the last page) */
    readonly departs: boolean;
}

/**
 * One marcher's holds: its resolver hold spans, touching ones joined, cut to `[0, showEnd]`. The
 * leading hold starts at 0 (the starting spot); the trailing one runs to `showEnd` and doesn't
 * depart.
 *
 * @param showEnd the last page flag, in spec beats
 */
export function marcherHolds(
    spans: readonly CarrySpan[],
    showEnd: number,
): MarcherHold[] {
    const holds = spans
        .filter((s) => s.kind === "hold")
        .map((s) => ({ start: Math.max(0, s.start), end: s.end }))
        .sort((a, b) => a.start - b.start);
    const joined: { start: number; end: number }[] = [];
    for (const hold of holds) {
        const last = joined[joined.length - 1];
        if (last && hold.start <= last.end)
            last.end = Math.max(last.end, hold.end);
        else joined.push({ ...hold });
    }
    return joined.flatMap(({ start, end }) => {
        const departs = Number.isFinite(end) && end <= showEnd;
        const cut = Math.min(end, showEnd);
        return cut > start ? [{ start, end: cut, departs }] : [];
    });
}

/** A piece of one marcher's hold, before the selection's pieces are joined into bars. */
export interface MarcherHoldPiece extends BeatRange {
    readonly kind: HoldBarKind;
    readonly shape: boolean;
    readonly lit: boolean;
}

/**
 * One marcher's hold pieces: its Held marks, cut to its holds (a mark read before the resolver
 * took an undo or redo can reach over a move for a moment), then the rest of each hold, split
 * where the marcher's shape is carried on (`carried`, from `carriedStretches`), then split again
 * where `lit` starts and ends.
 *
 * @param marks this marcher's Held marks
 * @param carried where a shape carries this marcher, ascending
 * @param lit the ranges an edit would carry into for this marcher
 */
export function marcherHoldPieces({
    holds,
    marks,
    carried = [],
    lit = [],
}: {
    holds: readonly MarcherHold[];
    marks: readonly BeatRange[];
    carried?: readonly BeatRange[];
    lit?: readonly BeatRange[];
}): MarcherHoldPiece[] {
    const pieces: Omit<MarcherHoldPiece, "lit">[] = [];
    const sortedMarks = [...marks].sort((a, b) => a.start - b.start);
    const sortedCarried = [...carried].sort((a, b) => a.start - b.start);
    for (const hold of holds) {
        for (const mark of intersect(hold, sortedMarks))
            pieces.push({ ...mark, kind: "held", shape: false });
        for (const free of subtract(hold, sortedMarks)) {
            for (const part of intersect(free, sortedCarried))
                pieces.push(piece(part.start, part.end, true));
            for (const part of subtract(free, sortedCarried))
                pieces.push(piece(part.start, part.end, false));
        }
    }
    const out: MarcherHoldPiece[] = [];
    for (const p of pieces) {
        if (p.end <= p.start) continue;
        out.push(...splitLit(p, lit));
    }
    return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** The parts of `range` inside `over` */
function intersect(range: BeatRange, over: readonly BeatRange[]): BeatRange[] {
    return over.flatMap((r) => {
        const start = Math.max(r.start, range.start);
        const end = Math.min(r.end, range.end);
        return end > start ? [{ start, end }] : [];
    });
}

const piece = (start: number, end: number, shaped: boolean) => ({
    start,
    end,
    kind: shaped ? ("held" as const) : ("notDefined" as const),
    shape: shaped,
});

/** `range` without `cuts` (ascending by start), as the ranges left */
function subtract(range: BeatRange, cuts: readonly BeatRange[]): BeatRange[] {
    const out: BeatRange[] = [];
    let from = range.start;
    for (const cut of cuts) {
        if (cut.end <= from || cut.start >= range.end) continue;
        if (cut.start > from) out.push({ start: from, end: cut.start });
        from = Math.max(from, cut.end);
    }
    if (from < range.end) out.push({ start: from, end: range.end });
    return out;
}

/** `p` split where the `lit` ranges start and end, each part marked lit or not */
function splitLit(
    p: Omit<MarcherHoldPiece, "lit">,
    lit: readonly BeatRange[],
): MarcherHoldPiece[] {
    const over = lit
        .filter((r) => r.start < p.end && r.end > p.start)
        .map((r) => ({
            start: Math.max(r.start, p.start),
            end: Math.min(r.end, p.end),
        }))
        .sort((a, b) => a.start - b.start);
    if (over.length === 0) return [{ ...p, lit: false }];
    const out: MarcherHoldPiece[] = [];
    let from = p.start;
    for (const r of over) {
        if (r.end <= from) continue;
        if (r.start > from)
            out.push({ ...p, start: from, end: r.start, lit: false });
        out.push({
            ...p,
            start: Math.max(from, r.start),
            end: r.end,
            lit: true,
        });
        from = r.end;
    }
    if (from < p.end) out.push({ ...p, start: from, end: p.end, lit: false });
    return out;
}

/**
 * What a drag at `beat` would change for one marcher, for the bars to light (holds decision 4,
 * and the carry forward of UI-18). Inside a Held mark (`start < beat <= end`), the whole hold the
 * mark is in, from its arrival on, since the drag moves where it arrives. In any other hold that
 * `beat` starts or is inside, the rest of that hold. Partway through a move, nothing: the move
 * goes on from the new spot.
 *
 * In Expert, `windowStart` is the window's start flag, and a window that starts inside the mark
 * wins (`windowWinsOverHold`): the drag becomes the window's move instead, as it does for a
 * marcher Held at no count of the window. That lights the marks the move ends or replaces, from
 * the start flag on (the part of a hold before it stays, unlit), and the rest of the stretch after
 * `beat`.
 *
 * @param marks this marcher's Held marks
 * @param windowStart the window's start flag; undefined for a Basic edit, which has no window
 */
export function dragLitRanges(
    holds: readonly MarcherHold[],
    marks: readonly BeatRange[],
    beat: number,
    windowStart?: number | null,
): BeatRange[] {
    const mark = marks.find((m) => m.start < beat && beat <= m.end);
    const hasWindow = windowStart !== undefined && windowStart !== null;
    if (mark && !(hasWindow && windowWinsOverHold(windowStart, mark))) {
        const hold = holds.find(
            (h) => h.start <= mark.start && mark.start < h.end,
        );
        return [{ start: mark.start, end: Math.max(mark.end, hold?.end ?? 0) }];
    }
    const hold = holds.find((h) => h.start <= beat && beat < h.end);
    const after = hold ? [{ start: beat, end: hold.end }] : [];
    if (!hasWindow) return after;
    const underMove = marks
        .filter((m) => m.start < beat && windowStart < m.end)
        .map((m) => ({ start: Math.max(windowStart, m.start), end: m.end }));
    return [...underMove, ...after];
}

/**
 * Where a Held bar has a Not defined bar over the same counts (a mixed selection), ascending and
 * joined. The Held bar draws dashed there, so the stretch never reads as solid while some selected
 * marcher is Not defined (fork #477).
 */
export function notDefinedOver(
    bar: BeatRange,
    bars: readonly SelectionHoldBar[],
): BeatRange[] {
    const over = bars
        .filter(
            (b) =>
                b.kind === "notDefined" &&
                b.start < bar.end &&
                b.end > bar.start,
        )
        .map((b) => ({
            start: Math.max(b.start, bar.start),
            end: Math.min(b.end, bar.end),
        }))
        .sort((a, b) => a.start - b.start);
    const joined: { start: number; end: number }[] = [];
    for (const r of over) {
        const last = joined[joined.length - 1];
        if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
        else joined.push({ ...r });
    }
    return joined;
}

/** What lights the bars besides a drag: for each marcher it lights, its own ranges. */
export interface HoldLight {
    readonly byMarcher: ReadonlyMap<number, readonly BeatRange[]>;
    /**
     * The ranges are the holds a hovered command would make, not bars already there: each draws
     * whole as a Held bar with the page row filled above it, even over a move the command would
     * replace
     */
    readonly wouldHold?: boolean;
}

/**
 * The selection's hold bars and departure ticks.
 *
 * @param marcherIds the selected marchers, in selection order
 * @param spansOf a marcher's resolver spans
 * @param marks every Held mark
 * @param showEnd the last page flag
 * @param carriedOf where a shape carries a marcher (`carriedStretches`); nowhere without shapes
 * @param dragBeat the count a field drag edits, while one runs; lights what it changes
 * @param dragWindowStart the start flag of the window that drag edits; null for a Basic edit
 * @param light other lit ranges (a hovered follow-back)
 */
export function selectionHolds({
    marcherIds,
    spansOf,
    marks,
    showEnd,
    carriedOf,
    dragBeat = null,
    dragWindowStart = null,
    light = null,
}: {
    marcherIds: readonly number[];
    spansOf: (marcherId: number) => readonly CarrySpan[];
    marks: readonly HeldMark[];
    showEnd: number;
    carriedOf?: (marcherId: number) => readonly BeatRange[] | undefined;
    dragBeat?: number | null;
    dragWindowStart?: number | null;
    light?: HoldLight | null;
}): SelectionHolds {
    if (marcherIds.length === 0) return NO_HOLDS;
    const total = marcherIds.length;
    const marksOf = new Map<number, BeatRange[]>();
    for (const mark of marks) {
        const list = marksOf.get(mark.marcherId);
        if (list) list.push(mark);
        else marksOf.set(mark.marcherId, [mark]);
    }
    const bars = new Map<
        string,
        Omit<SelectionHoldBar, "total"> & { marcherIds: number[] }
    >();
    const departures = new Map<number, number[]>();
    for (const id of marcherIds) {
        const holds = marcherHolds(spansOf(id), showEnd);
        const own = marksOf.get(id) ?? [];
        const lightRanges = light?.byMarcher.get(id) ?? [];
        const lit = [
            ...(dragBeat === null
                ? []
                : dragLitRanges(holds, own, dragBeat, dragWindowStart)),
            ...(light?.wouldHold ? [] : lightRanges),
        ];
        const pieces = marcherHoldPieces({
            holds,
            marks: own,
            carried: carriedOf?.(id),
            lit,
        });
        const previews: (MarcherHoldPiece & { preview?: true })[] =
            light?.wouldHold
                ? lightRanges.map((r) => ({
                      ...r,
                      kind: "held",
                      shape: false,
                      lit: true,
                      preview: true,
                  }))
                : [];
        for (const p of [...pieces, ...previews]) {
            const key = `${p.kind}:${p.start}:${p.end}:${p.shape}:${p.lit}:${"preview" in p}`;
            const bar = bars.get(key);
            if (bar) bar.marcherIds.push(id);
            else bars.set(key, { ...p, marcherIds: [id] });
        }
        for (const hold of holds) {
            if (!hold.departs) continue;
            const ids = departures.get(hold.end);
            if (ids) ids.push(id);
            else departures.set(hold.end, [id]);
        }
    }
    if (bars.size === 0 && departures.size === 0) return NO_HOLDS;
    return {
        bars: [...bars.values()]
            .sort(
                (a, b) =>
                    a.start - b.start ||
                    a.end - b.end ||
                    a.kind.localeCompare(b.kind) ||
                    Number(a.lit) - Number(b.lit),
            )
            .map((bar) => ({ ...bar, total })),
        departures: [...departures]
            .sort(([a], [b]) => a - b)
            .map(([beat, ids]) => ({ beat, marcherIds: ids, total })),
    };
}
