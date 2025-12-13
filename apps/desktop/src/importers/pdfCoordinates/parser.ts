import type { ParsedSheet, ParsedRow } from "./types";
import { defaultImportConfig } from "../../config/importOptions";

export async function extractSheetsFromPageParser(
    pdf: any,
    pageIndex: number,
): Promise<{ sheets: ParsedSheet[]; rawPythonOutput: any }> {
    const api = (window as any).electron;
    if (!api?.ocr?.runCoordinateParser) {
        throw new Error("Electron API for Coordinate Parser not available");
    }

    // Get PDF as ArrayBuffer
    const pdfData = await pdf.getData();
    const arrayBuffer = pdfData.buffer.slice(
        pdfData.byteOffset,
        pdfData.byteOffset + pdfData.byteLength,
    );

    try {
        const result = await api.ocr.runCoordinateParser(
            arrayBuffer,
            pageIndex,
            defaultImportConfig.ocr.dpi,
        );

        if (!result || !result.sheets) {
            return { sheets: [], rawPythonOutput: result };
        }

        const source = result.debug?.text_source || "text";

        const sheets = result.sheets.map((sheet: any) => {
            const rows: ParsedRow[] = sheet.sets.map((s: any) => ({
                setId: s.set_id,
                measureRange: s.measure_range,
                counts: s.counts || 0,
                lateralText: sanitizeLateralText(s.side_text),
                fbText: s.fb_text,
                source: source,
                conf: 1.0,
            }));

            return {
                pageIndex: pageIndex,
                quadrant: "TL", // Defaulting to TL as sheets are already stitched
                header: {
                    label: sheet.performer_label,
                    performer: sheet.performer_name || sheet.performer_label,
                },
                rows: rows,
                rawText: "",
            };
        });

        return { sheets, rawPythonOutput: result };
    } catch (error: any) {
        const errorMessage = error?.message || String(error);
        if (
            errorMessage.includes("No module named") ||
            errorMessage.includes("ImportError")
        ) {
            throw new Error(
                `${errorMessage}. Please install Python dependencies: pip3 install pymupdf numpy`,
            );
        }

        throw error;
    }
}

function sanitizeLateralText(text: string): string {
    if (!text) return "";
    // Regex to find "Side X" patterns
    // Handles multiple naming conventions:
    // - Side A = Side 1, Side B = Side 2
    // - Left = Side 1, Right = Side 2
    // - S1 = Side 1, S2 = Side 2
    // Capture the side indication to preserve it for detection
    const sideRegex =
        /(?:^|\s)(s1|side\s*1|side\s*a\b|side\s*a:|left|s2|side\s*2|side\s*b\b|side\s*b:|right)(?:\b|$)/i;
    const match = text.match(sideRegex);

    if (match) {
        const sideStr = match[1]; // e.g. "Side 1"
        // Remove all occurrences from the string to allow coordinate regex to match
        // "2.0 steps inside Side 1 50 yd ln" -> "2.0 steps inside 50 yd ln"
        const cleaned = text
            .replace(new RegExp(sideRegex, "gi"), " ")
            .replace(/\s+/g, " ")
            .trim();
        // Append at end so detectSide() still finds it
        return `${cleaned} ${sideStr}`;
    }
    return text;
}
