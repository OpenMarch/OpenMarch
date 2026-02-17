import type {
    ParsedRow,
    ParsedSheet,
    PerformerHeader,
    Quadrant,
} from "./types";
import { SET_ID_REGEX, START_SET_IDS } from "./types";
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
    type ColumnBand,
} from "./columns";
import { pywareProfile } from "./profile";
import { getQuadrantRects, rectContains } from "./segment";
import { detectSheetsHybrid } from "./segment-improved";

function quadrantLabel(index: number): Quadrant {
    return index === 0 ? "TL" : index === 1 ? "TR" : index === 2 ? "BL" : "BR";
}

function toItems(textContent: {
    items: Array<{
        str: string;
        transform: number[];
        width: number;
        height?: number;
    }>;
}): TextItem[] {
    const items = textContent.items;
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

function extractHeader(arr: TextItem[]): Partial<PerformerHeader> {
    const joined = arr.map((t) => t.str).join(" ");
    const header: Partial<PerformerHeader> = {};
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
            const parsed = processRegion(
                qRows,
                pageIndex,
                quadrantLabel(si),
                qItems,
            );
            if (parsed) sheets.push(parsed);
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
        const qItems = items.filter((it) => rectContains(rect, it.x, it.y));
        if (qItems.length < 10) continue;
        const qRows = bucketRows(qItems, 2);
        const parsed = processRegion(qRows, pageIndex, qk, qItems);
        if (parsed) sheets.push(parsed);
    }
    if (sheets.length > 0) return sheets;
    // Fallback: whole-page single region
    const rows = bucketRows(items, 2);
    const regions = segmentRowsByAnchors(rows);
    if (regions.length === 0) return [];
    const { start, end } = regions[0];
    const parsed = processRegion(
        rows.slice(start, end),
        pageIndex,
        "TL",
        items,
    );
    return parsed ? [parsed] : [];
}

/**
 * Shared row-parsing logic used by all extraction paths.
 * Accepts data rows + column bands, applies fallback if column mapping fails,
 * and accepts both numeric and word-based (Start/Opener) set IDs.
 * Optional getConf can be used by OCR to attach per-row confidence.
 */
export function parseDataRows(
    dataRows: TextItem[][],
    bands: ColumnBand[],
    getConf?: (row: TextItem[]) => number | undefined,
): ParsedRow[] {
    const out: ParsedRow[] = [];
    for (const r of dataRows) {
        let cols = mapRowToColumns(r, bands);
        const setIdValid = SET_ID_REGEX.test((cols.setId || "").trim());
        const countsValid = /^\d+$/.test((cols.counts || "").trim());
        const isStartRow = START_SET_IDS.test((cols.setId || "").trim());
        if (!setIdValid || (!countsValid && !isStartRow)) {
            const fallback = fallbackParseRowLeftToRight(r);
            if (fallback) cols = { ...fallback };
        }
        if (cols.lateralText && /^\s*0+\s+(?=Side\b)/i.test(cols.lateralText)) {
            cols.lateralText = cols.lateralText.replace(
                /^\s*0+\s+(?=Side\b)/i,
                "",
            );
        }
        const setId = cols.setId;
        if (!setId || !SET_ID_REGEX.test(setId.trim())) continue;
        const counts = parseInt((cols.counts || "").replace(/[^0-9]/g, ""), 10);
        const row: ParsedRow = {
            setId: setId.trim(),
            measureRange: (cols.measureRange || "").trim(),
            counts: Number.isFinite(counts) ? counts : 0,
            lateralText: (cols.lateralText || "").trim(),
            fbText: (cols.fbText || "").trim(),
            source: "text",
        };
        const conf = getConf?.(r);
        if (conf !== undefined) row.conf = conf;
        out.push(row);
    }
    return out;
}

function mapTableRows(rows: TextItem[][]) {
    const header = detectHeaderAndBands(rows);
    const dataRows = header ? rows.slice(header.headerIndex + 1) : rows;
    if (header) {
        let bands = header.bands;
        if (
            !bands.some((b) => b.key === "lateralText") ||
            !bands.some((b) => b.key === "fbText")
        ) {
            const inferred = inferBandsFromData(dataRows);
            if (inferred) bands = inferred;
        }
        return parseDataRows(dataRows, bands);
    }
    // No header detected — try positional parsing as last resort
    const out: ParsedRow[] = [];
    for (const r of dataRows) {
        const text = r.map((t) => t.str);
        const [setId, measureRange, countsRaw, ...rest] = text;
        if (!setId || !SET_ID_REGEX.test(setId.trim())) continue;
        const counts = parseInt((countsRaw || "").replace(/[^0-9]/g, ""), 10);
        const fbIndex = rest.findIndex((s) => /hash/i.test(s));
        const lateralText = (fbIndex >= 0 ? rest.slice(0, fbIndex) : rest).join(
            " ",
        );
        const fbText = fbIndex >= 0 ? rest.slice(fbIndex).join(" ") : "";
        out.push({
            setId: setId.trim(),
            measureRange: (measureRange || "").trim(),
            counts: Number.isFinite(counts) ? counts : 0,
            lateralText: lateralText.trim(),
            fbText: fbText.trim(),
            source: "text",
        });
    }
    return out;
}

/** Single shared path: segment → detect header/bands → parse → build ParsedSheet. */
function processRegion(
    qRows: TextItem[][],
    pageIndex: number,
    quadrant: Quadrant,
    itemsForRaw: TextItem[],
): ParsedSheet | null {
    const rawText = itemsForRaw.map((t) => t.str).join("\n");
    const qRegions = segmentRowsByAnchors(qRows);
    if (qRegions.length === 0) {
        const headers = detectAllHeaders(qRows) || [];
        const headerMeta = extractHeader(itemsForRaw);
        const parsedRows =
            headers.length === 0
                ? mapTableRows(qRows)
                : (() => {
                      const h = headers[0];
                      const subRows = qRows.slice(h.headerIndex + 1);
                      return mapTableRows([qRows[h.headerIndex], ...subRows]);
                  })();
        if (parsedRows.length === 0) return null;
        return {
            pageIndex,
            quadrant,
            header: headerMeta,
            rows: parsedRows,
            rawText,
        };
    }
    const { start, end } = qRegions[0];
    const regionRows = qRows.slice(start, end);
    const headerCut = detectHeaderAndBands(regionRows);
    const headerRowsForMeta = headerCut
        ? regionRows.slice(0, headerCut.headerIndex)
        : regionRows.slice(0, 3);
    const headerMeta = {
        ...extractHeader(headerRowsForMeta.flat()),
        ...extractHeaderFromRows(headerRowsForMeta),
    };
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
            clusterBandsByTokens(dataRows, 5) || inferBandsFromData(dataRows);
        if (clustered) bands = clustered;
    }
    const out = parseDataRows(dataRows, bands);
    if (out.length === 0) return null;
    return {
        pageIndex,
        quadrant,
        header: headerMeta,
        rows: out,
        rawText,
    };
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
