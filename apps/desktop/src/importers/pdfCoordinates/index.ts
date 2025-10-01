import type { NormalizedSheet } from "./types";
import type { ParsedSheet } from "./types";
import { extractSheetsFromPage } from "./parsePage";
import { normalizeSheets } from "./normalize";
import { reconcileSheets } from "./reconcile";
import { dryRunValidate } from "./dryRun";

export type ImportResult = {
    dryRun: ReturnType<typeof dryRunValidate>;
    pages: number;
    normalized: NormalizedSheet[];
    parsed: ParsedSheet[];
};

type FieldPropsLike = { xCheckpoints: any[]; yCheckpoints: any[] };

async function configurePdfWorker(pdfjs: any) {
    try {
        const worker = new Worker(
            // Vite-friendly worker URL
            new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url),
            { type: "module" },
        );
        (pdfjs as any).GlobalWorkerOptions.workerPort = worker as any;
        return;
    } catch (err) {
        // ignore and try next strategy
    }
    try {
        const worker = new Worker(
            new URL("pdfjs-dist/build/pdf.worker.js", import.meta.url),
            { type: "classic" },
        );
        (pdfjs as any).GlobalWorkerOptions.workerPort = worker as any;
        return;
    } catch (err) {
        // ignore and try next strategy
    }
    // Last resort: set workerSrc to URL string if bundler resolved it
    try {
        const url = new URL(
            "pdfjs-dist/build/pdf.worker.mjs",
            import.meta.url,
        ).toString();
        (pdfjs as any).GlobalWorkerOptions.workerSrc = url;
    } catch (err) {
        console.warn(
            "PDF.js worker could not be configured; loading may fail.",
        );
    }
}

export async function dryRunImportPdfCoordinates(
    arrayBuffer: ArrayBuffer,
    fieldProperties: FieldPropsLike,
): Promise<ImportResult> {
    // Try worker-based parsing first to avoid blocking the UI
    try {
        const WorkerCtor = await import("./worker?worker" as any);
        const ParserWorker: any =
            (WorkerCtor as any).default || (WorkerCtor as any);
        const worker: Worker = new ParserWorker();
        const result = await new Promise<{
            pages: number;
            parsed: ParsedSheet[];
        }>((resolve, reject) => {
            const handleMessage = (e: MessageEvent) => {
                const msg = e.data;
                if (msg?.type === "result") {
                    worker.removeEventListener("message", handleMessage as any);
                    worker.terminate();
                    resolve(msg.payload);
                } else if (msg?.type === "error") {
                    worker.removeEventListener("message", handleMessage as any);
                    worker.terminate();
                    reject(new Error(msg.error || "Worker error"));
                }
            };
            worker.addEventListener("message", handleMessage as any);
            worker.postMessage({ arrayBuffer }, [arrayBuffer as any]);
        });

        const reconciled = reconcileSheets(result.parsed as any);
        const normalized = normalizeSheets(
            reconciled as any,
            fieldProperties as any,
        );
        const dryRun = dryRunValidate(normalized);
        return {
            dryRun,
            pages: result.pages,
            normalized,
            parsed: result.parsed,
        };
    } catch (e) {
        // Fallback to in-thread parsing
        const pdfjs = await import("pdfjs-dist");
        await configurePdfWorker(pdfjs as any);
        const loadingTask = (pdfjs as any).getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const parsedSheets: ParsedSheet[] = [] as any[];
        for (let i = 0; i < pdf.numPages; i++) {
            const sheets = await extractSheetsFromPage(pdf, i);
            parsedSheets.push(...(sheets as any));
        }
        const reconciled = reconcileSheets(parsedSheets as any);
        const normalized = normalizeSheets(
            reconciled as any,
            fieldProperties as any,
        );
        const dryRun = dryRunValidate(normalized);
        return {
            dryRun,
            pages: pdf.numPages,
            normalized,
            parsed: parsedSheets,
        };
    }
}
