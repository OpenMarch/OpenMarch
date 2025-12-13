export type TextItem = {
    str: string;
    x: number;
    y: number;
    w: number;
    h: number;
};

export type ColumnBand = {
    key: "setId" | "measureRange" | "counts" | "lateralText" | "fbText";
    label: string;
    x1: number;
    x2: number;
};

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

const headerNeedles = {
    setId: [/^set$/, /^set\s*#?$/],
    measureRange: [/^measures?$/, /^meas\.?$/, /^mvmt$/],
    counts: [/^counts?$/, /^cts\.?$/],
    lateralText: [
        /^side to side$/,
        /^side\s*[-/]?\s*to\s*side$/,
        /^lateral$/,
        /^left\/right$/,
        /^departure$/,
        // Pyware variant
        /^side\s*1.*side\s*2$/,
    ],
    fbText: [
        /^front to back$/,
        /^front\s*[-/]?\s*to\s*back$/,
        /^front back$/,
        /^depth$/,
        /^front\/back$/,
        /^front.*back$/,
    ],
};

export function detectHeaderAndBands(
    rows: TextItem[][],
): { headerIndex: number; bands: ColumnBand[] } | null {
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
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
        // Require at least 2 header labels if one is Set or Counts, otherwise 3
        const uniqueKeys = Array.from(new Set(hits.map((h) => h.key)));
        const hasCritical =
            uniqueKeys.includes("setId") || uniqueKeys.includes("counts");
        const threshold = hasCritical ? 2 : 3;

        if (uniqueKeys.length >= threshold) {
            // sort by x and build bands
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
                        ? centers[j].x - 100 // increased margin
                        : (centers[j - 1].x + centers[j].x) / 2;
                const right =
                    j === centers.length - 1
                        ? centers[j].x + 600 // increased margin
                        : (centers[j].x + centers[j + 1].x) / 2;
                bands.push({
                    key: centers[j].key,
                    label: centers[j].label,
                    x1: left,
                    x2: right,
                });
            }
            // Ensure we include optional measureRange if missing by inferring between setId and counts
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
            // Sort by x
            bands.sort((a, b) => a.x1 - b.x1);
            const haveLateral = bands.some((b) => b.key === "lateralText");
            const haveFB = bands.some((b) => b.key === "fbText");

            if (haveLateral && !haveFB) {
                // We have lateral but missing FB. Assume FB is to the right of Lateral if Lateral is the last band.
                const latBand = bands.find((b) => b.key === "lateralText")!;
                const latIndex = bands.indexOf(latBand);
                if (latIndex === bands.length - 1) {
                    // Lateral is the rightmost detected band.
                    // It likely swallowed the FB column space because of the generous right margin.
                    // Split it.
                    const originalX2 = latBand.x2;
                    // Heuristic: Lateral column usually ~250px wide? Shrink existing band.
                    const newX2 = latBand.x1 + 350;
                    latBand.x2 = newX2;

                    bands.push({
                        key: "fbText",
                        label: "Front-Back (Inferred)",
                        x1: newX2,
                        x2: originalX2,
                    });
                }
            } else if (!haveLateral && !haveFB) {
                // Only if BOTH are missing do we fallback to overwriting the last two
                const rightMost = [...bands]
                    .sort((a, b) => a.x1 - b.x1)
                    .slice(-2);
                if (rightMost.length === 2) {
                    // Assign deterministically: X (lateral) then Y (front-back)
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
            // Skip ahead to avoid detecting the same header again on adjacent rows
            i = i + maybe.headerIndex;
        }
    }
    // Ensure headers are strictly increasing and de-duplicated by index
    const seen = new Set<number>();
    return headers.filter((h) => {
        if (seen.has(h.headerIndex)) return false;
        seen.add(h.headerIndex);
        return true;
    });
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
    } as any;
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
    return /^\d+[A-Za-z]?$/.test(s.trim());
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
        (bands[i] as any).key =
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
        } as any;
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
    return { setId, measureRange, counts, lateralText, fbText } as any;
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
    const result: any = {};
    if (performer && performer !== "(unnamed)") result.performer = performer;
    if (symbol) result.symbol = symbol.toUpperCase();
    if (label && label !== "(unlabeled)") result.label = label.toUpperCase();
    if (id) result.id = id;
    if (filename) result.filename = filename;
    return result;
}
