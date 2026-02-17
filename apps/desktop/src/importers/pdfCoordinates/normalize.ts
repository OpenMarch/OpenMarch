import type { NormalizedSheet, ParsedSheet, NormalizedRow } from "./types";
import { parseLateral, parseFrontBack, type ParseResult } from "./coordParser";

type CheckpointLike = {
    name: string;
    stepsFromCenterFront: number;
    useAsReference: boolean;
};

type FieldPropsLike = {
    xCheckpoints: CheckpointLike[];
    yCheckpoints: CheckpointLike[];
};

export function normalizeSheets(
    sheets: ParsedSheet[],
    fieldProperties: FieldPropsLike,
): NormalizedSheet[] {
    return sheets.map((s) => ({
        pageIndex: s.pageIndex,
        quadrant: s.quadrant,
        header: s.header,
        rows: s.rows.map((r) => normalizeRow(r, fieldProperties)),
    }));
}

function normalizeRow(
    row: any,
    fieldProperties: FieldPropsLike,
): NormalizedRow {
    const xResult = parseLateral(row.lateralText, fieldProperties);
    const yResult = parseFrontBack(row.fbText, fieldProperties);

    const xSteps = xResult.ok ? xResult.steps : NaN;
    const ySteps = yResult.ok ? yResult.steps : NaN;

    if (!xResult.ok) {
        console.warn(
            `[normalize] Lateral parse failed for set ${row.setId}: ${xResult.message}`,
        );
    }
    if (!yResult.ok) {
        console.warn(
            `[normalize] FB parse failed for set ${row.setId}: ${yResult.message}`,
        );
    }

    return {
        setId: row.setId,
        counts: row.counts,
        xSteps,
        ySteps,
        lateralText: row.lateralText,
        fbText: row.fbText,
        source: row.source,
        conf: row.conf,
    };
}

// Re-export the parser functions for direct use in tests
export { parseLateral, parseFrontBack };
