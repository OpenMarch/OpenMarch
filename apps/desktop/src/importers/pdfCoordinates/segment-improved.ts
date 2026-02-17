import type { TextItem } from "./columns";

/**
 * Improved segmentation methods that don't rely on fixed coordinates.
 * Uses density-based clustering, gap detection, and visual analysis.
 */

/**
 * Detect sheets using density-based clustering (DBSCAN-like approach).
 * Groups text items by spatial density rather than fixed quadrants.
 */
export function detectSheetsByDensity(
    items: TextItem[],
    minItemsPerSheet = 10,
    epsilon = 50, // Max distance between items in same cluster
): Array<{
    items: TextItem[];
    bounds: { x: number; y: number; width: number; height: number };
}> {
    if (items.length === 0) return [];

    const sheets: Array<{ items: TextItem[]; bounds: any }> = [];
    const visited = new Set<number>();

    for (let i = 0; i < items.length; i++) {
        if (visited.has(i)) continue;

        // Start new cluster
        const cluster: TextItem[] = [items[i]];
        visited.add(i);
        const queue = [i];

        // Expand cluster using spatial proximity
        while (queue.length > 0) {
            const currentIdx = queue.shift()!;
            const current = items[currentIdx];

            for (let j = 0; j < items.length; j++) {
                if (visited.has(j)) continue;

                const other = items[j];
                const dx = Math.abs(current.x - other.x);
                const dy = Math.abs(current.y - other.y);
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance <= epsilon) {
                    cluster.push(other);
                    visited.add(j);
                    queue.push(j);
                }
            }
        }

        // Only keep clusters with enough items
        if (cluster.length >= minItemsPerSheet) {
            const bounds = calculateBounds(cluster);
            sheets.push({ items: cluster, bounds });
        }
    }

    // Sort by Y position (top to bottom)
    sheets.sort((a, b) => a.bounds.y - b.bounds.y);
    return sheets;
}

/**
 * Detect sheets by finding large gaps (whitespace) between text regions.
 * More robust than fixed quadrants - adapts to actual layout.
 */
export function detectSheetsByGaps(
    items: TextItem[],
    minGapHeight = 30, // Minimum vertical gap to split sheets
): Array<{
    items: TextItem[];
    bounds: { x: number; y: number; width: number; height: number };
}> {
    if (items.length === 0) return [];

    // Sort items by Y position
    const sorted = [...items].sort((a, b) => a.y - b.y);

    const sheets: Array<{ items: TextItem[]; bounds: any }> = [];
    let currentSheet: TextItem[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];

        // Calculate gap between items
        const prevBottom = prev.y + (prev.h || 0);
        const gap = curr.y - prevBottom;

        if (gap > minGapHeight) {
            // Large gap detected - start new sheet
            if (currentSheet.length > 0) {
                sheets.push({
                    items: currentSheet,
                    bounds: calculateBounds(currentSheet),
                });
            }
            currentSheet = [curr];
        } else {
            currentSheet.push(curr);
        }
    }

    // Add last sheet
    if (currentSheet.length > 0) {
        sheets.push({
            items: currentSheet,
            bounds: calculateBounds(currentSheet),
        });
    }

    return sheets;
}

/**
 * Detect sheets using horizontal and vertical separators (lines, borders).
 * Looks for visual boundaries in the layout.
 */
export function detectSheetsBySeparators(
    items: TextItem[],
    pageWidth: number,
    pageHeight: number,
): Array<{
    items: TextItem[];
    bounds: { x: number; y: number; width: number; height: number };
}> {
    // Group items by horizontal bands (potential rows)
    const rows = groupIntoRows(items, 5); // 5px tolerance for row detection

    // Find vertical gaps that might indicate column separators
    const verticalGaps = findVerticalGaps(items, pageWidth, 20); // 20px min gap

    // Find horizontal gaps that might indicate sheet separators
    const horizontalGaps = findHorizontalGaps(rows, pageHeight, 30); // 30px min gap

    // Split sheets at horizontal gaps
    const sheets: Array<{ items: TextItem[]; bounds: any }> = [];
    let currentY = 0;

    for (const gapY of horizontalGaps) {
        const sheetItems = items.filter(
            (it) => it.y >= currentY && it.y < gapY,
        );
        if (sheetItems.length > 0) {
            sheets.push({
                items: sheetItems,
                bounds: calculateBounds(sheetItems),
            });
        }
        currentY = gapY;
    }

    // Add remaining items
    const remainingItems = items.filter((it) => it.y >= currentY);
    if (remainingItems.length > 0) {
        sheets.push({
            items: remainingItems,
            bounds: calculateBounds(remainingItems),
        });
    }

    return sheets;
}

/**
 * Hybrid approach: Combine anchor detection with density clustering.
 * Best of both worlds - semantic (anchors) + spatial (density).
 */
