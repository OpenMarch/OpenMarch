import type { NormalizedSheet, ParsedSheet } from "./types";
import { getNormalizedSheetKeys, keyToDrillPrefixAndOrder } from "./types";
import { extractSheetsFromPage } from "./parsePage";
import { normalizeSheets } from "./normalize";
import { reconcileSheets } from "./reconcile";
import { dryRunValidate } from "./dryRun";
import { buildPagePlan, validatePlan } from "./planBuilder";
import type { SourceHashType } from "./coordParser";
import type {
    ImportManifest,
    ImporterAdapter,
    ImportValidationReport,
} from "../types";
import { validateManifest } from "../validate";

export type { SourceHashType } from "./coordParser";

export type ParsedPdf = {
    pages: number;
    parsed: ParsedSheet[];
};

export type ImportResult = {
    dryRun: ReturnType<typeof dryRunValidate>;
    pages: number;
    normalized: NormalizedSheet[];
    parsed: ParsedSheet[];
};

type FieldPropsLike = { xCheckpoints: any[]; yCheckpoints: any[] };

async function configurePdfWorker(pdfjs: any) {
    try {
        const workerModule =
            await import("pdfjs-dist/build/pdf.worker.min.mjs?raw");
        const blob = new Blob([workerModule.default as string], {
            type: "application/javascript",
        });
        (pdfjs as any).GlobalWorkerOptions.workerSrc =
            URL.createObjectURL(blob);
    } catch {
        try {
            const workerModule =
                await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
            (pdfjs as any).GlobalWorkerOptions.workerSrc = workerModule.default;
        } catch {
            (pdfjs as any).GlobalWorkerOptions.workerSrc = "";
        }
    }
}

/** Parse PDF text into structured sheets (heavy; call once per file). */
export async function parsePdfToSheets(
    arrayBuffer: ArrayBuffer,
): Promise<ParsedPdf> {
    const pdfjs = await import("pdfjs-dist");
    await configurePdfWorker(pdfjs as any);
    const pdf = await (pdfjs as any).getDocument({ data: arrayBuffer.slice(0) })
        .promise;

    const parsedSheets: ParsedSheet[] = [];

    for (let i = 0; i < pdf.numPages; i++) {
        let sheets = await extractSheetsFromPage(pdf, i);
        if (sheets.length === 0) {
            try {
                const { extractSheetsFromPageOCR } = await import("./ocr");
                sheets = await extractSheetsFromPageOCR(pdf, i);
            } catch {
                // OCR disabled or unavailable; keep sheets empty
            }
        }
        if (sheets.length > 0) {
            const rowCount = sheets.reduce(
                (sum, s) => sum + (s.rows?.length || 0),
                0,
            );
            console.log(
                `[pdf-import] Page ${i + 1}: ${sheets.length} sheets, ${rowCount} rows`,
            );
            parsedSheets.push(...sheets);
        }
    }

    if (parsedSheets.length === 0) {
        try {
            const { extractSheetsFromPageOCR } = await import("./ocr");
            for (let i = 0; i < pdf.numPages; i++) {
                const ocrSheets = await extractSheetsFromPageOCR(pdf, i);
                parsedSheets.push(...ocrSheets);
            }
        } catch {
            // OCR disabled or unavailable
        }
    }

    const totalRows = parsedSheets.reduce((sum, s) => sum + s.rows.length, 0);
    console.log(
        `[pdf-import] Extracted ${totalRows} rows across ${parsedSheets.length} sheets`,
    );

    return { pages: pdf.numPages, parsed: parsedSheets };
}

/** Original all-in-one entry point (kept for backwards compatibility). */
export async function dryRunImportPdfCoordinates(
    arrayBuffer: ArrayBuffer,
    fieldProperties: FieldPropsLike,
    sourceHashType?: SourceHashType,
): Promise<ImportResult> {
    const { pages, parsed } = await parsePdfToSheets(arrayBuffer);
    const result = normalizeParsedSheets(
        parsed,
        fieldProperties,
        sourceHashType,
    );
    return { ...result, pages };
}

