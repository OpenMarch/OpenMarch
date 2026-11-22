/**
 * Basic mode's "simple" predicate (docs/timeline/research/basic-mode/README.md, "Simple: what
 * Basic can edit"). Pure: works over stored assignment rows (`readBasicRows`), not the resolver's
 * spans, and is shared by the panel, the canvas locks and the point writer
 * (`timelinePointMoves.ts`).
 *
 * A marcher is simple on a page box `[start, end)` when every one of its rows overlapping the box
 * lies inside it, no two of them overlap in time (whatever their layers), and each is a one-slot
 * transition with no shape and a `direct` path, on a slot with no drawn path (no lane, spec v0.10).
 * A marcher with no row over the box is simple.
 *
 * A marcher Held over a box (a stored Held mark, holds decision 4) is locked there too when its
 * hold grows out of a move Basic can't edit (`heldArrivalLock`): an edit inside a hold edits its
 * arrival, which the writer refuses then (`refuseLockedArrivals`, `timelineMoves.ts`).
 */

/** One assignment row with what the predicate needs from its transition. */
export interface BasicRow {
    assignmentId: number;
    marcherId: number;
    transitionId: number;
    /** The marcher's slot in its transition (a converted page shares one transition, C-11) */
    slotIndex: number;
    timelineId: number;
    start: number;
    end: number;
    layer: number;
    slotCount: number;
    shapeId: number | null;
    pathStyle: string;
    /** Its slot walks a drawn path (a lane, spec v0.10 D-20), so Basic leaves it alone */
    laned?: boolean;
}

export type SimpleVerdict =
    | { simple: true }
    | {
          simple: false;
          reason: "crossesFlag" | "overlaps" | "shape" | "path";
      };

type Box = { start: number; end: number };

/** A Held hold (`HeldMark`, `timeline_held_marks`) as the locks read it */
export type BasicHold = { marcherId: number; start: number; end: number };
type Reason = Extract<SimpleVerdict, { simple: false }>["reason"];

const SIMPLE: SimpleVerdict = { simple: true };

export const overlapsBox = (row: Pick<BasicRow, "start" | "end">, box: Box) =>
    row.start < box.end && row.end > box.start;

/**
 * The verdict for rows that all overlap the box, sorted by start. Reasons are checked in the
 * order crossesFlag, overlaps, shape, path; the first that applies is returned.
 */
const verdictOfSorted = (
    rows: readonly BasicRow[],
    box: Box,
): SimpleVerdict => {
    let reason: Reason | null = null;
    const better = (r: Reason) => {
        const order: Reason[] = ["crossesFlag", "overlaps", "shape", "path"];
        if (reason === null || order.indexOf(r) < order.indexOf(reason))
            reason = r;
    };
    let reach = -Infinity;
    for (const row of rows) {
        if (row.start < box.start || row.end > box.end) {
            better("crossesFlag");
            break;
        }
        if (row.start < reach) better("overlaps");
        reach = Math.max(reach, row.end);
        // A shared shapeless transition is fine: a converted show writes one per page, and Basic
        // edits its marchers' slots one by one (UI-19, "Simple")
        if (row.shapeId !== null) better("shape");
        else if (row.pathStyle !== "direct" || row.laned) better("path");
    }
    return reason === null ? SIMPLE : { simple: false, reason };
};

const byStart = (a: BasicRow, b: BasicRow) =>
    a.start - b.start || a.end - b.end;

/**
 * Whether one marcher is simple on `box`.
 *
 * @param rows that marcher's rows (any; those not overlapping the box are ignored)
 */
export function marcherSimpleOnBox(
    rows: readonly BasicRow[],
    box: Box,
): SimpleVerdict {
    const over = rows.filter((r) => overlapsBox(r, box)).sort(byStart);
    return over.length === 0 ? SIMPLE : verdictOfSorted(over, box);
}

/**
 * The page box a hold's arrival ends on: the one with `start < hold.start <= end`, so an arrival
 * ending mid-page or on a page's flag finds that page.
 */
export const arrivalBoxOf = <B extends Box>(
    hold: Pick<BasicHold, "start">,
    boxes: readonly B[],
): B | undefined =>
    boxes.find((b) => b.start < hold.start && hold.start <= b.end);

/**
 * Why Basic can't edit inside `hold`, or `null` when it can. An edit inside a hold edits the move
 * arriving at its start (holds decision 4), so Basic can edit it only when that arrival is simple
 * on the page box it ends on (`arrivalBoxOf`). A hold with no move ending at its start (one from
 * the starting spot, #619) or before every box is editable. The one rule for the locks
 * (`lockedMarchersByPage`) and the writer (`refuseLockedArrivals`, `timelineMoves.ts`).
 *
 * @param rows the hold's marcher's rows (any; others are ignored)
 * @param boxes the page boxes, without the home page
 */
