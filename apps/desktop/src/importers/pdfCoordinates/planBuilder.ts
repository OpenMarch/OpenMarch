/**
 * Pure functions for building and validating the import page plan.
 * Extracted from ImportCoordinatesButton to enable testing and reuse.
 */

import { START_SET_IDS } from "./types";
import type { NormalizedRow, NormalizedSheet } from "./types";

export type ParsedSet = { num: number; subset: string | null };
export type PlanEntry = { name: string; counts: number };
export type PlanValidation = {
    valid: boolean;
    flags: boolean[];
    message?: string;
};

/** Canonical set-0 variant labels used in PDFs (numeric and word-based). */
const PAGE_0_VARIANTS = ["0", "Start", "Beg", "Bgn", "Opener", "Open"];

/**
 * Pre-maps all set-0 variants to the given page ID so lookup by "0", "Start", etc. works.
 * Call once and merge into pageBySetId before mapping other plan entries.
 */
export function mapPage0Variants(
    plan: PlanEntry[],
    page0Id: number,
): Map<string, number> {
    const m = new Map<string, number>();
    for (const v of PAGE_0_VARIANTS) m.set(v, page0Id);
    if (plan.length > 0) m.set(plan[0].name, page0Id);
    return m;
}

/**
 * Parse a set ID string into its numeric and subset parts.
 * "Start" / "Beg" / "Opener" → num: 0.
 * "1" → num: 1. "1A" → num: 1, subset: "A".
 */
export function parseSetId(name: string): ParsedSet | null {
    if (START_SET_IDS.test(name)) return { num: 0, subset: null };
    const m = name.match(/^(\d+)([A-Za-z]*)$/);
    if (!m) return null;
    return {
        num: parseInt(m[1], 10),
        subset: m[2] ? m[2].toUpperCase() : null,
    };
}

/**
 * Build a deduplicated, sorted page plan from normalized sheets.
 * Each entry has a unique set name and its counts value.
 */
export function buildPagePlan(sheets: NormalizedSheet[]): PlanEntry[] {
    const sets = new Map<string, number>();

    for (const sheet of sheets) {
        for (const row of sheet.rows) {
            const id = row.setId;
            if (!sets.has(id)) sets.set(id, row.counts);
        }
    }

    const plan = Array.from(sets.entries()).map(([name, counts]) => ({
        name,
        counts,
    }));

    plan.sort((a, b) => {
        const pA = parseSetId(a.name);
        const pB = parseSetId(b.name);
        if (!pA || !pB) return a.name.localeCompare(b.name);
        if (pA.num !== pB.num) return pA.num - pB.num;
        if (pA.subset === pB.subset) return 0;
        if (!pA.subset) return -1;
        if (!pB.subset) return 1;
        return pA.subset.localeCompare(pB.subset);
    });

    return plan;
}

/**
 * Validate plan ordering and produce subset flags.
 * flags[i] = true means plan[i] is a subset (e.g., "1A" after "1").
 */
export function validatePlan(plan: PlanEntry[]): PlanValidation {
    let lastNum: number | null = null;
    const flags: boolean[] = [];

    for (let i = 0; i < plan.length; i++) {
        const parsed = parseSetId(plan[i].name);
        if (!parsed)
            return {
                valid: false,
                flags: [],
                message: `Unrecognized set id: ${plan[i].name}`,
            };

        const { num, subset } = parsed;

        if (i === 0) {
            flags.push(false);
            lastNum = num;
            continue;
        }

        if (subset) {
            if (num !== lastNum)
                return {
                    valid: false,
                    flags: [],
                    message: `Subset ${plan[i].name} appears without prior base ${num}`,
                };
            flags.push(true);
        } else {
            if (lastNum !== null && num < lastNum)
                return {
                    valid: false,
                    flags: [],
                    message: `Page order not ascending near ${plan[i].name}`,
                };
            flags.push(false);
            lastNum = num;
        }
    }

    return { valid: true, flags };
}

/**
 * Compute cumulative beat positions for each plan entry.
 * First entry starts at beat 0; subsequent entries accumulate counts.
 * Returns a map from plan index to beat position.
 */
export function computeBeatPositions(plan: PlanEntry[]): Map<number, number> {
    const positions = new Map<number, number>();
    let cumulative = 0;

    for (let i = 0; i < plan.length; i++) {
        if (i > 0) cumulative += plan[i].counts;
        positions.set(i, cumulative);
    }

    return positions;
}

/**
 * Build marcher_page update records from normalized data.
 *
 * @param sheets - Normalized coordinate sheets
 * @param pageBySetId - Map from set ID string to database page ID
 * @param marcherByLabel - Map from performer label (lowercase) to marcher ID
 * @param fieldPixelsPerStep - Field pixels per step
 * @param centerX - Field center front X in pixels
 * @param centerY - Field center front Y in pixels
 */
export function buildMarcherPageUpdates(
    sheets: NormalizedSheet[],
    pageBySetId: Map<string, number>,
    marcherByLabel: Map<string, number>,
    fieldPixelsPerStep: number,
    centerX: number,
    centerY: number,
): {
    updates: Array<{
        marcher_id: number;
        page_id: number;
        x: number;
        y: number;
        notes: string;
    }>;
    stats: {
        total: number;
        committed: number;
        skippedNoMarcher: number;
        skippedNoPage: number;
        skippedInvalid: number;
    };
} {
    const updates: Array<{
        marcher_id: number;
        page_id: number;
        x: number;
        y: number;
        notes: string;
    }> = [];
    const stats = {
        total: 0,
        committed: 0,
        skippedNoMarcher: 0,
        skippedNoPage: 0,
        skippedInvalid: 0,
    };

    for (const sheet of sheets) {
        const label = (
            sheet.header.label ||
            sheet.header.symbol ||
            sheet.header.performer ||
            "?"
        ).toLowerCase();

        stats.total += sheet.rows.length;

        const marcherId = marcherByLabel.get(label);
        if (marcherId === undefined) {
            stats.skippedNoMarcher += sheet.rows.length;
            continue;
        }

        for (const row of sheet.rows) {
            const pageId = pageBySetId.get(row.setId);

            // Fallback: if set 0 variant isn't mapped, try page 0
            if (pageId === undefined) {
                const parsed = parseSetId(row.setId);
                if (parsed && parsed.num === 0) {
                    const page0 =
                        pageBySetId.get("0") ?? pageBySetId.get("Start");
                    if (page0 !== undefined) {
                        pushUpdate(marcherId, page0, row);
                        continue;
                    }
                }
                stats.skippedNoPage++;
                continue;
            }

            pushUpdate(marcherId, pageId, row);
        }
    }

    function pushUpdate(marcherId: number, pageId: number, row: NormalizedRow) {
        if (!Number.isFinite(row.xSteps) || !Number.isFinite(row.ySteps)) {
            stats.skippedInvalid++;
            return;
        }
        const x = centerX + row.xSteps * fieldPixelsPerStep;
        const y = centerY + row.ySteps * fieldPixelsPerStep;
        updates.push({
            marcher_id: marcherId,
            page_id: pageId,
            x,
            y,
            notes: `${row.lateralText} | ${row.fbText}`,
        });
        stats.committed++;
    }

    return { updates, stats };
}