/** Reconcile, normalize, and validate parsed sheets (light; safe to re-run on hash type change). */
export function normalizeParsedSheets(
    parsedSheets: ParsedSheet[],
    fieldProperties: FieldPropsLike,
    sourceHashType?: SourceHashType,
    forceIndoor?: boolean,
    flipIndoorAxes?: boolean,
): Omit<ImportResult, "pages"> {
    const reconciled = reconcileSheets(parsedSheets);
    const normalized = normalizeSheets(
        reconciled,
        fieldProperties,
        sourceHashType,
        forceIndoor,
        flipIndoorAxes,
    );
    const dryRun = dryRunValidate(normalized, fieldProperties);
    return { dryRun, normalized, parsed: parsedSheets };
}

/** Detect the hash type from field property checkpoint names. */
export function detectFieldHashType(
    yCheckpoints: { name: string }[],
): SourceHashType {
    for (const cp of yCheckpoints) {
        if (/\bhs\b/i.test(cp.name)) return "HS";
        if (/\b(ncaa|college)\b/i.test(cp.name)) return "CH";
        if (/\b(nfl|pro)\b/i.test(cp.name)) return "PH";
    }
    return "HS";
}

/**
 * Convert NormalizedSheet[] into the universal ImportManifest format.
 * This bridges the PDF-specific pipeline to the shared import system.
 */
export function toManifest(
    normalized: NormalizedSheet[],
    filename: string,
): ImportManifest {
    const sheetKeys = getNormalizedSheetKeys(normalized);

    // Build marchers from unique sheet keys
    const seenKeys = new Set<string>();
    const marchers: ImportManifest["marchers"] = [];
    for (let i = 0; i < normalized.length; i++) {
        const key = sheetKeys[i];
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const { prefix, order } = keyToDrillPrefixAndOrder(key, i + 1);
        marchers.push({
            key,
            drillPrefix: prefix,
            drillOrder: order,
            label: normalized[i].header.label,
            name: normalized[i].header.performer,
        });
    }

    // Build sets from page plan
    const plan = buildPagePlan(normalized);
    const validation = validatePlan(plan);
    const flags = validation.valid ? validation.flags : plan.map(() => false);
    const sets: ImportManifest["sets"] = plan.map((entry, idx) => ({
        setId: entry.name,
        counts: entry.counts,
        order: idx,
        isSubset: flags[idx],
    }));

    // Build positions from all rows across all sheets
    const positions: ImportManifest["positions"] = [];
    for (let i = 0; i < normalized.length; i++) {
        const key = sheetKeys[i];
        for (const row of normalized[i].rows) {
            positions.push({
                marcherKey: key,
                setId: row.setId,
                xSteps: row.xSteps,
                ySteps: row.ySteps,
                confidence: row.conf,
            });
        }
    }

    // Aggregate confidence
    const confs = positions
        .map((p) => p.confidence)
        .filter((c): c is number => c !== undefined);
    const avgConfidence =
        confs.length > 0
            ? confs.reduce((a, b) => a + b, 0) / confs.length
            : undefined;

    return {
        source: { format: "pdf-coordinates", filename },
        marchers,
        sets,
        positions,
        confidence: avgConfidence,
    };
}

/**
 * Validate an ImportManifest that came from the PDF pipeline.
 * Runs the shared validation on the manifest.
 */
export function validatePdfManifest(
    manifest: ImportManifest,
    fieldBounds?: {
        xCheckpoints: { stepsFromCenterFront: number }[];
        yCheckpoints: { stepsFromCenterFront: number }[];
    },
): ImportValidationReport {
    return validateManifest(manifest, fieldBounds);
}

/** The PDF coordinate import adapter. */
export const pdfAdapter: ImporterAdapter = {
    id: "pdf-coordinates",
    name: "PDF Drill Coordinates",
    accepts: (file: File) =>
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf"),
    parse: async (file: File): Promise<ImportManifest> => {
        const arrayBuffer = await file.arrayBuffer();
        const { parsed } = await parsePdfToSheets(arrayBuffer);
        const reconciled = reconcileSheets(parsed);
        const normalized = normalizeSheets(reconciled, {
            xCheckpoints: [],
            yCheckpoints: [],
        });
        return toManifest(normalized, file.name);
    },
};
