/*
  PDF parsing worker: loads PDF and returns page count.
  Input message: { arrayBuffer: ArrayBuffer }
  Output message: { type: 'result', payload: { pages: number; parsed: any[] } } or { type: 'error', error: string }
*/

// Note: OCR is handled in the main thread (not in worker) because it requires Electron API access
// This worker only loads the PDF to get the page count

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
    const startTime = Date.now();
    console.log(
        `[pdf-import-worker] Starting PDF parsing, buffer size: ${arrayBuffer.byteLength} bytes`,
    );

    try {
        console.log(`[pdf-import-worker] Loading pdfjs-dist...`);
        const pdfjs = await import("pdfjs-dist");
        const version = (pdfjs as any).version || "5.4.149";
        console.log(
            `[pdf-import-worker] pdfjs-dist loaded, version: ${version}`,
        );

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
            console.log(
                `[pdf-import-worker] Created blob URL for PDF.js worker from local file`,
            );
            (pdfjs as any).GlobalWorkerOptions.workerSrc = blobUrl;
            console.log(`[pdf-import-worker] Worker source configured`);
        } catch (e) {
            // Fallback: try URL import
            try {
                const workerModule = await import(
                    "pdfjs-dist/build/pdf.worker.min.mjs?url"
                );
                const workerUrl = workerModule.default;
                console.log(
                    `[pdf-import-worker] Setting worker source from URL: ${workerUrl}`,
                );
                (pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl;
                console.log(`[pdf-import-worker] Worker source configured`);
            } catch (urlError) {
                console.error(
                    `[pdf-import-worker] Failed to configure worker, using empty worker (will run in main thread):`,
                    urlError,
                );
                // Fallback: disable worker (will use main thread)
                (pdfjs as any).GlobalWorkerOptions.workerSrc = "";
            }
        }

        console.log(
            `[pdf-import-worker] Creating PDF document from arrayBuffer...`,
        );
        const loadingTask = (pdfjs as any).getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        console.log(
            `[pdf-import-worker] PDF loaded successfully, pages: ${pdf.numPages}`,
        );

        // Note: OCR processing happens in main thread (has Electron API access)
        // Worker only extracts text - OCR will be done in main thread after worker completes
        // For now, return empty array - OCR will be handled in main thread
        const parsedSheets: any[] = [];
        console.log(
            `[pdf-import-worker] Worker completed PDF loading. OCR will be processed in main thread.`,
        );

        const totalElapsed = Date.now() - startTime;
        console.log(
            `[pdf-import-worker] PDF parsing completed in ${totalElapsed}ms: ${pdf.numPages} pages, ${parsedSheets.length} total sheets`,
        );

        return { pages: pdf.numPages, parsed: parsedSheets };
    } catch (error: any) {
        const elapsed = Date.now() - startTime;
        console.error(
            `[pdf-import-worker] PDF parsing failed after ${elapsed}ms:`,
            error,
        );
        throw error;
    }
}

// Worker event listener (guarded)
// eslint-disable-next-line no-restricted-globals
(typeof self !== "undefined" ? self : globalThis).addEventListener(
    "message",
    async (evt: MessageEvent) => {
        console.log(`[pdf-import-worker] Received message event`);
        const data = evt.data as { arrayBuffer?: ArrayBuffer };
        if (!data || !data.arrayBuffer) {
            console.error(
                `[pdf-import-worker] No ArrayBuffer provided in message`,
            );
            // eslint-disable-next-line no-restricted-globals
            (typeof self !== "undefined" ? self : globalThis).postMessage({
                type: "error",
                error: "No ArrayBuffer provided",
            });
            return;
        }
        console.log(
            `[pdf-import-worker] ArrayBuffer received, size: ${data.arrayBuffer.byteLength} bytes`,
        );
        try {
            const result = await parsePdfArrayBuffer(data.arrayBuffer);
            console.log(
                `[pdf-import-worker] Parsing successful, sending result back to main thread`,
            );
            // eslint-disable-next-line no-restricted-globals
            (typeof self !== "undefined" ? self : globalThis).postMessage({
                type: "result",
                payload: result,
            });
        } catch (e: any) {
            console.error(`[pdf-import-worker] Parsing failed:`, e);
            // eslint-disable-next-line no-restricted-globals
            (typeof self !== "undefined" ? self : globalThis).postMessage({
                type: "error",
                error: e?.message || String(e),
            });
        }
    },
);
