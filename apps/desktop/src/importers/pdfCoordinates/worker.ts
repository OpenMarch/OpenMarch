/*
  PDF parsing worker: extracts ParsedSheet[] off the main thread.
  Input message: { arrayBuffer: ArrayBuffer }
  Output message: { type: 'result', payload: { pages: number; parsed: any[] } } or { type: 'error', error: string }
*/

import { extractSheetsFromPage } from "./parsePage";
import { extractSheetsFromPageOCR } from "./ocr";

function countValidRows(sheets: any[]): number {
    if (!sheets || !sheets.length) return 0;
    let n = 0;
    for (const s of sheets)
        n += (s.rows || []).filter(
            (r: any) => r?.setId && Number.isFinite(r?.counts) && r.counts >= 0,
        ).length;
    return n;
}

export async function parsePdfArrayBuffer(arrayBuffer: ArrayBuffer) {
    const pdfjs = await import("pdfjs-dist");
    // best effort worker config
    try {
        const worker = new Worker(
            new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url),
            { type: "module" },
        );
        (pdfjs as any).GlobalWorkerOptions.workerPort = worker as any;
    } catch (err) {
        console.warn("pdf.worker.mjs not available; falling back");
    }
    const loadingTask = (pdfjs as any).getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const parsedSheets: any[] = [];
    for (let i = 0; i < pdf.numPages; i++) {
        const sheetsText = await extractSheetsFromPage(pdf, i);
        const validText = countValidRows(sheetsText);
        let sheetsBest = sheetsText;
        let chosen = "text";
        const sheetsOCR = await extractSheetsFromPageOCR(pdf, i);
        const validOCR = countValidRows(sheetsOCR);
        if (validOCR > validText) {
            sheetsBest = sheetsOCR;
            chosen = "ocr";
        }
        try {
            console.debug?.(
                `[pdf-import] page ${i + 1}: chosen=${chosen}, textValid=${validText}, ocrValid=${validOCR}`,
            );
        } catch (e) {
            /* console not available in worker in some contexts */
        }
        parsedSheets.push(...(sheetsBest as any));
    }
    return { pages: pdf.numPages, parsed: parsedSheets };
}

// Worker event listener (guarded)
// eslint-disable-next-line no-restricted-globals
(typeof self !== "undefined" ? self : globalThis).addEventListener(
    "message",
    async (evt: MessageEvent) => {
        const data = evt.data as { arrayBuffer?: ArrayBuffer };
        if (!data || !data.arrayBuffer) {
            // eslint-disable-next-line no-restricted-globals
            (typeof self !== "undefined" ? self : globalThis).postMessage({
                type: "error",
                error: "No ArrayBuffer provided",
            });
            return;
        }
        try {
            const result = await parsePdfArrayBuffer(data.arrayBuffer);
            // eslint-disable-next-line no-restricted-globals
            (typeof self !== "undefined" ? self : globalThis).postMessage({
                type: "result",
                payload: result,
            });
        } catch (e: any) {
            // eslint-disable-next-line no-restricted-globals
            (typeof self !== "undefined" ? self : globalThis).postMessage({
                type: "error",
                error: e?.message || String(e),
            });
        }
    },
);
