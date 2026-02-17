import type { ParsedSheet } from "./types";
import { defaultImportConfig } from "../../config/importOptions";
import {
    bucketRows,
    detectAllHeaders,
    inferBandsFromData,
    clusterBandsByTokens,
    extractHeaderFromRows,
    type TextItem,
} from "./columns";
import { parseDataRows } from "./parsePage";
import { pywareProfile } from "./profile";
import { detectSheetsHybrid } from "./segment-improved";

function quadrantLabel(index: number): "TL" | "TR" | "BL" | "BR" {
    return index === 0 ? "TL" : index === 1 ? "TR" : index === 2 ? "BL" : "BR";
}

function avgConf(row: Array<{ conf?: number }>): number {
    const nums = row
        .map((t) => t.conf)
        .filter((n): n is number => typeof n === "number");
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 1;
}

// High-performance OCR extractor using Python EasyOCR.
// Returns an empty array if OCR is unavailable or fails.

let pythonOCRAvailable: boolean | null = null;

async function checkPythonOCR(): Promise<boolean> {
    if (pythonOCRAvailable !== null) return pythonOCRAvailable;
    try {
        const api = (window as any).electron;
        if (!api?.ocr) {
            console.warn("[ocr] Electron API not available or OCR not exposed");
            pythonOCRAvailable = false;
            return false;
        }
        const result = await api.ocr.checkPython();
        pythonOCRAvailable = result === true;
        console.log(`[ocr] Python OCR available: ${pythonOCRAvailable}`);
        return pythonOCRAvailable;
    } catch (error) {
        console.error("[ocr] Error checking Python OCR:", error);
        pythonOCRAvailable = false;
        return false;
    }
}

async function tryPythonOCR(
    pdf: any,
    pageIndex: number,
): Promise<ParsedSheet[] | null> {
    try {
        const api = (window as any).electron;
        if (!api?.ocr) {
            console.warn("[ocr] Electron API not available or OCR not exposed");
            return null;
        }

        // Get PDF as ArrayBuffer
        const pdfData = await pdf.getData();
        const arrayBuffer = pdfData.buffer.slice(
            pdfData.byteOffset,
            pdfData.byteOffset + pdfData.byteLength,
        );

        console.log(
            `[ocr] Running Python OCR for page ${pageIndex}, PDF size: ${arrayBuffer.byteLength} bytes`,
        );

        // Run Python OCR
        const result = await api.ocr.runPython(
            arrayBuffer,
            pageIndex,
            defaultImportConfig.ocr.dpi,
        );

        console.log(
            `[ocr] Python OCR result for page ${pageIndex}: ${result?.words?.length || 0} words`,
        );

        if (!result?.words || result.words.length === 0) {
            console.warn(
                `[ocr] Python OCR returned no words for page ${pageIndex}`,
            );
            return null;
        }

        // Convert Python OCR result to internal format
        const items: OCRItem[] = result.words.map(
            (w: {
                str?: string;
                x?: number;
                y?: number;
                w?: number;
                h?: number;
                conf?: number;
            }) => ({
                str: w.str || "",
                x: w.x || 0,
                y: w.y || 0,
                w: w.w || 0,
                h: w.h || 0,
                conf: w.conf !== undefined ? w.conf : 1.0,
            }),
        );

        // Continue with existing parsing logic
        // EasyOCR may return phrases; bucketRows groups by Y coordinate
        // Epsilon of 3 pixels works well for drill chart row detection
        const rows = bucketRows(items, 3);
        console.log(
            `[ocr] Processed ${items.length} OCR items into ${rows.length} rows for page ${pageIndex}`,
        );
        // ... rest of parsing logic will be reused below
        const sheets = processOCRItems(items, rows, pageIndex);
        console.log(
            `[ocr] Generated ${sheets.length} sheets from OCR for page ${pageIndex}`,
        );
        return sheets;
    } catch (error: any) {
        console.error(`[ocr] Python OCR failed for page ${pageIndex}:`, error);
        // Re-throw with better context if it's a missing dependency error
        const errorMessage = error?.message || String(error);
        if (
            errorMessage.includes("Missing dependency") ||
            errorMessage.includes("No module named")
        ) {
            throw new Error(
                `${errorMessage}. Please install Python dependencies: pip3 install easyocr pdf2image pillow pymupdf numpy`,
            );
        }
        if (
            errorMessage.includes("poppler") ||
            errorMessage.includes("Unable to get page count")
        ) {
            throw new Error(
                `${errorMessage}. Please install poppler: macOS: brew install poppler | Linux: sudo apt-get install poppler-utils | Windows: Download from https://github.com/oschwartz10612/poppler-windows/releases`,
            );
        }
        // For other errors, return null to let the caller handle it
        return null;
    }
}

