/**
 * Format-agnostic validation on ImportManifest.
 * Adapters may add format-specific issues before or after calling this.
 */

import type {
    ImportManifest,
    ImportIssue,
    ImportPosition,
    ImportValidationReport,
} from "./types";

type FieldBounds = {
    xCheckpoints: { stepsFromCenterFront: number }[];
    yCheckpoints: { stepsFromCenterFront: number }[];
};

function deriveBounds(fieldBounds?: FieldBounds) {
    let xBound = 96;
    let yBound = 90;
    if (fieldBounds) {
        const xAbs = fieldBounds.xCheckpoints.map((c) =>
            Math.abs(c.stepsFromCenterFront),
        );
        const yAbs = fieldBounds.yCheckpoints.map((c) =>
            Math.abs(c.stepsFromCenterFront),
        );
        if (xAbs.length > 0) xBound = Math.max(...xAbs) * 1.1;
        if (yAbs.length > 0) yBound = Math.max(...yAbs) * 1.1;
    }
    return { xBound, yBound };
}

function checkDuplicateKeys(manifest: ImportManifest): ImportIssue[] {
    const issues: ImportIssue[] = [];
    const seen = new Set<string>();
    for (const m of manifest.marchers) {
        const k = m.key.toLowerCase();
        if (seen.has(k)) {
            issues.push({
                type: "error",
                code: "DUPLICATE_LABEL",
                message: `Duplicate marcher key "${m.key}"`,
                marcherKey: m.key,
            });
        }
        seen.add(k);
    }
    return issues;
}

function checkSetConsistency(manifest: ImportManifest): ImportIssue[] {
    const byMarcher = new Map<string, Set<string>>();
    for (const pos of manifest.positions) {
        let s = byMarcher.get(pos.marcherKey);
        if (!s) {
            s = new Set();
            byMarcher.set(pos.marcherKey, s);
        }
        s.add(pos.setId);
    }
    if (byMarcher.size <= 1) return [];
    const canonical = [...[...byMarcher.values()][0]].sort().join("|");
    const issues: ImportIssue[] = [];
    for (const [key, sets] of byMarcher) {
        if ([...sets].sort().join("|") !== canonical) {
            issues.push({
                type: "error",
                code: "SET_MISMATCH",
                message: `Set list mismatch for marcher "${key}"`,
                marcherKey: key,
            });
        }
    }
    return issues;
}

function checkPosition(
    pos: ImportPosition,
    xBound: number,
    yBound: number,
): ImportIssue[] {
    const issues: ImportIssue[] = [];
    if (!pos.setId) {
        issues.push({
            type: "error",
            code: "MISSING_CRITICAL",
            message: `Missing setId for marcher "${pos.marcherKey}"`,
            marcherKey: pos.marcherKey,
            field: "setId",
        });
    }
    if (!Number.isFinite(pos.xSteps)) {
        issues.push({
            type: "error",
            code: "LATERAL_PARSE_FAILED",
            message: `Invalid x coordinate for marcher "${pos.marcherKey}" at set ${pos.setId}`,
            marcherKey: pos.marcherKey,
            setId: pos.setId,
            field: "xSteps",
        });
    }
    if (!Number.isFinite(pos.ySteps)) {
        issues.push({
            type: "error",
            code: "FB_PARSE_FAILED",
            message: `Invalid y coordinate for marcher "${pos.marcherKey}" at set ${pos.setId}`,
            marcherKey: pos.marcherKey,
            setId: pos.setId,
            field: "ySteps",
        });
    }
    if (
        Number.isFinite(pos.xSteps) &&
        Number.isFinite(pos.ySteps) &&
        (Math.abs(pos.xSteps) > xBound || Math.abs(pos.ySteps) > yBound)
    ) {
        issues.push({
            type: "error",
            code: "OUT_OF_BOUNDS",
            message: `Out-of-bounds at set ${pos.setId} (x=${pos.xSteps.toFixed(1)}, y=${pos.ySteps.toFixed(1)})`,
            marcherKey: pos.marcherKey,
            setId: pos.setId,
        });
    }
    if (typeof pos.confidence === "number" && pos.confidence < 0.5) {
        issues.push({
            type: "warning",
            code: "LOW_CONFIDENCE",
            message: `Low confidence for marcher "${pos.marcherKey}" at set ${pos.setId}`,
            marcherKey: pos.marcherKey,
            setId: pos.setId,
            confidence: pos.confidence,
        });
    }
    return issues;
}

export function validateManifest(
    manifest: ImportManifest,
    fieldBounds?: FieldBounds,
): ImportValidationReport {
    const { xBound, yBound } = deriveBounds(fieldBounds);
    const issues: ImportIssue[] = [
        ...checkDuplicateKeys(manifest),
        ...checkSetConsistency(manifest),
        ...manifest.positions.flatMap((p) => checkPosition(p, xBound, yBound)),
        ...manifest.sets.flatMap((s): ImportIssue[] => {
            const out: ImportIssue[] = [];
            if (!s.setId)
                out.push({
                    type: "error",
                    code: "MISSING_CRITICAL",
                    message: "Set with empty setId",
                    field: "setId",
                });
            if (!Number.isFinite(s.counts) || s.counts < 0)
                out.push({
                    type: "error",
                    code: "MISSING_CRITICAL",
                    message: `Invalid counts for set "${s.setId}"`,
                    setId: s.setId,
                    field: "counts",
                });
            return out;
        }),
    ];
    return {
        issues,
        stats: {
            marchers: manifest.marchers.length,
            sets: manifest.sets.length,
            positions: manifest.positions.length,
        },
    };
}
