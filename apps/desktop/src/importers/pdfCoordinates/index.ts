import type { NormalizedSheet } from "./types";
import type { ParsedSheet } from "./types";
import { extractSheetsFromPageParser } from "./parser";
import { normalizeSheets } from "./normalize";
import { reconcileSheets } from "./reconcile";
import { dryRunValidate } from "./dryRun";

export type ImportResult = {
    dryRun: ReturnType<typeof dryRunValidate>;
    pages: number;
    normalized: NormalizedSheet[];
    parsed: ParsedSheet[];
    rawPythonOutput: any[];
};

type FieldPropsLike = { xCheckpoints: any[]; yCheckpoints: any[] };

async function configurePdfWorker(pdfjs: any) {
    // Use local worker file from pdfjs-dist package to avoid CSP issues with CDN
    // Import as raw text and create a blob URL (CSP allows blob: URLs)
    try {
        // Try importing as raw text first
        const workerModule = await import(
            "pdfjs-dist/build/pdf.worker.min.mjs?raw"
        );
        const workerContent = workerModule.default as string;
        const blob = new Blob([workerContent], {
            type: "application/javascript",
        });
        const blobUrl = URL.createObjectURL(blob);
        (pdfjs as any).GlobalWorkerOptions.workerSrc = blobUrl;
    } catch (e) {
        // Fallback: try URL import
        try {
            const workerModule = await import(
                "pdfjs-dist/build/pdf.worker.min.mjs?url"
            );
            const workerUrl = workerModule.default;
            (pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl;
        } catch (urlError) {
            (pdfjs as any).GlobalWorkerOptions.workerSrc = "";
        }
    }
}

export async function dryRunImportPdfCoordinates(
    arrayBuffer: ArrayBuffer,
    fieldProperties: FieldPropsLike,
): Promise<ImportResult> {
    const bufferCopy = arrayBuffer.slice(0);

    const pdfjs = await import("pdfjs-dist");
    await configurePdfWorker(pdfjs as any);
    const loadingTask = (pdfjs as any).getDocument({ data: bufferCopy });
    const pdf = await loadingTask.promise;

    const parsedSheets: ParsedSheet[] = [];
    const rawPythonOutputs: any[] = [];
    let totalRowsFromParser = 0;

    for (let i = 0; i < pdf.numPages; i++) {
        const result = await extractSheetsFromPageParser(pdf, i);
        if (result?.sheets && result.sheets.length > 0) {
            const pageRowCount = result.sheets.reduce(
                (sum, s) => sum + (s.rows?.length || 0),
                0,
            );
            totalRowsFromParser += pageRowCount;
            console.log(
                `[pdf-import] Page ${i + 1}: ${result.sheets.length} sheets, ${pageRowCount} total rows from parser`,
            );
            parsedSheets.push(...result.sheets);
        }
        if (result?.rawPythonOutput) {
            rawPythonOutputs.push(result.rawPythonOutput);
        }
    }

    console.log(
        `[pdf-import] Total rows from parser: ${totalRowsFromParser} across ${parsedSheets.length} sheets`,
    );

    const reconciled = reconcileSheets(parsedSheets as any);
    const reconciledRowCount = reconciled.reduce(
        (sum, s) => sum + (s.rows?.length || 0),
        0,
    );
    console.log(
        `[pdf-import] After reconciliation: ${reconciledRowCount} rows (${totalRowsFromParser - reconciledRowCount} rows lost in reconciliation)`,
    );

    const normalized = normalizeSheets(
        reconciled as any,
        fieldProperties as any,
    );
    const normalizedRowCount = normalized.reduce(
        (sum, s) => sum + (s.rows?.length || 0),
        0,
    );
    console.log(
        `[pdf-import] After normalization: ${normalizedRowCount} rows (${reconciledRowCount - normalizedRowCount} rows lost in normalization)`,
    );

    const dryRun = dryRunValidate(normalized);

    return {
        dryRun,
        pages: pdf.numPages,
        normalized,
        parsed: parsedSheets,
        rawPythonOutput: rawPythonOutputs,
    };
}
