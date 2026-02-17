/**
 * Header detection and metadata extraction for drill chart rows.
 * Separated from columns.ts so column mapping and band inference stay focused.
 */

import type { ColumnBand, TextItem } from "./columnTypes";

function normalizeToken(s: string): string {
    return s
        .replace(/[^a-z0-9]+/gi, " ")
        .trim()
        .toLowerCase();
}

function isHeaderToken(text: string, needle: string | RegExp): boolean {
    const norm = normalizeToken(text);
    if (typeof needle === "string") return norm === normalizeToken(needle);
    return needle.test(norm);
}

// Pyware lets users customize all terminology. These needles cover
// every known default + common alternative so we recognize column headers
// regardless of which labels are configured.
const headerNeedles = {
    setId: [/^set$/, /^set\s*#?$/],
    measureRange: [/^measures?$/, /^meas\.?$/, /^mvmt$/],
    counts: [/^counts?$/, /^cts\.?$/],
    lateralText: [
        /^side\s*[-/]?\s*to\s*side$/,
        /^lateral$/,
        /^left\s*[-/]?\s*right$/,
        /^departure$/,
        /^side\s*1.*side\s*2$/,
        /^[ab]\s*[-/]\s*[ab]$/,
        /^1\s*[-/]\s*2$/,
    ],
    fbText: [
        /^front\s*[-/]?\s*(?:to\s*)?back$/,
        /^depth$/,
        /^home\s*[-/]?\s*visitor$/,
        /^top\s*[-/]?\s*bottom$/,
        /^bottom\s*[-/]?\s*top$/,
    ],
};

/**
 * Split compound header tokens that pdfjs merges into separate virtual
 * items so each can match its own needle. Handles patterns like:
 *   "CountsSide 1-Side 2" → "Counts" + "Side 1-Side 2"
 *   "Counts 1-2"          → "Counts" + "1-2" (lateral shorthand)
 *   "Counts A-B"          → "Counts" + "A-B"
 */
function expandHeaderItems(row: TextItem[]): TextItem[] {
    const out: TextItem[] = [];
    for (const it of row) {
        const s = it.str.trim();
        // "CountsSide 1-Side 2" — no space between Counts and Side
        const m1 = /^(counts?)(side\s.+)$/i.exec(s);
        // "Counts 1-2", "Counts A-B" — space between Counts and lateral shorthand
        const m2 = !m1 && /^(counts?)\s+([ab1-2]\s*[-–]\s*[ab1-2].*)$/i.exec(s);
        const m = m1 || m2;
        if (m) {
            // Place the lateral virtual header far enough right that
            // the midpoint boundary won't eat narrow counts data.
            // Use 70% of the width for the counts portion because
            // the actual count values are left-aligned in a narrow column,
            // while the lateral text begins further right.
            const countsWidth = (it.w || 0) * 0.7;
            out.push({ ...it, str: m[1], w: countsWidth });
            out.push({
                ...it,
                str: m2 ? mapLateralShorthand(m[2]) : m[2],
                x: it.x + countsWidth,
                w: (it.w || 0) - countsWidth,
            });
        } else {
            out.push(it);
        }
    }
    return out;
}

/** Map shorthand lateral labels like "1-2" or "A-B" to recognizable forms. */
function mapLateralShorthand(s: string): string {
    if (/^1\s*[-–]\s*2$/i.test(s.trim())) return "Side 1-Side 2";
    if (/^[aA]\s*[-–]\s*[bB]$/i.test(s.trim())) return "A-B";
    return s;
}

export function detectHeaderAndBands(
    rows: TextItem[][],
): { headerIndex: number; bands: ColumnBand[] } | null {
    for (let i = 0; i < rows.length; i++) {
        const row = expandHeaderItems(rows[i]);
        const hits: { key: ColumnBand["key"]; label: string; x: number }[] = [];
        for (const it of row) {
            for (const key of Object.keys(headerNeedles) as Array<
                ColumnBand["key"]
            >) {
                for (const rx of headerNeedles[key]) {
                    if (isHeaderToken(it.str, rx)) {
                        hits.push({ key, label: it.str, x: it.x });
                        break;
                    }
                }
            }
        }
        const uniqueKeys = Array.from(new Set(hits.map((h) => h.key)));
        const hasCritical =
            uniqueKeys.includes("setId") || uniqueKeys.includes("counts");
        const threshold = hasCritical ? 2 : 3;

        if (uniqueKeys.length >= threshold) {
            const ordered = hits.sort((a, b) => a.x - b.x);
            const centers = ordered.map((h) => ({
                key: h.key,
                label: h.label,
                x: h.x,
            }));
            const bands: ColumnBand[] = [];
            for (let j = 0; j < centers.length; j++) {
                const left =
                    j === 0
                        ? centers[j].x - 100
                        : (centers[j - 1].x + centers[j].x) / 2;
                const right =
                    j === centers.length - 1
                        ? centers[j].x + 600
                        : (centers[j].x + centers[j + 1].x) / 2;
                bands.push({
                    key: centers[j].key,
                    label: centers[j].label,
                    x1: left,
                    x2: right,
                });
            }
            const haveMeasure = bands.some((b) => b.key === "measureRange");
            if (!haveMeasure) {
                const setBand = bands.find((b) => b.key === "setId");
                const countsBand = bands.find((b) => b.key === "counts");
                if (setBand && countsBand) {
                    bands.push({
                        key: "measureRange",
                        label: "Measures",
                        x1: setBand.x2,
                        x2: countsBand.x1,
                    });
                }
            }
            bands.sort((a, b) => a.x1 - b.x1);
            const haveLateral = bands.some((b) => b.key === "lateralText");
            const haveFB = bands.some((b) => b.key === "fbText");

            if (haveLateral && !haveFB) {
                // Have lateral but not FB → split lateral's right portion
                const latBand = bands.find((b) => b.key === "lateralText")!;
                const latIndex = bands.indexOf(latBand);
                if (latIndex === bands.length - 1) {
                    const originalX2 = latBand.x2;
                    const newX2 = latBand.x1 + 350;
                    latBand.x2 = newX2;
                    bands.push({
                        key: "fbText",
                        label: "Front-Back (Inferred)",
                        x1: newX2,
                        x2: originalX2,
                    });
                }
            } else if (!haveLateral && haveFB) {
                // Have FB but not lateral → insert lateral band in the gap
                // before the FB band. This happens when the lateral column
                // header is unrecognized (e.g. custom Pyware terminology).
                const fbBand = bands.find((b) => b.key === "fbText")!;
                const priorBand = [...bands]
                    .filter((b) => b.x2 <= fbBand.x1 + 1)
                    .sort((a, b) => b.x2 - a.x2)[0];
                if (priorBand) {
                    const midpoint =
                        priorBand.x2 + (fbBand.x1 - priorBand.x2) * 0.4;
                    bands.push({
                        key: "lateralText",
                        label: "Lateral (Inferred)",
                        x1: midpoint,
                        x2: fbBand.x1,
                    });
                    priorBand.x2 = midpoint;
                    bands.sort((a, b) => a.x1 - b.x1);
                }
            } else if (!haveLateral && !haveFB) {
                // Neither → assign the two rightmost bands
                const rightMost = [...bands]
                    .sort((a, b) => a.x1 - b.x1)
                    .slice(-2);
                if (rightMost.length === 2) {
                    const [xBand, yBand] = rightMost;
                    xBand.key = "lateralText";
                    yBand.key = "fbText";
                }
            }
            return { headerIndex: i, bands };
        }
    }
    return null;
}

export function detectAllHeaders(
    rows: TextItem[][],
): Array<{ headerIndex: number; bands: ColumnBand[] }> {
    const headers: Array<{ headerIndex: number; bands: ColumnBand[] }> = [];
    for (let i = 0; i < rows.length; i++) {
        const maybe = detectHeaderAndBands(rows.slice(i));
        if (maybe) {
            headers.push({
                headerIndex: i + maybe.headerIndex,
                bands: maybe.bands,
            });
            i = i + maybe.headerIndex;
        }
    }
    const seen = new Set<number>();
    return headers.filter((h) => {
        if (seen.has(h.headerIndex)) return false;
        seen.add(h.headerIndex);
        return true;
    });
}

export function extractHeaderFromRows(rows: TextItem[][]): {
    performer?: string;
    symbol?: string;
    label?: string;
    id?: string;
    filename?: string;
} {
    const upperRows = rows.slice(0, 6);
    const text = upperRows.map((r) => r.map((t) => t.str).join(" ")).join("\n");
    const lc = text.toLowerCase();
    const getBetween = (start: RegExp, end: RegExp): string | undefined => {
        const s = start.exec(lc);
        if (!s) return undefined;
        const from = s.index + s[0].length;
        const m = end.exec(lc.slice(from));
        const raw = lc.slice(from, m ? from + m.index : lc.length);
        return raw.replace(/\s+/g, " ").trim();
    };
    const performer = getBetween(
        /performer:\s*/i,
        /symbol:\s*|label:\s*|id:\s*|\n/i,
    );
    const symbol = getBetween(/symbol:\s*/i, /label:\s*|id:\s*|\n/i);
    const label = getBetween(/label:\s*/i, /id:\s*|\n/i);
    const id = getBetween(/id:\s*/i, /\n|\s[a-z]/i);
    const filenameMatch = /\b[^\s]+\.(?:3dj|3dz)\b/i.exec(text);
    const filename = filenameMatch ? filenameMatch[0] : undefined;
    const result: {
        performer?: string;
        symbol?: string;
        label?: string;
        id?: string;
        filename?: string;
    } = {};
    if (performer && performer !== "(unnamed)") result.performer = performer;
    if (symbol) result.symbol = symbol.toUpperCase();
    if (label && label !== "(unlabeled)") result.label = label.toUpperCase();
    if (id) result.id = id;
    if (filename) result.filename = filename;
    return result;
}
