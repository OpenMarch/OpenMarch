/**
 * Basic mode's "simple" predicate (docs/timeline/research/basic-mode/README.md, "Simple: what
 * Basic can edit"). Pure: works over stored assignment rows (`readBasicRows`), not the resolver's
 * spans, and is shared by the panel, the canvas locks and the point writer
 * (`timelinePointMoves.ts`).
 *
 * A marcher is simple on a page box `[start, end)` when every one of its rows overlapping the box
 * lies inside it, no two of them overlap in time (whatever their layers), and each is a one-slot
 * transition with no shape and a `direct` path. A marcher with no row over the box is simple.
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
}

export type SimpleVerdict =
    | { simple: true }
    | {
          simple: false;
          reason: "crossesFlag" | "overlaps" | "shape" | "path";
      };

type Box = { start: number; end: number };
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
        else if (row.pathStyle !== "direct") better("path");
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
 * The marchers that aren't simple on each box (locked in Basic), with why: by box index, then by
 * marcher id. Every box index has an entry, empty when nobody is locked there. Rows are sorted
 * once and each row visits only the boxes it overlaps (found by binary search when the boxes don't
 * overlap each other, as page boxes don't).
 *
 * @param rows every row of the show (`readBasicRows`)
 */
export function lockedMarchersByPage(
    rows: readonly BasicRow[],
    boxes: readonly Box[],
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
    const boxesOver = (row: BasicRow): number[] => {
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
    let i = 0;
    while (i < sorted.length) {
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
