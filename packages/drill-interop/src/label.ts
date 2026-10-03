/**
 * Common drill-label prefixes seen in interchange packages. Sorted longest-first
 * when used for parsing so `"TS1"` -> `"TS"` + `1`, not `"T"` + `S1`.
 */
export const COMMON_DRILL_LABEL_PREFIXES: readonly string[] = [
    "BC",
    "BO",
    "BS",
    "BD",
    "SS",
    "FL",
    "DN",
    "TW",
    "SL",
    "MR",
    "VB",
    "AX",
    "SY",
    "DM",
    "TS",
    "OT",
    "SN",
    "HT",
    "P",
    "F",
    "C",
    "A",
    "N",
    "I",
    "T",
    "M",
    "O",
    "B",
    "E",
    "U",
    "S",
    "Q",
    "D",
    "G",
    "R",
    "X",
];

export interface ParsedDrillLabel {
    /** Full label as written in the source document, e.g. `"TS1"`. */
    drill_number: string;
    /** Alphabetic prefix portion, e.g. `"TS"`. */
    drill_prefix: string;
    /** Numeric suffix, e.g. `1`. Zero when the label has no number. */
    drill_order: number;
}

function sortedPrefixes(prefixes: readonly string[]): string[] {
    return [...new Set(prefixes.map((p) => p.toUpperCase()))].sort(
        (a, b) => b.length - a.length,
    );
}

/**
 * Splits a drill label into its prefix and numeric order using longest-prefix
 * matching against {@link COMMON_DRILL_LABEL_PREFIXES} (or a custom list).
 */
export function parseDrillLabel(
    label: string,
    knownPrefixes: readonly string[] = COMMON_DRILL_LABEL_PREFIXES,
): ParsedDrillLabel {
    const drill_number = label.trim();
    if (drill_number.length === 0) {
        return { drill_number: label, drill_prefix: "", drill_order: 0 };
    }

    const upper = drill_number.toUpperCase();
    for (const prefix of sortedPrefixes(knownPrefixes)) {
        if (!upper.startsWith(prefix)) continue;
        const suffix = upper.slice(prefix.length);
        if (suffix.length === 0 || /^\d+$/.test(suffix)) {
            return {
                drill_number,
                drill_prefix: prefix,
                drill_order: suffix.length > 0 ? parseInt(suffix, 10) : 0,
            };
        }
    }

    const fallback = upper.match(/^([A-Za-z]+)\s*(\d+)?$/);
    const drill_prefix = (fallback?.[1] ?? upper).toUpperCase();
    const drill_order = fallback?.[2] ? parseInt(fallback[2], 10) : 0;
    return { drill_number, drill_prefix, drill_order };
}
