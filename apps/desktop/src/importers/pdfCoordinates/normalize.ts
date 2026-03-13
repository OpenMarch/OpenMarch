import type { NormalizedSheet, ParsedSheet, NormalizedRow } from "./types";
import {
    parseLateral,
    parseFrontBack,
    parseLateralIndoor,
    parseFrontBackIndoor,
    isIndoorField,
    type SourceHashType,
} from "./coordParser";

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
    sourceHashType?: SourceHashType,
    forceIndoor?: boolean,
    flipIndoorAxes?: boolean,
): NormalizedSheet[] {
    return sheets.map((s) => ({
        pageIndex: s.pageIndex,
        quadrant: s.quadrant,
        header: s.header,
        rows: s.rows.map((r) =>
            normalizeRow(
                r,
                fieldProperties,
                sourceHashType,
                forceIndoor,
                flipIndoorAxes,
            ),
        ),
    }));
}

function normalizeRow(
    row: any,
    fieldProperties: FieldPropsLike,
    sourceHashType?: SourceHashType,
    forceIndoor?: boolean,
    flipIndoorAxes?: boolean,
): NormalizedRow {
    const indoor = forceIndoor ?? isIndoorField(fieldProperties);
    // When axes are flipped (letters=lateral, numbers=front-back), swap parsers so each
    // column's token type matches the parser that handles it.
    const xResult =
        indoor && flipIndoorAxes
            ? parseFrontBackIndoor(row.lateralText, fieldProperties)
            : indoor
              ? parseLateralIndoor(row.lateralText, fieldProperties)
              : parseLateral(row.lateralText, fieldProperties);
    const yResult =
        indoor && flipIndoorAxes
            ? parseLateralIndoor(row.fbText, fieldProperties)
            : indoor
              ? parseFrontBackIndoor(row.fbText, fieldProperties)
              : parseFrontBack(row.fbText, fieldProperties, sourceHashType);
    const xSteps = xResult.ok ? xResult.steps : NaN;
    const ySteps = yResult.ok ? yResult.steps : NaN;

    const result: NormalizedRow = {
        setId: row.setId,
        counts: row.counts,
        xSteps,
        ySteps,
        lateralText: row.lateralText,
        fbText: row.fbText,
        source: row.source,
        conf: row.conf,
    };

    if (!xResult.ok) {
        result.xParseError = xResult.code;
    }
    if (!yResult.ok) {
        result.yParseError = yResult.code;
    }

    return result;
}

// Re-export the parser functions for direct use in tests
export {
    parseLateral,
    parseFrontBack,
    parseLateralIndoor,
    parseFrontBackIndoor,
    isIndoorField,
};
