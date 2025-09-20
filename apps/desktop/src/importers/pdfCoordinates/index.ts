import type { NormalizedSheet } from "./types";
import { extractSheetsFromPage } from "./parsePage";
import { normalizeSheets } from "./normalize";
import { dryRunValidate } from "./dryRun";

export type ImportResult = {
	dryRun: ReturnType<typeof dryRunValidate>;
	pages: number;
	normalized: NormalizedSheet[];
};

type FieldPropsLike = { xCheckpoints: any[]; yCheckpoints: any[] };

async function configurePdfWorker(pdfjs: any) {
	try {
		const worker = new Worker(
			// Vite-friendly worker URL
			new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url),
			{ type: "module" },
		);
		pdfjs.GlobalWorkerOptions.workerPort = worker as any;
		return;
	} catch {}
	try {
		const worker = new Worker(
			new URL("pdfjs-dist/build/pdf.worker.js", import.meta.url),
			{ type: "classic" },
		);
		pdfjs.GlobalWorkerOptions.workerPort = worker as any;
		return;
	} catch {}
	// Last resort: set workerSrc to URL string if bundler resolved it
	try {
		const url = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
		(pdfjs as any).GlobalWorkerOptions.workerSrc = url;
	} catch {
		console.warn("PDF.js worker could not be configured; loading may fail.");
	}
}

export async function dryRunImportPdfCoordinates(
	arrayBuffer: ArrayBuffer,
	fieldProperties: FieldPropsLike,
): Promise<ImportResult> {
	const pdfjs = await import("pdfjs-dist");
	await configurePdfWorker(pdfjs as any);

	const loadingTask = (pdfjs as any).getDocument({ data: arrayBuffer });
	const pdf = await loadingTask.promise;

	const parsedSheets = [] as any[];
	for (let i = 0; i < pdf.numPages; i++) {
		const sheets = await extractSheetsFromPage(pdf, i);
		parsedSheets.push(...sheets);
	}

	const normalized = normalizeSheets(parsedSheets as any, fieldProperties as any);
	const dryRun = dryRunValidate(normalized);
	return { dryRun, pages: pdf.numPages, normalized };
}
