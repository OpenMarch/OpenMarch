import type { HeldMark } from "@/db-functions/timelineHeldArrival";
import type { CarrySpan } from "./timelineCarryForward";

/**
 * The selection's holds on the timeline (holds README decisions 10 and 11; fork #472, #477): for
 * each selected marcher, every stretch where it stands still, as a bar at exact counts from its
 * arrival (where the keyframe diamond is) to its departure (where its next move takes over).
 *
 * - **Held** (a stored mark, `timeline_held_marks`) draws solid.
 * - **Not defined** (nothing decided: the marcher shows the last spot, and moves with edits to
 *   it) draws light and dashed.
 * - A **shape carried on** draws solid too: the shape carried onto later pages is the shape's
 *   hold, and it stays until changed (owner, 2026-11-01, on #477).
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

/** A placed shape's recipe, as far as holds read it. */
export interface HoldShapeRecipe {
    /** The move it was placed in; null for the starting spots (beat 0) */
    readonly timelineId: number | null;
    /** Whether it marks its members ungrouped rather than describing a shape */
    readonly ungrouped: boolean;
    readonly memberIds: readonly number[];
}

/**
 * Where a placed shape takes `marcherId` (true) or lets it go (false, an ungrouped mark), by the
 * beat its recipe is placed at, ascending. A later recipe at the same beat wins.
 *
 * @param endBeatOf the end beat of a recipe's move (0 for null), undefined for a move that's gone
 */
export function marcherShapeChanges(
    recipes: readonly HoldShapeRecipe[],
    endBeatOf: (timelineId: number | null) => number | undefined,
    marcherId: number,
): { beat: number; shaped: boolean }[] {
    const changes = new Map<number, boolean>();
    for (const recipe of recipes) {
        if (!recipe.memberIds.includes(marcherId)) continue;
        const beat = endBeatOf(recipe.timelineId);
        if (beat === undefined) continue;
        changes.set(beat, !recipe.ungrouped);
    }
    return [...changes]
        .map(([beat, shaped]) => ({ beat, shaped }))
        .sort((a, b) => a.beat - b.beat);
}

/** A piece of one marcher's hold, before the selection's pieces are joined into bars. */
export interface MarcherHoldPiece extends BeatRange {
    readonly kind: HoldBarKind;
    readonly shape: boolean;
    readonly lit: boolean;
}

/**
 * One marcher's hold pieces: its Held marks as they are, then the rest of each hold, split where
 * a shape carried on starts or ends (`shapeChanges` inside the hold; one before it doesn't count,
 * since the marcher has moved since), then split again where `lit` starts and ends.
 *
 * @param marks this marcher's Held marks
 * @param shapeChanges `marcherShapeChanges` for this marcher
 * @param lit the ranges an edit would carry into for this marcher
 */
export function marcherHoldPieces({
    holds,
    marks,
    shapeChanges = [],
    lit = [],
}: {
    holds: readonly MarcherHold[];
    marks: readonly BeatRange[];
    shapeChanges?: readonly { beat: number; shaped: boolean }[];
    lit?: readonly BeatRange[];
}): MarcherHoldPiece[] {
    const pieces: Omit<MarcherHoldPiece, "lit">[] = marks.map((m) => ({
        start: m.start,
        end: m.end,
        kind: "held",
        shape: false,
    }));
    const sortedMarks = [...marks].sort((a, b) => a.start - b.start);
    for (const hold of holds) {
        for (const free of subtract(hold, sortedMarks)) {
            // Where a shape takes the marcher or lets it go inside this hold
            const inside = shapeChanges.filter(
                (c) => c.beat >= hold.start && c.beat < free.end,
            );
            let shaped = false;
            const cuts: { beat: number; shaped: boolean }[] = [];
            for (const change of inside) {
                if (change.beat <= free.start) shaped = change.shaped;
                else cuts.push(change);
            }
            let from = free.start;
            for (const cut of cuts) {
                if (cut.shaped === shaped) continue;
                pieces.push(piece(from, cut.beat, shaped));
                from = cut.beat;
                shaped = cut.shaped;
            }
            pieces.push(piece(from, free.end, shaped));
        }
    }
    const out: MarcherHoldPiece[] = [];
    for (const p of pieces) {
        if (p.end <= p.start) continue;
        out.push(...splitLit(p, lit));
    }
    return out.sort((a, b) => a.start - b.start || a.end - b.end);
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
 * What a drag at `beat` would carry into for one marcher (holds decision 4, and the carry forward
 * of UI-18): inside a Held mark (`start < beat <= end`), the whole hold the mark is in, from its
 * arrival on, since the drag moves where it arrives; in any other hold that `beat` starts or is
 * inside, the rest of that hold. Partway through a move, nothing: the move goes on from the new
 * spot.
 *
 * @param marks this marcher's Held marks
 */
export function dragLitRanges(
    holds: readonly MarcherHold[],
    marks: readonly BeatRange[],
    beat: number,
): BeatRange[] {
    const mark = marks.find((m) => m.start < beat && beat <= m.end);
    if (mark) {
        const hold = holds.find(
            (h) => h.start <= mark.start && mark.start < h.end,
        );
        return [{ start: mark.start, end: Math.max(mark.end, hold?.end ?? 0) }];
    }
    const hold = holds.find((h) => h.start <= beat && beat < h.end);
    return hold ? [{ start: beat, end: hold.end }] : [];
}

/** What lights the bars, for some of the selected marchers. */
export interface HoldLight {
    readonly marcherIds: readonly number[];
    readonly ranges: readonly BeatRange[];
}

/**
 * The selection's hold bars and departure ticks.
 *
 * @param marcherIds the selected marchers, in selection order
 * @param spansOf a marcher's resolver spans
 * @param marks every Held mark
 * @param showEnd the last page flag
 * @param shapeChangesOf `marcherShapeChanges` for a marcher; none without shapes
 * @param dragBeat the count a field drag edits, while one runs; lights what it carries into
 * @param light other lit ranges (a hovered follow-back)
 */
export function selectionHolds({
    marcherIds,
    spansOf,
    marks,
    showEnd,
    shapeChangesOf,
    dragBeat = null,
    light = null,
}: {
    marcherIds: readonly number[];
    spansOf: (marcherId: number) => readonly CarrySpan[];
    marks: readonly HeldMark[];
    showEnd: number;
    shapeChangesOf?: (marcherId: number) => { beat: number; shaped: boolean }[];
    dragBeat?: number | null;
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
    const lightOn = new Set(light?.marcherIds ?? []);
    const bars = new Map<
        string,
        Omit<SelectionHoldBar, "total"> & { marcherIds: number[] }
    >();
    const departures = new Map<number, number[]>();
    for (const id of marcherIds) {
        const holds = marcherHolds(spansOf(id), showEnd);
        const own = marksOf.get(id) ?? [];
        const lit = [
            ...(dragBeat === null ? [] : dragLitRanges(holds, own, dragBeat)),
            ...(lightOn.has(id) ? light!.ranges : []),
        ];
        const pieces = marcherHoldPieces({
            holds,
            marks: own,
            shapeChanges: shapeChangesOf?.(id),
            lit,
        });
        for (const p of pieces) {
            const key = `${p.kind}:${p.start}:${p.end}:${p.shape}:${p.lit}`;
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
