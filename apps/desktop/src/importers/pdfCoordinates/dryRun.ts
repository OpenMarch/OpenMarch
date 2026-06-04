import {
    getNormalizedSheetKeys,
    type DryRunReport,
    type NormalizedSheet,
} from "./types";

type FieldPropsLike = {
    xCheckpoints: { stepsFromCenterFront: number }[];
    yCheckpoints: { stepsFromCenterFront: number }[];
};

export function dryRunValidate(
    sheets: NormalizedSheet[],
    fieldProperties?: FieldPropsLike,
): DryRunReport {
    // Derive bounds from field properties when available; fall back to football defaults
    let xBound = 96;
    let yBound = 90;
    if (fieldProperties) {
        const xAbs = fieldProperties.xCheckpoints.map((c) =>
            Math.abs(c.stepsFromCenterFront),
        );
        const yAbs = fieldProperties.yCheckpoints.map((c) =>
            Math.abs(c.stepsFromCenterFront),
        );
        if (xAbs.length > 0) xBound = Math.max(...xAbs) * 1.1;
        if (yAbs.length > 0) yBound = Math.max(...yAbs) * 1.1;
    }
    const issues = [] as DryRunReport["issues"];

    // label uniqueness across sheets (uses normalized keys so id-based
    // disambiguation produces distinct keys like "s-1", "s-2")
    const sheetKeys = getNormalizedSheetKeys(sheets);
    const seen = new Map<string, { pageIndex: number; quadrant: string }>();
    for (let i = 0; i < sheets.length; i++) {
        const key = sheetKeys[i];
        if (seen.has(key)) {
            issues.push({
                type: "error",
                code: "DUPLICATE_LABEL",
                message: `Duplicate label "${key}"`,
                pageIndex: sheets[i].pageIndex,
                quadrant: sheets[i].quadrant,
            });
        } else {
            seen.set(key, {
                pageIndex: sheets[i].pageIndex,
                quadrant: sheets[i].quadrant,
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
            if (!Number.isFinite(r.xSteps)) {
                const detail = r.xParseError ? ` [${r.xParseError}]` : "";
                issues.push({
                    type: "error",
                    code: r.xParseError || "LATERAL_PARSE_FAILED",
                    message: `Lateral parse failed at set ${r.setId}${detail}: "${r.lateralText}"`,
                    pageIndex: s.pageIndex,
                    quadrant: s.quadrant,
                    setId: r.setId,
                    field: "lateralText",
                });
            }
            if (!Number.isFinite(r.ySteps)) {
                const detail = r.yParseError ? ` [${r.yParseError}]` : "";
                issues.push({
                    type: "error",
                    code: r.yParseError || "FB_PARSE_FAILED",
                    message: `Front-back parse failed at set ${r.setId}${detail}: "${r.fbText}"`,
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
                (Math.abs(r.xSteps) > xBound || Math.abs(r.ySteps) > yBound)
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
            // Low confidence warning (e.g. future extractors may attach conf)
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
        performers: new Set(getNormalizedSheetKeys(sheets)).size,
    };

    return { issues, stats };
}
