import type { ParsedSheet } from "./types";
import {
    bucketRows,
    detectHeaderAndBands,
    detectAllHeaders,
    mapRowToColumns,
    inferBandsFromData,
    clusterBandsByTokens,
    fallbackParseRowLeftToRight,
    extractHeaderFromRows,
    type TextItem,
} from "./columns";
import { pywareProfile } from "./profile";
import { getQuadrantRects, rectContains } from "./segment";
import { detectSheetsHybrid } from "./segment-improved";

function toItems(textContent: any): TextItem[] {
    const items = textContent.items as Array<{
        str: string;
        transform: number[];
        width: number;
        height?: number;
    }>;
    return items.map((it) => {
        const [, , , d, e, f] = it.transform;
        return {
            str: it.str,
            x: e,
            y: f,
            w: it.width ?? 0,
            h: Math.abs(d) ?? 0,
        };
    });
}

function extractHeader(arr: TextItem[]) {
    const joined = arr.map((t) => t.str).join(" ");
    const header: any = {};
    const label = /Label\s*:\s*([A-Za-z]+\d*)/i.exec(joined)?.[1];
    if (label) header.label = label.trim();
    const symbol = /Symbol\s*:\s*([^\s]+)/i.exec(joined)?.[1];
    if (symbol) header.symbol = symbol.trim();
    const performer = /Performer\s*:\s*([^\n]+)/i.exec(joined)?.[1]?.trim();
    if (performer) header.performer = performer.trim();
    return header;
}