type OCRItem = TextItem & { conf?: number };

function processOCRItems(
    items: OCRItem[],
    rows: OCRItem[][],
    pageIndex: number,
): ParsedSheet[] {
    console.log(
        `[ocr-debug] Processing items for page ${pageIndex}: ${items.length} items, ${rows.length} rows`,
    );

    // Use hybrid segmentation: semantic (anchors) + spatial (density)
    // This is more flexible than fixed quadrants and adapts to any layout
    const headerAnchors = pywareProfile.pageHeaderAnchors;

    // Try hybrid detection first (best of both worlds)
    const detectedSheets = detectSheetsHybrid(items, headerAnchors);
    console.log(
        `[ocr-debug] Hybrid detection found ${detectedSheets.length} sheets`,
    );

    // Convert detected sheets to row-based regions
    const regions: Array<{ start: number; end: number }> = [];

    if (detectedSheets.length > 0) {
        // Map detected sheet items back to row indices
        // Use string-based comparison since objects won't match by reference
        for (const sheet of detectedSheets) {
            const sheetItemKeys = new Set(
                sheet.items.map((item) => `${item.x},${item.y},${item.str}`),
            );
            let start = -1;
            let end = -1;

            for (let i = 0; i < rows.length; i++) {
                const rowItems = rows[i];
                const hasItems = rowItems.some((item) =>
                    sheetItemKeys.has(`${item.x},${item.y},${item.str}`),
                );

                if (hasItems) {
                    if (start === -1) start = i;
                    end = i + 1;
                }
            }

            if (start !== -1 && end > start) {
                regions.push({ start, end });
            }
        }
    }
    console.log(`[ocr-debug] Converted to ${regions.length} row regions`);

    // Fallback to anchor-based if hybrid didn't find sheets
    if (regions.length === 0) {
        console.log(
            `[ocr-debug] No hybrid regions, trying fallback anchor detection`,
        );
        const toLower = (s: string) => (s || "").toLowerCase();
        const footerAnchors = pywareProfile.footerAnchors;
        const starts: number[] = [];
        for (let i = 0; i < rows.length; i++) {
            const text = toLower(rows[i].map((t) => t.str).join(" "));
            if (headerAnchors.some((a) => text.includes(a))) starts.push(i);
        }
        for (let si = 0; si < starts.length; si++) {
            const start = starts[si];
            let end = rows.length;
            for (let j = start + 1; j < rows.length; j++) {
                const text = toLower(rows[j].map((t) => t.str).join(" "));
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
        console.log(
            `[ocr-debug] Fallback anchor detection found ${regions.length} regions`,
        );
    }

    let sheets: ParsedSheet[] = [];
    if (regions.length === 0) {
        console.log(
            `[ocr-debug] No regions found, falling back to full-page header detection`,
        );
        const hdrs = detectAllHeaders(rows as TextItem[][]) || [];
        console.log(
            `[ocr-debug] detectAllHeaders found ${hdrs.length} headers`,
        );
        for (
            let hi = 0;
            hi < Math.min(hdrs.length, pywareProfile.maxSheetsPerPage);
            hi++
        ) {
            const h = hdrs[hi];
            const start = h.headerIndex + 1;
            const end =
                hi + 1 < hdrs.length ? hdrs[hi + 1].headerIndex : rows.length;
            const subRows = rows.slice(start, end) as TextItem[][];
            const headerMeta = extractHeaderFromRows(subRows);
            let bands = h.bands;
            const haveLateral = bands.some((b) => b.key === "lateralText");
            const haveFB = bands.some((b) => b.key === "fbText");
            if (!haveLateral || !haveFB)
                bands =
                    clusterBandsByTokens(subRows, 5) ||
                    inferBandsFromData(subRows) ||
                    bands;
            console.log(
                `[ocr-debug] Processing header region ${hi}, rows: ${subRows.length}, bands: ${bands.length}`,
            );
            const out = parseDataRows(subRows, bands, (r) =>
                avgConf(r as Array<{ conf?: number }>),
            ).map((row) => ({ ...row, source: "ocr" as const }));
            console.log(
                `[ocr-debug] Region ${hi} produced ${out.length} valid rows`,
            );
            if (out.length > 0)
                sheets.push({
                    pageIndex,
                    quadrant: quadrantLabel(hi),
                    header: headerMeta,
                    rows: out,
                    rawText: items.map((t) => t.str).join("\n"),
                });
        }
        return sheets;
    }
    // Use anchor regions
    for (let ri = 0; ri < regions.length; ri++) {
        const { start, end } = regions[ri];
        const subRows = rows.slice(start, end) as TextItem[][];
        console.log(
            `[ocr-debug] Processing region ${ri}, rows ${start}-${end} (${subRows.length} rows)`,
        );
        const headerLine = detectAllHeaders(subRows)[0];
        console.log(
            `[ocr-debug] Header detection in region ${ri}: ${headerLine ? "Found" : "Not Found"}`,
        );
        const headerRowsForMeta = headerLine
            ? subRows.slice(0, headerLine.headerIndex)
            : subRows.slice(0, 3);
        const headerMeta = extractHeaderFromRows(headerRowsForMeta);
        let bands = headerLine
            ? headerLine.bands
            : clusterBandsByTokens(subRows, 5) ||
              inferBandsFromData(subRows) ||
              [];
        const haveLateral = bands.some((b) => b.key === "lateralText");
        const haveFB = bands.some((b) => b.key === "fbText");
        if (!haveLateral || !haveFB)
            bands =
                clusterBandsByTokens(subRows, 5) ||
                inferBandsFromData(subRows) ||
                bands;
        const dataRows = headerLine
            ? subRows.slice(headerLine.headerIndex + 1)
            : subRows;
        const out = parseDataRows(dataRows, bands, (r) =>
            avgConf(r as Array<{ conf?: number }>),
        ).map((row) => ({ ...row, source: "ocr" as const }));
        console.log(
            `[ocr-debug] Region ${ri} produced ${out.length} valid rows`,
        );
        if (out.length > 0)
            sheets.push({
                pageIndex,
                quadrant: quadrantLabel(ri),
                header: headerMeta,
                rows: out,
                rawText: items.map((t) => t.str).join("\n"),
            });
    }
    return sheets;
}

export async function extractSheetsFromPageOCR(
    pdf: any,
    pageIndex: number,
): Promise<ParsedSheet[]> {
    // OCR is required - throw errors instead of silently failing
    if (!defaultImportConfig.ocr.enabled) {
        throw new Error(
            `OCR is disabled in config. OCR is required for PDF import.`,
        );
    }

    // Use Python OCR (requires Python 3 + EasyOCR installed)
    const pythonAvailable = await checkPythonOCR();
    if (!pythonAvailable) {
        throw new Error(
            `Python OCR not available for page ${pageIndex}. Install Python 3 and run: pip3 install -r apps/desktop/scripts/requirements.txt`,
        );
    }

    console.log(`[ocr] Attempting Python OCR for page ${pageIndex}...`);
    try {
        const pythonResult = await tryPythonOCR(pdf, pageIndex);
        if (pythonResult && pythonResult.length > 0) {
            console.log(
                `[ocr] Successfully extracted ${pythonResult.length} sheets from page ${pageIndex} using Python OCR`,
            );
            return pythonResult;
        }

        throw new Error(
            `Python OCR returned no sheets for page ${pageIndex}. The PDF may not contain readable text, or OCR processing failed.`,
        );
    } catch (error: any) {
        // If it's already a well-formed error (e.g., from tryPythonOCR), re-throw it
        const errorMessage = error?.message || String(error);
        if (
            errorMessage.includes("Missing dependency") ||
            errorMessage.includes("No module named")
        ) {
            throw new Error(
                `${errorMessage}. Please install Python dependencies by running: cd apps/desktop/scripts && pip3 install -r requirements.txt`,
            );
        }
        // Re-throw the original error
        throw error;
    }
}