export function heldArrivalLock(
    rows: readonly BasicRow[],
    hold: BasicHold,
    boxes: readonly Box[],
): Reason | null {
    const own = rows.filter((r) => r.marcherId === hold.marcherId);
    if (!own.some((r) => r.end === hold.start)) return null;
    const box = arrivalBoxOf(hold, boxes);
    if (!box) return null;
    const verdict = marcherSimpleOnBox(own, box);
    return verdict.simple ? null : verdict.reason;
}

/**
 * The marchers that aren't simple on each box (locked in Basic), with why: by box index, then by
 * marcher id. Every box index has an entry, empty when nobody is locked there. Rows are sorted
 * once and each row visits only the boxes it overlaps (found by binary search when the boxes don't
 * overlap each other, as page boxes don't).
 *
 * A marcher is also locked on every box whose end flag a hold of its covers when that hold grows
 * out of a move Basic can't edit (`heldArrivalLock`), with that move's reason: it has no row
 * there, but an edit at that flag edits the move. A box the hold ends partway through isn't
 * locked by it: its flag edit is after the hold.
 *
 * @param rows every row of the show (`readBasicRows`)
 * @param holds every Held hold of the show (`readHeldMarks`)
 */
export function lockedMarchersByPage(
    rows: readonly BasicRow[],
    boxes: readonly Box[],
    holds: readonly BasicHold[] = [],
): Map<number, Map<number, Reason>> {
    const out = new Map<number, Map<number, Reason>>();
    boxes.forEach((_, i) => out.set(i, new Map()));
    if (boxes.length === 0 || rows.length === 0) return out;

    // Box indices by start; disjoint boxes allow a binary search on their ends
    const order = boxes
        .map((_, i) => i)
        .sort((a, b) => boxes[a]!.start - boxes[b]!.start);
    const disjoint = order.every(
        (index, k) =>
            k === 0 || boxes[order[k - 1]!]!.end <= boxes[index]!.start,
    );
    const boxesOver = (row: Box): number[] => {
        if (!disjoint) return order.filter((i) => overlapsBox(row, boxes[i]!));
        // The first box (by start) whose end is after the row's start
        let lo = 0;
        let hi = order.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (boxes[order[mid]!]!.end <= row.start) lo = mid + 1;
            else hi = mid;
        }
        const found: number[] = [];
        for (let k = lo; k < order.length; k++) {
            const box = boxes[order[k]!]!;
            if (box.start >= row.end) break;
            found.push(order[k]!);
        }
        return found;
    };

    const sorted = [...rows].sort(
        (a, b) => a.marcherId - b.marcherId || byStart(a, b),
    );
    const holdsOf = new Map<number, BasicHold[]>();
    for (const hold of holds)
        holdsOf.set(hold.marcherId, [
            ...(holdsOf.get(hold.marcherId) ?? []),
            hold,
        ]);
    let i = 0;
    while (i < sorted.length) {
        const first = i;
        const marcherId = sorted[i]!.marcherId;
        // This marcher's rows over each box, in start order
        const perBox = new Map<number, BasicRow[]>();
        for (; i < sorted.length && sorted[i]!.marcherId === marcherId; i++) {
            const row = sorted[i]!;
            for (const b of boxesOver(row)) {
                const list = perBox.get(b);
                if (list) list.push(row);
                else perBox.set(b, [row]);
            }
        }
        for (const [b, list] of perBox) {
            const verdict = verdictOfSorted(list, boxes[b]!);
            if (!verdict.simple) out.get(b)!.set(marcherId, verdict.reason);
        }
        const own = sorted.slice(first, i);
        for (const hold of holdsOf.get(marcherId) ?? []) {
            const reason = heldArrivalLock(own, hold, boxes);
            if (reason === null) continue;
            for (const b of boxesOver(hold)) {
                // Only where its flag edit lands inside the hold (`isInsideHeldMark`): a page
                // the hold ends partway through is edited at a flag after it
                const flag = boxes[b]!.end;
                if (!(hold.start < flag && flag <= hold.end)) continue;
                const locked = out.get(b)!;
                if (!locked.has(marcherId)) locked.set(marcherId, reason);
            }
        }
    }
    return out;
}

/**
 * The beats inside `box` where `marcherId` has a position of its own mid-page: the ends of its
 * moves strictly inside the box (not on either flag), ascending and distinct. For drawing ticks.
 */
export function pointsInBox(
    rows: readonly BasicRow[],
    marcherId: number,
    box: Box,
): number[] {
    const beats = new Set<number>();
    for (const row of rows)
        if (
            row.marcherId === marcherId &&
            row.end > box.start &&
            row.end < box.end
        )
            beats.add(row.end);
    return [...beats].sort((a, b) => a - b);
}