export async function extractSheetsFromPage(
    pdf: any,
    pageIndex: number,
): Promise<ParsedSheet[]> {
    const page = await pdf.getPage(pageIndex + 1);
    const textContent = await page.getTextContent();
    const items = toItems(textContent);
    if (items.length === 0) return [];

    // Use hybrid segmentation: semantic (anchors) + spatial (density)
    // This is more flexible than fixed quadrants and adapts to any layout
    const detectedSheets = detectSheetsHybrid(
        items,
        pywareProfile.pageHeaderAnchors,
    );

    const sheets: ParsedSheet[] = [];

    // If hybrid detection found sheets, use them (more flexible)
    if (detectedSheets.length > 0) {
        for (let si = 0; si < detectedSheets.length; si++) {
            const sheet = detectedSheets[si];
            const qItems = sheet.items;
            if (qItems.length < 10) continue;
            const qRows = bucketRows(qItems, 2);
            const qRegions = segmentRowsByAnchors(qRows);
            if (qRegions.length === 0) {
                // fallback to header-based segmentation in this quadrant
                const headers = detectAllHeaders(qRows) || [];
                const headerMeta = extractHeader(qItems);
                if (headers.length === 0) {
                    const parsedRows = mapTableRows(qRows);
                    if (parsedRows.length > 0)
                        sheets.push({
                            pageIndex,
                            quadrant: (si === 0
                                ? "TL"
                                : si === 1
                                  ? "TR"
                                  : si === 2
                                    ? "BL"
                                    : "BR") as any,
                            header: headerMeta,
                            rows: parsedRows,
                            rawText: qItems.map((t) => t.str).join("\n"),
                        });
                    continue;
                }
                const h = headers[0];
                const start = h.headerIndex + 1;
                const end = qRows.length;
                const subRows = qRows.slice(start, end);
                const parsedRows = mapTableRows([
                    qRows[h.headerIndex],
                    ...subRows,
                ]);
                if (parsedRows.length > 0)
                    sheets.push({
                        pageIndex,
                        quadrant: (si === 0
                            ? "TL"
                            : si === 1
                              ? "TR"
                              : si === 2
                                ? "BL"
                                : "BR") as any,
                        header: headerMeta,
                        rows: parsedRows,
                        rawText: qItems.map((t) => t.str).join("\n"),
                    });
                continue;
            }
            // Use first region within sheet
            const { start, end } = qRegions[0];
            const regionRows = qRows.slice(start, end);
            const headerCut = detectHeaderAndBands(regionRows);
            const headerRowsForMeta = headerCut
                ? regionRows.slice(0, headerCut.headerIndex)
                : regionRows.slice(0, 3);
            const headerMeta = {
                ...extractHeader(headerRowsForMeta.flat()),
                ...extractHeaderFromRows(headerRowsForMeta),
            } as any;
            const header = detectHeaderAndBands(regionRows);
            let dataRows = header
                ? regionRows.slice(header.headerIndex + 1)
                : regionRows;
            let bands = header
                ? header.bands
                : clusterBandsByTokens(dataRows, 5) ||
                  inferBandsFromData(dataRows) ||
                  [];
            const haveLateral = bands.some((b) => b.key === "lateralText");
            const haveFB = bands.some((b) => b.key === "fbText");
            if (!haveLateral || !haveFB) {
                const clustered =
                    clusterBandsByTokens(dataRows, 5) ||
                    inferBandsFromData(dataRows);
                if (clustered) bands = clustered;
            }
            const out: any[] = [];
            for (const r of dataRows) {
                let cols = mapRowToColumns(r, bands);
                if (
                    !cols.setId ||
                    !/^\d+[A-Za-z]?$/.test((cols.setId || "").trim()) ||
                    !cols.counts ||
                    !/^\d+$/.test((cols.counts || "").trim())
                ) {
                    const fallback = fallbackParseRowLeftToRight(r);
                    if (fallback) cols = { ...fallback } as any;
                }
                // Sanitize lateral prefix: drop a leading zero if present before 'Side'
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
                out.push({
                    setId: setId.trim(),
                    measureRange: (cols.measureRange || "").trim(),
                    counts: Number.isFinite(counts) ? counts : 0,
                    lateralText: (cols.lateralText || "").trim(),
                    fbText: (cols.fbText || "").trim(),
                    source: "text",
                });
            }
            if (out.length > 0)
                sheets.push({
                    pageIndex,
                    quadrant: (si === 0
                        ? "TL"
                        : si === 1
                          ? "TR"
                          : si === 2
                            ? "BL"
                            : "BR") as any,
                    header: headerMeta,
                    rows: out,
                    rawText: qItems.map((t) => t.str).join("\n"),
                });
        }
        if (sheets.length > 0) return sheets;
    }

    // Fallback: use fixed quadrants if hybrid didn't work
    const viewport = page.getViewport({ scale: 1 });
    const quads = getQuadrantRects(viewport.width, viewport.height, 8);
    const quadOrder: Array<keyof typeof quads> = ["TL", "TR", "BL", "BR"];
    for (let qi = 0; qi < quadOrder.length; qi++) {
        const qk = quadOrder[qi];
        const rect = quads[qk];
        const qItems = items.filter((it) =>
            rectContains(rect as any, it.x, it.y),
        );
        if (qItems.length < 10) continue;
        const qRows = bucketRows(qItems, 2);
        const qRegions = segmentRowsByAnchors(qRows);
        if (qRegions.length === 0) {
            // fallback to header-based segmentation in this quadrant
            const headers = detectAllHeaders(qRows) || [];
            const headerMeta = extractHeader(qItems);
            if (headers.length === 0) {
                const parsedRows = mapTableRows(qRows);
                if (parsedRows.length > 0)
                    sheets.push({
                        pageIndex,
                        quadrant: qk as any,
                        header: headerMeta,
                        rows: parsedRows,
                        rawText: qItems.map((t) => t.str).join("\n"),
                    });
                continue;
            }
            const h = headers[0];
            const start = h.headerIndex + 1;
            const end = qRows.length;
            const subRows = qRows.slice(start, end);
            const parsedRows = mapTableRows([qRows[h.headerIndex], ...subRows]);
            if (parsedRows.length > 0)
                sheets.push({
                    pageIndex,
                    quadrant: qk as any,
                    header: headerMeta,
                    rows: parsedRows,
                    rawText: qItems.map((t) => t.str).join("\n"),
                });
            continue;
        }
        // Use first region within quadrant
        const { start, end } = qRegions[0];
        const regionRows = qRows.slice(start, end);
        const headerCut = detectHeaderAndBands(regionRows);
        const headerRowsForMeta = headerCut
            ? regionRows.slice(0, headerCut.headerIndex)
            : regionRows.slice(0, 3);
        const headerMeta = {
            ...extractHeader(headerRowsForMeta.flat()),
            ...extractHeaderFromRows(headerRowsForMeta),
        } as any;
        const header = detectHeaderAndBands(regionRows);
        let dataRows = header
            ? regionRows.slice(header.headerIndex + 1)
            : regionRows;
        let bands = header
            ? header.bands
            : clusterBandsByTokens(dataRows, 5) ||
              inferBandsFromData(dataRows) ||
              [];
        const haveLateral = bands.some((b) => b.key === "lateralText");
        const haveFB = bands.some((b) => b.key === "fbText");
        if (!haveLateral || !haveFB) {
            const clustered =
                clusterBandsByTokens(dataRows, 5) ||
                inferBandsFromData(dataRows);
            if (clustered) bands = clustered;
        }
        const out: any[] = [];
        for (const r of dataRows) {
            let cols = mapRowToColumns(r, bands);
            if (
                !cols.setId ||
                !/^\d+[A-Za-z]?$/.test((cols.setId || "").trim()) ||
                !cols.counts ||
                !/^\d+$/.test((cols.counts || "").trim())
            ) {
                const fallback = fallbackParseRowLeftToRight(r);
                if (fallback) cols = { ...fallback } as any;
            }
            // Sanitize lateral prefix: drop a leading zero if present before 'Side'
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
            out.push({
                setId: setId.trim(),
                measureRange: (cols.measureRange || "").trim(),
                counts: Number.isFinite(counts) ? counts : 0,
                lateralText: (cols.lateralText || "").trim(),
                fbText: (cols.fbText || "").trim(),
                source: "text",
            });
        }
        if (out.length > 0)
            sheets.push({
                pageIndex,
                quadrant: qk as any,
                header: headerMeta,
                rows: out,
                rawText: qItems.map((t) => t.str).join("\n"),
            });
    }
    if (sheets.length > 0) return sheets;
    // Fallback: original whole-page logic
    const rows = bucketRows(items, 2);
    const regions = segmentRowsByAnchors(rows);
    if (regions.length === 0) return [];
    const { start, end } = regions[0];
    const parsed = mapTableRows(rows.slice(start, end));
    if (parsed.length === 0) return [];
    return [
        {
            pageIndex,
            quadrant: "TL" as any,
            header: extractHeader(items),
            rows: parsed,
            rawText: items.map((t) => t.str).join("\n"),
        },
    ];
}