export function detectSheetsHybrid(
    items: TextItem[],
    headerAnchors: string[],
): Array<{
    items: TextItem[];
    bounds: { x: number; y: number; width: number; height: number };
}> {
    // First, find anchor points (semantic)
    const rows = groupIntoRows(items, 3);
    const anchorRows: number[] = [];

    for (let i = 0; i < rows.length; i++) {
        const rowText = rows[i].map((it) => it.str.toLowerCase()).join(" ");
        if (
            headerAnchors.some((anchor) =>
                rowText.includes(anchor.toLowerCase()),
            )
        ) {
            anchorRows.push(i);
        }
    }

    // If we found anchors, use them to segment
    if (anchorRows.length > 0) {
        const sheets: Array<{ items: TextItem[]; bounds: any }> = [];
        for (let i = 0; i < anchorRows.length; i++) {
            const startRow = anchorRows[i];
            const endRow =
                i + 1 < anchorRows.length ? anchorRows[i + 1] : rows.length;
            const sheetItems = rows.slice(startRow, endRow).flat();
            if (sheetItems.length === 0) continue;

            // Check for side-by-side performers by looking for a
            // large horizontal gap in the anchor row's items.
            const split = findVerticalSplit(sheetItems);
            if (split !== null) {
                const left = sheetItems.filter(
                    (it) => it.x + (it.w || 0) / 2 < split,
                );
                const right = sheetItems.filter(
                    (it) => it.x + (it.w || 0) / 2 >= split,
                );
                if (left.length >= 10)
                    sheets.push({ items: left, bounds: calculateBounds(left) });
                if (right.length >= 10)
                    sheets.push({
                        items: right,
                        bounds: calculateBounds(right),
                    });
            } else {
                sheets.push({
                    items: sheetItems,
                    bounds: calculateBounds(sheetItems),
                });
            }
        }
        return sheets;
    }

    // Fallback to density-based if no anchors found
    return detectSheetsByDensity(items);
}

/**
 * Detect whether items span two side-by-side performer columns.
 * Looks for multiple "Performer:" tokens on the same row and splits at
 * the midpoint of the gap between the two performer groups.
 * Returns the x split point, or null if no clear split exists.
 */
function findVerticalSplit(items: TextItem[]): number | null {
    if (items.length < 20) return null;

    const rows = groupIntoRows(items, 3);
    if (rows.length === 0) return null;

    // Look for exactly two "Performer:" items on the same row
    for (const row of rows.slice(0, 3)) {
        const performers = row.filter((it) =>
            /^performer\s*:/i.test(it.str.trim()),
        );
        if (performers.length < 2) continue;

        performers.sort((a, b) => a.x - b.x);
        // Find all items between the two performer headers on this row
        const leftPerf = performers[0];
        const rightPerf = performers[performers.length - 1];

        // The left group ends where items stop before the right performer
        const leftItems = row.filter((it) => it.x + (it.w || 0) < rightPerf.x);
        const leftMax = Math.max(...leftItems.map((it) => it.x + (it.w || 0)));
        return (leftMax + rightPerf.x) / 2;
    }

    return null;
}

// Helper functions

function calculateBounds(items: TextItem[]): {
    x: number;
    y: number;
    width: number;
    height: number;
} {
    if (items.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const item of items) {
        minX = Math.min(minX, item.x);
        minY = Math.min(minY, item.y);
        maxX = Math.max(maxX, item.x + (item.w || 0));
        maxY = Math.max(maxY, item.y + (item.h || 0));
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

function groupIntoRows(items: TextItem[], epsilon = 3): TextItem[][] {
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

function findVerticalGaps(
    items: TextItem[],
    pageWidth: number,
    minGap: number,
): number[] {
    // Analyze X positions to find vertical separators
    const xPositions = items.map((it) => it.x).sort((a, b) => a - b);
    const gaps: number[] = [];

    for (let i = 1; i < xPositions.length; i++) {
        const gap = xPositions[i] - xPositions[i - 1];
        if (gap > minGap) {
            gaps.push((xPositions[i] + xPositions[i - 1]) / 2);
        }
    }

    return gaps;
}

function findHorizontalGaps(
    rows: TextItem[][],
    pageHeight: number,
    minGap: number,
): number[] {
    const gaps: number[] = [];

    for (let i = 1; i < rows.length; i++) {
        const prevRow = rows[i - 1];
        const currRow = rows[i];

        const prevBottom = Math.max(...prevRow.map((it) => it.y + (it.h || 0)));
        const currTop = Math.min(...currRow.map((it) => it.y));
        const gap = currTop - prevBottom;

        if (gap > minGap) {
            gaps.push((prevBottom + currTop) / 2);
        }
    }

    return gaps;
}
