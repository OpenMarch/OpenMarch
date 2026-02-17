import { SET_ID_REGEX, START_SET_IDS } from "./types";
import type { ColumnBand, TextItem } from "./columnTypes";

export type { ColumnBand, TextItem } from "./columnTypes";
export {
    detectAllHeaders,
    detectHeaderAndBands,
    extractHeaderFromRows,
} from "./headerDetection";

export function bucketRows(items: TextItem[], epsilon = 2): TextItem[][] {
    const rows: TextItem[][] = [];
    const sorted = [...items].sort((a, b) => b.y - a.y);
    for (const it of sorted) {
        let placed = false;
        for (const row of rows) {
            if (Math.abs(row[0].y - it.y) < epsilon) {
                row.push(it);
                placed = true;
                break;
            }
        }
        if (!placed) rows.push([it]);
    }
    return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

export function mapRowToColumns(
    row: TextItem[],
    bands: ColumnBand[],
): Record<ColumnBand["key"], string> {
    const acc: Record<ColumnBand["key"], string> = {
        setId: "",
        measureRange: "",
        counts: "",
        lateralText: "",
        fbText: "",
    };
    for (const it of row) {
        const center = it.x + (it.w || 0) / 2;
        const band = bands.find((b) => center >= b.x1 && center < b.x2);
        if (!band) continue;
        acc[band.key] = acc[band.key] ? `${acc[band.key]} ${it.str}` : it.str;
    }
    // trim
    for (const k of Object.keys(acc) as Array<keyof typeof acc>)
        acc[k] = (acc[k] || "").trim();
    return acc;
}

export function inferBandsFromData(
    rows: TextItem[][],
    expected = 5,
): ColumnBand[] | null {
    const candidates: number[] = [];
    const take = Math.min(rows.length, 10);
    for (let i = 0; i < take; i++) {
        for (const it of rows[i]) {
            const center = it.x + (it.w || 0) / 2;
            candidates.push(center);
        }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a - b);
    // Roughly pick quantile splits to get expected bands
    const uniqueCenters: number[] = [];
    for (const c of candidates) {
        if (
            uniqueCenters.length === 0 ||
            Math.abs(uniqueCenters[uniqueCenters.length - 1] - c) > 10
        ) {
            uniqueCenters.push(c);
        }
    }
    if (uniqueCenters.length < 3) return null;
    const centers =
        uniqueCenters.length >= expected
            ? uniqueCenters.slice(0, expected)
            : uniqueCenters;
    const bands: ColumnBand[] = [];
    for (let j = 0; j < centers.length; j++) {
        const left =
            j === 0 ? centers[j] - 50 : (centers[j - 1] + centers[j]) / 2;
        const right =
            j === centers.length - 1
                ? centers[j] + 500
                : (centers[j] + centers[j + 1]) / 2;
        bands.push({ key: "setId", label: "", x1: left, x2: right });
    }
    // Assign keys by order: setId, measureRange, counts, lateral, fb
    const order: ColumnBand["key"][] = [
        "setId",
        "measureRange",
        "counts",
        "lateralText",
        "fbText",
    ];
    bands.forEach((b, idx) => (b.key = order[Math.min(idx, order.length - 1)]));
    return bands;
}

function isNumericToken(s: string): boolean {
    return /^\d+(?:\.\d+)?$/.test(s.trim());
}

function looksLikeSetId(s: string): boolean {
    return SET_ID_REGEX.test(s.trim());
}

function looksLikeMeasure(s: string): boolean {
    const t = s.trim();
    return t === "0" || /\d+\s*-\s*\d+/.test(t) || /^\d+$/.test(t);
}

function looksLikeLateral(s: string): boolean {
    const lc = s.toLowerCase();
    return /(yd|yard|ln|line|inside|outside|on)/.test(lc);
}

function looksLikeFB(s: string): boolean {
    const lc = s.toLowerCase();
    return /(front|back|hash|behind|in front of)/.test(lc);
}

export function clusterBandsByTokens(
    rows: TextItem[][],
    k = 5,
): ColumnBand[] | null {
    // Collect tokens from the first N data rows (skip possible header line)
    const startIndex = 0;
    const sampleRows = rows.slice(startIndex, Math.min(rows.length, 15));
    const tokens = sampleRows.flat();
    if (tokens.length === 0) return null;
    const xs = tokens.map((t) => t.x + (t.w || 0) / 2);
    // Initialize k centers by quantiles
    const sorted = [...xs].sort((a, b) => a - b);
    const centers: number[] = [];
    for (let i = 0; i < k; i++) {
        const idx = Math.floor((i / (k - 1)) * (sorted.length - 1));
        centers.push(sorted[idx]);
    }
    // K-means 1D
    for (let iter = 0; iter < 8; iter++) {
        const sums = new Array(k).fill(0);
        const counts = new Array(k).fill(0);
        tokens.forEach((t) => {
            const cx = t.x + (t.w || 0) / 2;
            let best = 0;
            let bestDist = Infinity;
            for (let j = 0; j < k; j++) {
                const d = Math.abs(cx - centers[j]);
                if (d < bestDist) {
                    bestDist = d;
                    best = j;
                }
            }
            sums[best] += cx;
            counts[best] += 1;
        });
        for (let j = 0; j < k; j++) {
            if (counts[j] > 0) centers[j] = sums[j] / counts[j];
        }
    }
    // Build clusters
    const clusterToTokens: TextItem[][] = Array.from({ length: k }, () => []);
    tokens.forEach((t) => {
        const cx = t.x + (t.w || 0) / 2;
        let best = 0;
        let bestDist = Infinity;
        for (let j = 0; j < k; j++) {
            const d = Math.abs(cx - centers[j]);
            if (d < bestDist) {
                bestDist = d;
                best = j;
            }
        }
        clusterToTokens[best].push(t);
    });
    // Sort clusters by center X
    const clusters = centers.map((x, idx) => ({ x, idx }));
    clusters.sort((a, b) => a.x - b.x);
    const bands: ColumnBand[] = [];
    for (let i = 0; i < clusters.length; i++) {
        const j = clusters[i].idx;
        const left =
            i === 0
                ? clusters[i].x - 50
                : (clusters[i - 1].x + clusters[i].x) / 2;
        const right =
            i === clusters.length - 1
                ? clusters[i].x + 500
                : (clusters[i].x + clusters[i + 1].x) / 2;
        bands.push({ key: "setId", label: "", x1: left, x2: right });
    }
    // Score clusters by token content to assign roles
    const scores = clusters.map(({ idx }) => {
        const clusterTokens = clusterToTokens[idx];
        const total = Math.max(1, clusterTokens.length);
        const numOnly =
            clusterTokens.filter((t) => isNumericToken(t.str)).length / total;
        const setLike =
            clusterTokens.filter((t) => looksLikeSetId(t.str)).length / total;
        const measureLike =
            clusterTokens.filter((t) => looksLikeMeasure(t.str)).length / total;
        const latLike =
            clusterTokens.filter((t) => looksLikeLateral(t.str)).length / total;
        const fbLike =
            clusterTokens.filter((t) => looksLikeFB(t.str)).length / total;
        return { idx, numOnly, setLike, measureLike, latLike, fbLike };
    });
    // Assign using heuristics
    const bySet = [...scores].sort((a, b) => b.setLike - a.setLike);
    const byNum = [...scores].sort((a, b) => b.numOnly - a.numOnly);
    const byMeasure = [...scores].sort((a, b) => b.measureLike - a.measureLike);
    const assigned: Record<number, ColumnBand["key"]> = {};
    if (bySet[0]) assigned[bySet[0].idx] = "setId";
    if (byNum[0] && !assigned[byNum[0].idx]) assigned[byNum[0].idx] = "counts";
    if (byMeasure[0] && !assigned[byMeasure[0].idx])
        assigned[byMeasure[0].idx] = "measureRange";
    // Remaining two rightmost clusters → lateral, fb by order
    const remaining = clusters.map((c) => c.idx).filter((j) => !assigned[j]);
    remaining.sort((a, b) => centers[a] - centers[b]);
    if (remaining.length >= 1) assigned[remaining[0]] = "lateralText";
    if (remaining.length >= 2) assigned[remaining[1]] = "fbText";
    // Apply
    for (let i = 0; i < clusters.length; i++) {
        const idx = clusters[i].idx;
        const key: ColumnBand["key"] =
            assigned[idx] ||
            (i >= clusters.length - 2
                ? i === clusters.length - 2
                    ? "lateralText"
                    : "fbText"
                : i === 0
                  ? "setId"
                  : i === 1
                    ? "measureRange"
                    : "counts");
        bands[i] = { ...bands[i], key };
    }
    return bands;
}

export function fallbackParseRowLeftToRight(
    row: TextItem[],
): Record<ColumnBand["key"], string> | null {
    const tokens = row.map((t) => (t.str || "").trim()).filter(Boolean);
    if (tokens.length === 0) return null;
    let setId = "";
    let measureRange = "";
    let counts = "";
    let setIdx = -1;
    let measureIdx = -1;
    let countsIdx = -1;
    for (let i = 0; i < tokens.length; i++) {
        const tk = tokens[i];
        if (!setId && looksLikeSetId(tk)) {
            setId = tk;
            setIdx = i;
            continue;
        }
        if (setId && !measureRange && looksLikeMeasure(tk)) {
            measureRange = tk;
            measureIdx = i;
            continue;
        }
        if (setId && measureRange && !counts && /^\d+$/.test(tk)) {
            counts = tk;
            countsIdx = i;
            break;
        }
    }
    if (!setId) return null;
    const startAfter =
        countsIdx >= 0
            ? countsIdx + 1
            : measureIdx >= 0
              ? measureIdx + 1
              : setIdx >= 0
                ? setIdx + 1
                : 0;
    let rest = tokens.slice(Math.max(startAfter, 0));
    if (!measureRange) measureRange = "";
    if (!counts && rest.length && /^\d+$/.test(rest[0])) {
        counts = rest[0];
        rest = rest.slice(1);
    }
    if (!counts) counts = "0";
    if (rest.length === 0)
        return {
            setId,
            measureRange,
            counts,
            lateralText: "",
            fbText: "",
        };
    // Split where FB keywords begin (do NOT split on 'Side')
    let split = rest.findIndex((t) => /(front|back|hash)/i.test(t));
    if (split < 0) split = Math.floor(rest.length / 2);
    // Trim stray leading numbers mistakenly grouped into lateral
    let latTokens = rest.slice(0, split);
    while (latTokens.length && /^\d+/.test(latTokens[0])) {
        latTokens.shift();
    }
    const lateralText = latTokens.join(" ").trim();
    const fbText = rest.slice(split).join(" ").trim();
    return { setId, measureRange, counts, lateralText, fbText };
}