function mapTableRows(rows: TextItem[][]) {
    const header = detectHeaderAndBands(rows);
    let dataRows = header ? rows.slice(header.headerIndex + 1) : rows;
    const out: any[] = [];
    if (header) {
        let bands = header.bands;
        const haveLateral = bands.some((b) => b.key === "lateralText");
        const haveFB = bands.some((b) => b.key === "fbText");
        if (!haveLateral || !haveFB) {
            const inferred = inferBandsFromData(dataRows);
            if (inferred) bands = inferred;
        }
        for (const r of dataRows) {
            let cols = mapRowToColumns(r, bands);
            if (
                !cols.setId ||
                !/^\d+[A-Za-z]?$/.test((cols.setId || "").trim()) ||
                !cols.counts ||
                !/^\d+$/.test((cols.counts || "").trim())
            ) {
                const fallback = fallbackParseRowLeftToRight(r);
                if (fallback) cols = { ...fallback } as any;
            }
            const setId = cols.setId;
            const countsRaw = cols.counts;
            if (!setId || !/^\d+[A-Za-z]?$/.test(setId.trim())) continue;
            const counts = parseInt(
                (countsRaw || "").replace(/[^0-9]/g, ""),
                10,
            );
            out.push({
                setId: setId.trim(),
                measureRange: (cols.measureRange || "").trim(),
                counts: Number.isFinite(counts) ? counts : 0,
                lateralText: (cols.lateralText || "").trim(),
                fbText: (cols.fbText || "").trim(),
                source: "text",
            });
        }
        return out;
    }
    for (const r of dataRows) {
        const text = r.map((t) => t.str);
        const [setId, measureRange, countsRaw, ...rest] = text;
        if (!setId || !/^\d+[A-Za-z]?$/.test(setId.trim())) continue;
        const counts = parseInt((countsRaw || "").replace(/[^0-9]/g, ""), 10);
        const lateralText = rest.join(" ");
        let fbText = "";
        const fbIndex = rest.findIndex((s) => /hash/i.test(s));
        if (fbIndex >= 0) fbText = rest.slice(fbIndex).join(" ");
        out.push({
            setId: setId?.trim(),
            measureRange: (measureRange || "").trim(),
            counts: Number.isFinite(counts) ? counts : 0,
            lateralText: lateralText.trim(),
            fbText: fbText.trim(),
            source: "text",
        });
    }
    return out;
}

function segmentRowsByAnchors(
    rows: TextItem[][],
): Array<{ start: number; end: number }> {
    const lc = (s: string) => s.toLowerCase();
    const headerAnchors = pywareProfile.pageHeaderAnchors;
    const footerAnchors = pywareProfile.footerAnchors;
    const starts: number[] = [];
    for (let i = 0; i < rows.length; i++) {
        const text = lc(rows[i].map((t) => t.str).join(" "));
        if (headerAnchors.some((a) => text.includes(a))) starts.push(i);
    }
    if (starts.length === 0) return [];
    const ranges: Array<{ start: number; end: number }> = [];
    for (let si = 0; si < starts.length; si++) {
        const start = starts[si];
        let end = rows.length;
        for (let j = start + 1; j < rows.length; j++) {
            const text = lc(rows[j].map((t) => t.str).join(" "));
            if (headerAnchors.some((a) => text.includes(a))) {
                end = j;
                break;
            }
            if (footerAnchors.some((a) => text.includes(a))) {
                end = j;
                break;
            }
        }
        ranges.push({ start, end });
        if (ranges.length >= pywareProfile.maxSheetsPerPage) break;
    }
    return ranges;
}
