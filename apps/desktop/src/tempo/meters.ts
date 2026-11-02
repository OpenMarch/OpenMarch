/**
 * PROTOTYPE (tempo mode): time signatures with groupings (owner, 2026-10-21). A measure's meter is
 * written as in a score ("7/8") and how it is counted as a grouping in eighth notes ("2+2+3"): one
 * count per group, each as long as its eighths. The quarter-note tempo stays as it is, so a 7/8 bar
 * at ♩=176 has counts of 2, 2 and 3 eighths, and the tempo line keeps reading 176.
 *
 * Groupings are in eighths for every meter: 4/4 is 2+2+2+2, 6/8 is 3+3, 3/2 counted in quarters
 * is 2+2+2+2+2+2.
 */

export interface Meter {
    /** Beats in the measure ("7" of 7/8) */
    top: number;
    /** The note that gets the beat ("8" of 7/8): 2, 4, 8 or 16 */
    bottom: number;
    /** Eighths per count, in order; sums to the measure's length in eighths */
    grouping: number[];
}

/** The measure's length in eighth notes */
export const eighthsOf = (meter: Pick<Meter, "top" | "bottom">): number =>
    (meter.top * 8) / meter.bottom;

/**
 * How a meter is counted when no grouping is given: in quarters (x/4, x/2), in dotted quarters for
 * compound meters (6/8, 9/8, 12/8), and odd eighths as twos with a three at the end (5/8: 2+3,
 * 7/8: 2+2+3). Sixteenths count in eighths.
 */
export function defaultGrouping(top: number, bottom: number): number[] {
    const eighths = eighthsOf({ top, bottom });
    if (bottom === 8 && top % 3 === 0 && top > 3)
        return Array<number>(top / 3).fill(3);
    if (bottom === 16)
        return Array<number>(Math.max(1, Math.round(eighths))).fill(1);
    if (Number.isInteger(eighths / 2))
        return Array<number>(eighths / 2).fill(2);
    // odd eighths: twos, then a three
    const twos = Math.floor((eighths - 3) / 2);
    return [...Array<number>(twos).fill(2), 3];
}

/**
 * Read "7/8", "7/8 2+2+3", "5/8 3+2", "3/2" or "12/8". Null when it isn't a meter, or the
 * grouping doesn't add up to the measure.
 */
export function parseMeter(text: string): Meter | null {
    const m = text
        .trim()
        .match(/^(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*[ ,(]\s*([\d+\s]+)\)?)?$/);
    if (!m) return null;
    const top = Number(m[1]);
    const bottom = Number(m[2]);
    if (top < 1 || ![2, 4, 8, 16].includes(bottom)) return null;
    const grouping = m[3]
        ? m[3]
              .split("+")
              .map((g) => Number(g.trim()))
              .filter((g) => g > 0)
        : defaultGrouping(top, bottom);
    if (grouping.length === 0 || grouping.some((g) => !Number.isInteger(g)))
        return null;
    const sum = grouping.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - eighthsOf({ top, bottom })) > 1e-9) return null;
    return { top, bottom, grouping };
}

/** "7/8", or "7/8 (2+2+3)" when the grouping isn't the usual one */
export function meterLabel(meter: Meter, withGrouping = false): string {
    const base = `${meter.top}/${meter.bottom}`;
    const usual =
        defaultGrouping(meter.top, meter.bottom).join("+") ===
        meter.grouping.join("+");
    return withGrouping && !usual
        ? `${base} (${meter.grouping.join("+")})`
        : base;
}

/** A measure's meter from its stored columns, else from its count (n counts → n/4) */
export function meterOfMeasure(measure: {
    meter?: string | null;
    grouping?: string | null;
    counts: number;
}): Meter {
    if (measure.meter) {
        const parsed = parseMeter(
            measure.grouping
                ? `${measure.meter} ${measure.grouping}`
                : measure.meter,
        );
        if (parsed && parsed.grouping.length === measure.counts) return parsed;
    }
    return {
        top: measure.counts,
        bottom: 4,
        grouping: Array<number>(Math.max(1, measure.counts)).fill(2),
    };
}

/** Seconds of a count of `eighths` eighth notes at ♩ = `quarterBpm` */
export const countSeconds = (eighths: number, quarterBpm: number): number =>
    (eighths / 2) * (60 / quarterBpm);

/** The quarter-note tempo a count of `eighths` eighths implies, from its length */
export const quarterBpmOf = (seconds: number, eighths: number): number =>
    60 / (seconds / (eighths / 2));

/** "Common" meters to offer, with their groupings */
export const METER_CHOICES: readonly string[] = [
    "2/4",
    "3/4",
    "4/4",
    "5/4",
    "6/8",
    "9/8",
    "12/8",
    "5/8 2+3",
    "5/8 3+2",
    "7/8 2+2+3",
    "7/8 3+2+2",
    "7/8 2+3+2",
    "3/2",
];

/** Same meter and grouping */
export const sameMeter = (a: Meter | null, b: Meter | null): boolean =>
    !!a &&
    !!b &&
    a.top === b.top &&
    a.bottom === b.bottom &&
    a.grouping.join("+") === b.grouping.join("+");

/** n counts of n/4 */
const meterByCounts = (counts: number): Meter => ({
    top: Math.max(1, counts),
    bottom: 4,
    grouping: Array<number>(Math.max(1, counts)).fill(2),
});

/** A stored meter, parsed: null when there's none (or it doesn't read) */
export function storedMeterOf(measure: {
    meter?: string | null;
    grouping?: string | null;
}): Meter | null {
    if (!measure.meter) return null;
    return parseMeter(
        measure.grouping
            ? `${measure.meter} ${measure.grouping}`
            : measure.meter,
    );
}

export interface MeasureMeter {
    /** The time signature in effect: written here, or the one before carried on */
    meter: Meter;
    /** A time signature is written here: where a stretch of measures starts */
    written: boolean;
    /** Fewer counts than its meter (a short measure, marked *) */
    short: boolean;
    /** Eighths of each of its counts */
    units: number[];
}

/**
 * Every measure's time signature, as in a score (owner, 2026-11-02): a measure with a stored meter
 * has one written there, and the measures after carry it on until the next written one. A measure
 * with fewer counts than its meter is short; with more, its extra counts are quarters.
 *
 * Shows with no stored meter at all (older files) read the old way: each measure is its counts/4,
 * and one is written wherever the length changes. The first time signature edit writes those in.
 */
export function readMeters(
    measures: readonly {
        counts: number;
        meter?: string | null;
        grouping?: string | null;
    }[],
): MeasureMeter[] {
    const legacy = !measures.some((m) => m.meter);
    const out: MeasureMeter[] = [];
    measures.forEach((m, i) => {
        const prev = out[i - 1];
        const stored = storedMeterOf(m);
        let meter: Meter;
        let written: boolean;
        if (stored) {
            meter = stored;
            written = true;
        } else if (!prev) {
            meter = meterByCounts(m.counts);
            written = true;
        } else if (legacy) {
            meter = meterByCounts(m.counts);
            written = m.counts !== measures[i - 1]!.counts;
        } else {
            meter = prev.meter;
            written = false;
        }
        const g = meter.grouping;
        out.push({
            meter,
            written,
            short: m.counts < g.length,
            units: Array.from({ length: m.counts }, (_, j) => g[j] ?? 2),
        });
    });
    return out;
}
