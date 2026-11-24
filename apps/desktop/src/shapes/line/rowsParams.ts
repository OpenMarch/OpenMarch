/**
 * The rows a Line, Curve or Arc's marchers are split into (spec #1190): the drawn line and rows
 * alongside it, `apart` field units from one to the next across the line, each row starting
 * `slant` further along the line than the one before it. Each row has its own marchers, can sit
 * off center along the line, and can leave spots empty. Everything is in the line's own frame, so
 * the rows turn and follow it as it's reshaped. Only on an open line; a closed one is filled
 * instead. Absent: one row, the line itself.
 */
export interface LineRows {
    /**
     * Every row, the drawn line's among them, in order across the line: from its right-hand side
     * to its left-hand side, walking it from its first point to its last
     */
    readonly list: readonly LineRow[];
    /** Which of `list` is the drawn line */
    readonly drawn: number;
    /** From one row to the next, in field units; more than 0 */
    readonly apart: number;
    /**
     * How much further along the line each row starts than the one before it, toward its left-hand
     * side, in field units; below 0 the other way. None when absent.
     */
    readonly slant?: number;
}

/** One row */
export interface LineRow {
    /**
     * How many marchers stand in it. On every row or none: absent, the marchers are shared out
     * evenly, the back row the short one.
     */
    readonly count?: number;
    /**
     * Where it sits along the line from centered on the drawn line, in half spots, the line's own
     * way (first point to last). Centered when absent.
     */
    readonly shift?: number;
    /** Its spots left empty, by place along it the line's own way from 0, in order. None when absent. */
    readonly empty?: readonly number[];
}

/** The most rows a line can have, the drawn one among them */
export const MAX_ROWS = 20;

const ROWS_KEYS = new Set(["list", "drawn", "apart", "slant"]);
const ROW_KEYS = new Set(["count", "shift", "empty"]);

const isInt = (x: unknown): x is number =>
    typeof x === "number" && Number.isInteger(x);
const isFiniteNumber = (x: unknown): x is number =>
    typeof x === "number" && Number.isFinite(x);

function isRow(r: unknown): r is LineRow {
    if (typeof r !== "object" || r === null) return false;
    if (Object.keys(r).some((key) => !ROW_KEYS.has(key))) return false;
    const { count, shift, empty } = r as LineRow;
    if (count !== undefined && !(isInt(count) && count >= 0)) return false;
    if (shift !== undefined && !isInt(shift)) return false;
    if (empty === undefined) return true;
    return (
        Array.isArray(empty) &&
        empty.every(
            (e, i) => isInt(e) && e >= 0 && (i === 0 || e > empty[i - 1]!),
        )
    );
}

/** A stored `rows`: absent, or only the fields this build knows (ADR 0006, decision 5) */
export function isRows(r: unknown): r is LineRows | undefined {
    if (r === undefined) return true;
    if (typeof r !== "object" || r === null) return false;
    if (Object.keys(r).some((key) => !ROWS_KEYS.has(key))) return false;
    const { list, drawn, apart, slant } = r as LineRows;
    if (!Array.isArray(list) || list.length < 1 || list.length > MAX_ROWS)
        return false;
    if (!list.every(isRow)) return false;
    // Counts on every row or none
    const counted = list.filter((row) => row.count !== undefined).length;
    if (counted !== 0 && counted !== list.length) return false;
    return (
        isInt(drawn) &&
        drawn >= 0 &&
        drawn < list.length &&
        isFiniteNumber(apart) &&
        apart > 0 &&
        (slant === undefined || isFiniteNumber(slant))
    );
}

/** The rows that lay out: none on a closed line, which is filled instead */
export const rowsOf = (p: {
    readonly rows?: LineRows;
    readonly closed?: boolean;
}): LineRows | null => (p.rows && p.closed !== true ? p.rows : null);

/**
 * How `n` marchers share out over `order.length` rows, front row first: as many in each as the
 * front row holds, the back row taking what's left, or as evenly as they go when that would
 * leave the back row a single marcher (16 in 3: 6 6 4; 10 in 4: 3 3 2 2). By row, `order` giving
 * the rows from the front.
 */
export function shareOut(n: number, order: readonly number[]): number[] {
    const r = order.length;
    const counts = new Array<number>(r).fill(0);
    if (r === 0) return counts;
    const each = Math.ceil(n / r);
    const last = n - each * (r - 1);
    order.forEach((row, i) => {
        counts[row] =
            last >= 2 || r === 1
                ? i < r - 1
                    ? each
                    : last
                : Math.floor(n / r) + (i < n % r ? 1 : 0);
    });
    return counts;
}

/**
 * The rows' marchers for `n`: their stored counts, or shared out (`shareOut`) when they have
 * none. Stored counts that no longer add up to `n` (the selection changed) give or take one at a
 * time, the shortest row from the front taking and the longest from the back giving.
 */
export function resolveCounts(
    rows: LineRows,
    n: number,
    order: readonly number[],
): number[] {
    if (rows.list[0]?.count === undefined) return shareOut(n, order);
    const counts = rows.list.map((row) => row.count ?? 0);
    let sum = counts.reduce((a, b) => a + b, 0);
    while (sum < n) {
        counts[pickRow(counts, order, "shortest", -1)!]! += 1;
        sum++;
    }
    while (sum > n) {
        const from = pickRow(counts, order, "longest", -1, 0);
        if (from === null) break;
        counts[from]! -= 1;
        sum--;
    }
    return counts;
}

/**
 * The shortest (the front-most of equals) or longest (the back-most of equals) row other than
 * `not`; with `above`, only one holding more than that many. Null when there's none.
 */
export function pickRow(
    counts: readonly number[],
    order: readonly number[],
    which: "shortest" | "longest",
    not: number,
    above = -Infinity,
): number | null {
    const rows = (which === "shortest" ? order : [...order].reverse()).filter(
        (row) => row !== not && counts[row]! > above,
    );
    if (rows.length === 0) return null;
    return rows.reduce((best, row) =>
        which === "shortest"
            ? counts[row]! < counts[best]!
                ? row
                : best
            : counts[row]! > counts[best]!
              ? row
              : best,
    );
}
