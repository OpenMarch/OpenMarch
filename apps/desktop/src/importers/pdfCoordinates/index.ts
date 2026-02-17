import type { NormalizedSheet, ParsedSheet } from "./types";
import { extractSheetsFromPage } from "./parsePage";
import { normalizeSheets } from "./normalize";
import { reconcileSheets } from "./reconcile";
import { dryRunValidate } from "./dryRun";
import type { SourceHashType } from "./coordParser";

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
): Omit<ImportResult, "pages"> {
    const reconciled = reconcileSheets(parsedSheets);
    const normalized = normalizeSheets(
        reconciled,
        fieldProperties,
        sourceHashType,
    );
    const dryRun = dryRunValidate(normalized);
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
