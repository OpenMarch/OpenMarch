import type { ParsedSheet, ParsedRow } from "./types";
import { QuadrantSchema } from "./types";
import { getQuadrantRects, rectContains } from "./segment";

// Lazy import to avoid bundler issues if not used
async function loadPdf() {
	const pdfjs = await import("pdfjs-dist");
	return pdfjs;
}

type TextItem = { str: string; x: number; y: number; w: number; h: number };

function toItems(textContent: any): TextItem[] {
	const items = textContent.items as Array<{ str: string; transform: number[]; width: number; height?: number }>;
	return items.map((it) => {
		const [a, b, c, d, e, f] = it.transform;
		return { str: it.str, x: e, y: f, w: it.width ?? 0, h: Math.abs(d) ?? 0 };
	});
}

function hasHeader(arr: TextItem[]) {
	const hay = arr.map((t) => t.str).join(" ").toLowerCase();
	return hay.includes("performer:") || hay.includes("label:") || hay.includes("symbol:");
}

function extractHeader(arr: TextItem[]) {
	const joined = arr.map((t) => t.str).join(" ");
	const header: any = {};
	const label = /Label\s*:\s*([A-Za-z]+\d+)/i.exec(joined)?.[1];
	if (label) header.label = label.trim();
	const symbol = /Symbol\s*:\s*([^\s]+)/i.exec(joined)?.[1];
	if (symbol) header.symbol = symbol.trim();
	const performer = /Performer\s*:\s*([^\n]+)/i.exec(joined)?.[1]?.trim();
	if (performer) header.performer = performer.replace(/\s+Eastside.*$/i, "").trim();
	return header;
}

function nearestBucket(items: TextItem[], epsilon = 2) {
	// Group by y (rows)
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

function mapTableRows(rows: TextItem[][]): ParsedRow[] {
	// Heuristic: find the header row containing column names
	const headerIdx = rows.findIndex((r) => r.map((t) => t.str.toLowerCase()).join(" ").includes("front-back"));
	if (headerIdx === -1) return [];
	const dataRows = rows.slice(headerIdx + 1);

	// Columns appear in order: Set | Measure | Counts | Side 1-Side 2 | Front-Back
	const parsed: ParsedRow[] = [];
	for (const r of dataRows) {
		const text = r.map((t) => t.str);
		if (text.length < 3) continue;
		const joined = text.join(" ");
		// Basic guards: first token looks like setId
		const setId = text[0]?.trim();
		if (!setId || !/^\d+[A-Z]?$/.test(setId)) continue;
		// counts will be a number somewhere near third cell
		const countsIdx = Math.min(2, text.length - 1);
		const counts = parseInt(text[countsIdx].replace(/[^0-9]/g, ""), 10);
		if (!Number.isFinite(counts)) continue;
		// crude split for lateral/front-back by scanning for "hash" or "yd ln"
		const lateralStart = countsIdx + 1;
		const lateralText = text.slice(lateralStart).join(" ");
		const fbMatch = /([\d\.]+\s+steps\s+(?:in front of|behind)|On)\s+(?:Front|Back)\s+Hash/i;
		const fbIdx = r.findIndex((t) => /hash/i.test(t.str));
		let fbText = "";
		let lat = lateralText;
		if (fbIdx >= 0) {
			const fbSlice = text.slice(fbIdx - lateralStart);
			fbText = fbSlice.join(" ");
			lat = text.slice(lateralStart, fbIdx - lateralStart + lateralStart).join(" ");
		}
		parsed.push({
			setId,
			measureRange: text[1] || "",
			counts: counts,
			lateralText: lat.trim(),
			fbText: (fbText || "").trim(),
		});
	}
	return parsed;
}

export async function extractSheetsFromPage(
	pdf: any,
	pageIndex: number,
): Promise<ParsedSheet[]> {
	const page = await pdf.getPage(pageIndex + 1);
	const viewport = page.getViewport({ scale: 1.0 });
	const rects = getQuadrantRects(viewport.width, viewport.height);
	const textContent = await page.getTextContent();
	const allItems = toItems(textContent);

	const buckets: Record<"TL" | "TR" | "BL" | "BR", TextItem[]> = {
		TL: [],
		TR: [],
		BL: [],
		BR: [],
	};

	for (const it of allItems) {
		for (const q of QuadrantSchema.options) {
			const r = (rects as any)[q];
			if (rectContains(r, it.x, it.y)) {
				buckets[q].push(it);
				break;
			}
		}
	}

	const results: ParsedSheet[] = [];
	for (const quadrant of QuadrantSchema.options) {
		const items = buckets[quadrant];
		if (items.length === 0 || !hasHeader(items)) continue;
		const rows = nearestBucket(items, 2);
		const header = extractHeader(items);
		const parsedRows = mapTableRows(rows);
		results.push({
			pageIndex,
			quadrant: quadrant as any,
			header,
			rows: parsedRows,
			rawText: items.map((t) => t.str).join("\n"),
		});
	}
	return results;
}
