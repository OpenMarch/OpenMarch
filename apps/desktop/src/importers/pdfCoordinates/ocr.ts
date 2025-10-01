import type { ParsedSheet } from "./types";
import { defaultImportConfig } from "../../config/importOptions";
import {
    bucketRows,
    detectAllHeaders,
    mapRowToColumns,
    inferBandsFromData,
    clusterBandsByTokens,
    fallbackParseRowLeftToRight,
    extractHeaderFromRows,
} from "./columns";
import { pywareProfile } from "./profile";

let ocrUnavailable: boolean = false;

async function getTesseractWorker() {
    if (ocrUnavailable) return null as any;
    try {
        const spec = "tesseract.js";
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const { createWorker } = await import(/* @vite-ignore */ spec as any);
        return createWorker;
    } catch {
        ocrUnavailable = true;
        return null as any;
    }
}

// Minimal OCR extractor scaffold. Attempts to OCR a rasterized page using tesseract.js if available.
// Returns an empty array if OCR is unavailable or fails.

export async function extractSheetsFromPageOCR(
    pdf: any,
    pageIndex: number,
): Promise<ParsedSheet[]> {
    try {
        // Respect config: allow disabling OCR entirely
        if (!defaultImportConfig.ocr.enabled) return [];

        // Dynamically import tesseract.js at runtime without Vite pre-bundling.
        // If it's not installed, the import will throw and we fall back to [] gracefully.
        const createWorker = await getTesseractWorker();
        if (!createWorker) return [];

        const page = await pdf.getPage(pageIndex + 1);
        const dpi = defaultImportConfig.ocr.dpi;
        const scale = Math.max(1, dpi / 72);
        const viewport = page.getViewport({ scale });
        const canvas = new OffscreenCanvas(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height),
        );
        const ctx = canvas.getContext("2d");
        if (!ctx) return [];
        // Render PDF page to offscreen canvas
        // pdf.js expects a canvas-like context with putImageData; OffscreenCanvas 2D works
        await page.render({ canvasContext: ctx as any, viewport }).promise;

        const blob = await canvas.convertToBlob({ type: "image/png" });
        const worker = await createWorker({ logger: () => {} });
        await worker.loadLanguage("eng");
        await worker.initialize("eng");
        const { data } = await worker.recognize(blob, { rotateAuto: true });
        await worker.terminate();
        // Build text items from recognized words with approximate positions
        const words = (data.words || []) as Array<any>;
        const toLower = (s: string) => (s || "").toLowerCase();
        if (!words.length) return [];
        const items = words.map((w) => ({
            str: (w.text || "").trim(),
            x: Number(w.bbox?.x0 || 0),
            y: Number(w.bbox?.y0 || 0),
            w: Number((w.bbox?.x1 || 0) - (w.bbox?.x0 || 0)),
            h: Number((w.bbox?.y1 || 0) - (w.bbox?.y0 || 0)),
            conf:
                typeof w.confidence === "number"
                    ? Math.max(0, Math.min(1, w.confidence / 100))
                    : undefined,
        }));
        const rows = bucketRows(items as any, 3);
        // Anchor-based sheet segmentation (Performer..., Printed..., Page ... of ...)
        const headerAnchors = pywareProfile.pageHeaderAnchors;
        const footerAnchors = pywareProfile.footerAnchors;
        const starts: number[] = [];
        for (let i = 0; i < rows.length; i++) {
            const text = toLower(
                (rows[i] as any[]).map((t) => t.str).join(" "),
            );
            if (headerAnchors.some((a) => text.includes(a))) starts.push(i);
        }
        const regions: Array<{ start: number; end: number }> = [];
        for (let si = 0; si < starts.length; si++) {
            const start = starts[si];
            let end = rows.length;
            for (let j = start + 1; j < rows.length; j++) {
                const text = toLower(
                    (rows[j] as any[]).map((t) => t.str).join(" "),
                );
                if (headerAnchors.some((a) => text.includes(a))) {
                    end = j;
                    break;
                }
                if (footerAnchors.some((a) => text.includes(a))) {
                    end = j;
                    break;
                }
            }
            regions.push({ start, end });
            if (regions.length >= pywareProfile.maxSheetsPerPage) break;
        }
        let sheets: ParsedSheet[] = [];
        if (regions.length === 0) {
            // fallback to header-based segmentation
            const hdrs = detectAllHeaders(rows as any) || [];
            for (
                let hi = 0;
                hi < Math.min(hdrs.length, pywareProfile.maxSheetsPerPage);
                hi++
            ) {
                const h = hdrs[hi];
                const start = h.headerIndex + 1;
                const end =
                    hi + 1 < hdrs.length
                        ? hdrs[hi + 1].headerIndex
                        : rows.length;
                const subRows = rows.slice(start, end);
                const headerMeta = extractHeaderFromRows(subRows as any);
                let bands = h.bands;
                const haveLateral = bands.some((b) => b.key === "lateralText");
                const haveFB = bands.some((b) => b.key === "fbText");
                if (!haveLateral || !haveFB)
                    bands =
                        clusterBandsByTokens(subRows as any, 5) ||
                        inferBandsFromData(subRows as any) ||
                        bands;
                const out: any[] = [];
                for (const r of subRows) {
                    let cols = mapRowToColumns(r as any, bands);
                    if (
                        !cols.setId ||
                        !/^\d+[A-Za-z]?$/.test((cols.setId || "").trim()) ||
                        !cols.counts ||
                        !/^\d+$/.test((cols.counts || "").trim())
                    ) {
                        const fallback = fallbackParseRowLeftToRight(r as any);
                        if (fallback) cols = { ...fallback } as any;
                    }
                    const setId = cols.setId;
                    const countsRaw = cols.counts;
                    if (!setId || !/^\d+[A-Za-z]?$/.test(setId.trim()))
                        continue;
                    const counts = parseInt(
                        (countsRaw || "").replace(/[^0-9]/g, ""),
                        10,
                    );
                    const rowConfs = (r as any[])
                        .map((t) => t.conf)
                        .filter((n) => typeof n === "number");
                    const conf = rowConfs.length
                        ? rowConfs.reduce((a, b) => a + b, 0) / rowConfs.length
                        : 1;
                    out.push({
                        setId: setId.trim(),
                        measureRange: (cols.measureRange || "").trim(),
                        counts: Number.isFinite(counts) ? counts : 0,
                        lateralText: (cols.lateralText || "").trim(),
                        fbText: (cols.fbText || "").trim(),
                        source: "ocr",
                        conf,
                    });
                }
                if (out.length > 0)
                    sheets.push({
                        pageIndex,
                        quadrant: (hi === 0
                            ? "TL"
                            : hi === 1
                              ? "TR"
                              : hi === 2
                                ? "BL"
                                : "BR") as any,
                        header: headerMeta as any,
                        rows: out,
                        rawText: data.text,
                    });
            }
            return sheets;
        }
        // Use anchor regions
        for (let ri = 0; ri < regions.length; ri++) {
            const { start, end } = regions[ri];
            const subRows = rows.slice(start, end);
            const headerLine = detectAllHeaders(subRows as any)[0];
            const headerRowsForMeta = headerLine
                ? (subRows as any[]).slice(0, headerLine.headerIndex)
                : (subRows as any[]).slice(0, 3);
            const headerMeta = extractHeaderFromRows(headerRowsForMeta as any);
            let bands = headerLine
                ? headerLine.bands
                : clusterBandsByTokens(subRows as any, 5) ||
                  inferBandsFromData(subRows as any) ||
                  [];
            const haveLateral = bands.some((b) => b.key === "lateralText");
            const haveFB = bands.some((b) => b.key === "fbText");
            if (!haveLateral || !haveFB)
                bands =
                    clusterBandsByTokens(subRows as any, 5) ||
                    inferBandsFromData(subRows as any) ||
                    bands;
            const out: any[] = [];
            for (const r of subRows) {
                let cols = mapRowToColumns(r as any, bands);
                if (
                    !cols.setId ||
                    !/^\d+[A-Za-z]?$/.test((cols.setId || "").trim()) ||
                    !cols.counts ||
                    !/^\d+$/.test((cols.counts || "").trim())
                ) {
                    const fallback = fallbackParseRowLeftToRight(r as any);
                    if (fallback) cols = { ...fallback } as any;
                }
                if (
                    cols.lateralText &&
                    /^\s*0+\s+(?=Side\b)/i.test(cols.lateralText)
                ) {
                    cols.lateralText = cols.lateralText.replace(
                        /^\s*0+\s+(?=Side\b)/i,
                        "",
                    );
                }
                if (
                    cols.lateralText &&
                    /^\s*0+\s+(?=Side\b)/i.test(cols.lateralText)
                ) {
                    cols.lateralText = cols.lateralText.replace(
                        /^\s*0+\s+(?=Side\b)/i,
                        "",
                    );
                }
                const setId = cols.setId;
                const countsRaw = cols.counts;
                if (!setId || !/^\d+[A-Za-z]?$/.test(setId.trim())) continue;
                const counts = parseInt(
                    (countsRaw || "").replace(/[^0-9]/g, ""),
                    10,
                );
                const rowConfs = (r as any[])
                    .map((t) => t.conf)
                    .filter((n) => typeof n === "number");
                const conf = rowConfs.length
                    ? rowConfs.reduce((a, b) => a + b, 0) / rowConfs.length
                    : 1;
                out.push({
                    setId: setId.trim(),
                    measureRange: (cols.measureRange || "").trim(),
                    counts: Number.isFinite(counts) ? counts : 0,
                    lateralText: (cols.lateralText || "").trim(),
                    fbText: (cols.fbText || "").trim(),
                    source: "ocr",
                    conf,
                });
            }
            if (out.length > 0)
                sheets.push({
                    pageIndex,
                    quadrant: (ri === 0
                        ? "TL"
                        : ri === 1
                          ? "TR"
                          : ri === 2
                            ? "BL"
                            : "BR") as any,
                    header: headerMeta as any,
                    rows: out,
                    rawText: data.text,
                });
        }
        return sheets;
    } catch {
        return [];
    }
}
