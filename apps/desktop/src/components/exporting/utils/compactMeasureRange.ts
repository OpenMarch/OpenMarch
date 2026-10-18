const MEASURE_RANGE =
    /^\s*([A-Za-z0-9]+)(?:\(\d+\))?(?:\s*[→-]\s*([A-Za-z0-9]+)(?:\(\d+\))?)?\s*$/;

/**
 * Formats a measure range for a narrow coordinate sheet column, e.g. "12A-14" (max 11 chars).
 * Discards the beat offsets but always keeps both ends of the range.
 * Accepts strings like "12A(9) → 14(16)", "49(3) - 53" or "12(9)".
 */
export function compactMeasureRange(measureStr: string): string {
    const match = measureStr.match(MEASURE_RANGE);
    if (!match) return measureStr;

    const [, start, end] = match;
    if (end === undefined || end === start) return start;
    return `${start}-${end}`.slice(0, 11);
}
