import type { ParsedSheet, ParsedRow } from "./types";

export type ReconcileOptions = {
    critical: Array<keyof Pick<ParsedRow, "setId" | "counts">>;
};

const defaultOptions: ReconcileOptions = { critical: ["setId", "counts"] };

/** Minimal sanity check: does the text contain at least one digit and one letter? */
function looksLikeCoordinate(text: string): boolean {
    return /\d/.test(text) && /[a-z]/i.test(text);
}

/**
 * Reconcile blanks and enforce per-set counts consistency across performers.
 *
 * Hold inference: when both lateral and FB text are empty, copies the
 * previous row's coordinates — but ONLY if the previous text passes a
 * basic sanity check (contains both digits and letters), preventing
 * chains of garbage propagation.
 */
export function reconcileSheets(
    sheets: ParsedSheet[],
    options: ReconcileOptions = defaultOptions,
): ParsedSheet[] {
    const out: ParsedSheet[] = [];

    // Build per-set majority counts map (first valid occurrence wins)
    const setToCounts = new Map<string, number>();
    for (const s of sheets) {
        for (const r of s.rows) {
            const key = r.setId?.trim();
            if (!key) continue;
            if (
                !setToCounts.has(key) &&
                Number.isFinite(r.counts) &&
                r.counts > 0
            )
                setToCounts.set(key, r.counts);
        }
    }

    for (const s of sheets) {
        const rows: ParsedRow[] = [];
        let lastLateral = "";
        let lastFb = "";

        for (const r of s.rows) {
            const setId = (r.setId || "").trim();
            let lateralText = (r.lateralText || "").trim();
            let fbText = (r.fbText || "").trim();

            // Hold inference: only copy forward if previous text looks parseable
            if (!lateralText && !fbText && lastLateral && lastFb) {
                if (
                    looksLikeCoordinate(lastLateral) &&
                    looksLikeCoordinate(lastFb)
                ) {
                    lateralText = lastLateral;
                    fbText = lastFb;
                }
            }

            // Track last valid-looking coordinates
            if (lateralText && looksLikeCoordinate(lateralText))
                lastLateral = lateralText;
            if (fbText && looksLikeCoordinate(fbText)) lastFb = fbText;

            // Enforce counts consistency
            let nextCounts = r.counts;
            const canonical = setToCounts.get(setId);
            if (
                (!Number.isFinite(nextCounts) || nextCounts <= 0) &&
                Number.isFinite(canonical as any)
            )
                nextCounts = canonical as number;

            rows.push({ ...r, setId, counts: nextCounts, lateralText, fbText });
        }
        out.push({ ...s, rows });
    }
    return out;
}
