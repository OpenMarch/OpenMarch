import type { DryRunReport, NormalizedSheet } from "./types";

export function dryRunValidate(sheets: NormalizedSheet[]): DryRunReport {
    const issues = [] as DryRunReport["issues"];

    // label uniqueness across sheets
    const labels = new Map<string, { pageIndex: number; quadrant: string }>();
    for (const s of sheets) {
        const label = s.header.label?.trim();
        if (label) {
            const key = label.toLowerCase();
            if (labels.has(key)) {
                issues.push({
                    type: "error",
                    code: "DUPLICATE_LABEL",
                    message: `Duplicate label ${label}`,
                    pageIndex: s.pageIndex,
                    quadrant: s.quadrant,
                });
            } else
                labels.set(key, {
                    pageIndex: s.pageIndex,
                    quadrant: s.quadrant,
                });
        }
    }

    // set list and counts consistency across sheets
    const canonical =
        sheets[0]?.rows.map((r) => `${r.setId}:${r.counts}`) || [];
    for (const s of sheets) {
        const cur = s.rows.map((r) => `${r.setId}:${r.counts}`);
        if (canonical.length && cur.join("|") !== canonical.join("|")) {
            issues.push({
                type: "error",
                code: "SET_MISMATCH",
                message: `Set list or counts mismatch on page ${s.pageIndex + 1} ${s.quadrant}`,
                pageIndex: s.pageIndex,
                quadrant: s.quadrant,
            });
        }
    }

    // bounds, NaN, and plausibility checks
    for (const s of sheets) {
        for (const r of s.rows) {
            // NaN coordinates = parse failure
            if (!Number.isFinite(r.xSteps)) {
                issues.push({
                    type: "error",
                    code: "LATERAL_PARSE_FAILED",
                    message: `Lateral parse failed at set ${r.setId}: "${r.lateralText}"`,
                    pageIndex: s.pageIndex,
                    quadrant: s.quadrant,
                    setId: r.setId,
                    field: "lateralText",
                });
            }
            if (!Number.isFinite(r.ySteps)) {
                issues.push({
                    type: "error",
                    code: "FB_PARSE_FAILED",
                    message: `Front-back parse failed at set ${r.setId}: "${r.fbText}"`,
                    pageIndex: s.pageIndex,
                    quadrant: s.quadrant,
                    setId: r.setId,
                    field: "fbText",
                });
            }
            // Out-of-bounds (only check if parseable)
            if (
                Number.isFinite(r.xSteps) &&
                Number.isFinite(r.ySteps) &&
                (Math.abs(r.xSteps) > 96 || Math.abs(r.ySteps) > 90)
            ) {
                issues.push({
                    type: "error",
                    code: "OUT_OF_BOUNDS",
                    message: `Out-of-bounds coordinate at set ${r.setId} (x=${r.xSteps.toFixed(1)}, y=${r.ySteps.toFixed(1)})`,
                    pageIndex: s.pageIndex,
                    quadrant: s.quadrant,
                    setId: r.setId,
                });
            }
            // Missing criticals
            if (!r.setId || !Number.isFinite(r.counts) || r.counts < 0) {
                issues.push({
                    type: "error",
                    code: "MISSING_CRITICAL",
                    message: `Missing setId/counts at page ${s.pageIndex + 1}`,
                    pageIndex: s.pageIndex,
                    quadrant: s.quadrant,
                    setId: r.setId,
                    field: !r.setId ? "setId" : "counts",
                });
            }
            // Low confidence warning on OCR-derived rows
            if (typeof r.conf === "number" && r.conf < 0.5) {
                issues.push({
                    type: "warning",
                    code: "LOW_CONFIDENCE",
                    message: `Low confidence row at set ${r.setId}`,
                    pageIndex: s.pageIndex,
                    quadrant: s.quadrant,
                    setId: r.setId,
                    confidence: r.conf,
                });
            }
        }
    }

    const stats = {
        sheets: sheets.length,
        rows: sheets.reduce((a, b) => a + b.rows.length, 0),
        performers: new Set(
            sheets.map(
                (s) =>
                    s.header.label ||
                    s.header.symbol ||
                    s.header.performer ||
                    "?",
            ),
        ).size,
    };

    return { issues, stats };
}
