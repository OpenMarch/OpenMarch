import type { ParsedSheet, ParsedRow } from "./types";

export type ReconcileOptions = {
    // critical fields that should not be inferred
    critical: Array<keyof Pick<ParsedRow, "setId" | "counts">>;
};

const defaultOptions: ReconcileOptions = { critical: ["setId", "counts"] };

/**
 * Reconcile blanks and enforce per-set counts consistency across performers.
 * Does NOT infer critical fields; only trims/cleans non-critical fields.
 */
export function reconcileSheets(
    sheets: ParsedSheet[],
    options: ReconcileOptions = defaultOptions,
): ParsedSheet[] {
    const out: ParsedSheet[] = [];
    // Build per-set majority counts map using first occurrence per set among sheets
    const setToCounts = new Map<string, number>();
    for (const s of sheets) {
        for (const r of s.rows) {
            const key = r.setId?.trim();
            if (!key) continue;
            const cur = setToCounts.get(key);
            if (!cur && Number.isFinite(r.counts) && r.counts > 0)
                setToCounts.set(key, r.counts);
        }
    }
    for (const s of sheets) {
        const rows: ParsedRow[] = [];
        let lastLateral = "";
        let lastFb = "";

        for (const r of s.rows) {
            const setId = (r.setId || "").trim();
            const counts = r.counts;
            // Criticals unchanged; non-critical fields trim only
            let lateralText = (r.lateralText || "").trim();
            let fbText = (r.fbText || "").trim();

            // Infer hold: if both coordinates are missing, use previous from same sheet
            // This handles cases where a performer stands still and the sheet lists only set/counts
            if (!lateralText && !fbText && lastLateral && lastFb) {
                lateralText = lastLateral;
                fbText = lastFb;
            }

            // Update tracking if we have valid coordinates
            if (lateralText || fbText) {
                lastLateral = lateralText;
                lastFb = fbText;
            }

            // Enforce counts consistency when a canonical value exists and row has 0/NaN
            let nextCounts = counts;
            const canonical = setToCounts.get(setId);
            if (
                (!Number.isFinite(nextCounts) || nextCounts <= 0) &&
                Number.isFinite(canonical as any)
            ) {
                nextCounts = canonical as number;
            }
            rows.push({ ...r, setId, counts: nextCounts, lateralText, fbText });
        }
        out.push({ ...s, rows });
    }
    return out;
}
