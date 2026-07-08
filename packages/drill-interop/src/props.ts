import type { DrillFieldBorder, DrillPerformer, DrillPoint } from "./types";

/** A decoded coordinate record from a page frame's encrypted block. */
export interface CoordinateRecord {
    id: string;
    symbol: string;
    point: DrillPoint;
}

const REFERENCE_EPSILON = 0.15;
/** Minimum spread between sampled positions to treat a marker as moving. */
const MOVEMENT_THRESHOLD = 0.5;

/**
 * Heuristic filter for design/reference markers (grid ticks, arcs, hash lines).
 * Position alone is not enough — reference ids are also static across the show.
 */
export function isLikelyReferenceMarker(
    point: DrillPoint,
    field: DrillFieldBorder,
): boolean {
    const onBackSideline = Math.abs(point.y - field.maxY) < REFERENCE_EPSILON;
    const onFrontSideline = Math.abs(point.y - field.minY) < REFERENCE_EPSILON;
    const onEndline =
        Math.abs(point.x - field.minX) < REFERENCE_EPSILON ||
        Math.abs(point.x - field.maxX) < REFERENCE_EPSILON;
    const onFrontHashLine =
        Math.abs(point.y - 1.25) < REFERENCE_EPSILON && Math.abs(point.x) <= 20;
    const onBackArc = point.y > field.maxY - 5 && Math.abs(point.x) <= 15;
    return (
        onBackSideline ||
        onFrontSideline ||
        onEndline ||
        onFrontHashLine ||
        onBackArc
    );
}

/** Interior field position that could be a static prop (platform, flag pole). */
export function isLikelyPropPosition(
    point: DrillPoint,
    field: DrillFieldBorder,
): boolean {
    if (isLikelyReferenceMarker(point, field)) return false;
    return Math.abs(point.y) < field.maxY - 6;
}

function maxPositionSpread(points: readonly DrillPoint[]): number {
    let max = 0;
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const dx = points[i]!.x - points[j]!.x;
            const dy = points[i]!.y - points[j]!.y;
            max = Math.max(max, Math.hypot(dx, dy));
        }
    }
    return max;
}

/** Samples marker positions at set-boundary page indices. */
function collectBoundaryPositions(
    pages: ReadonlyArray<{ records: ReadonlyMap<string, CoordinateRecord> }>,
    boundaryIndices: readonly number[],
    id: string,
): DrillPoint[] {
    const points: DrillPoint[] = [];
    for (const index of boundaryIndices) {
        const record = pages[index]?.records.get(id);
        if (record) points.push(record.point);
    }
    return points;
}

function sortedIds(ids: Iterable<string>): string[] {
    return [...ids].sort((a, b) => {
        const left = BigInt(a);
        const right = BigInt(b);
        return left < right ? -1 : left > right ? 1 : 0;
    });
}

function labelPerformers(
    ids: readonly string[],
    drill_prefix: string,
): DrillPerformer[] {
    return ids.map((id, index) => ({
        id,
        label: `${drill_prefix}${index + 1}`,
        drill_prefix,
        drill_order: index + 1,
    }));
}

export interface DiscoveredMarkers {
    /** Non-cast props (`X` markers and future `PRP8` entries). */
    props: DrillPerformer[];
    /** Non-cast performers with drill labels in the block (`s`) but not in CST7. */
    supplemental: DrillPerformer[];
}

/**
 * Classifies non-cast markers for import. Uses identity + movement first, then
 * interior position for static props. Reference geometry is dropped even when it
 * shares coordinates with a prop on a single frame.
 */
export function discoverMarkers(
    pages: ReadonlyArray<{ records: ReadonlyMap<string, CoordinateRecord> }>,
    castIds: ReadonlySet<string>,
    field: DrillFieldBorder,
    setBoundaryIndices: readonly number[],
): DiscoveredMarkers {
    const propIds = new Set<string>();
    const supplementalIds = new Set<string>();
    const candidateIds = new Set<string>();

    for (const page of pages) {
        for (const [id, record] of page.records) {
            if (castIds.has(id)) continue;
            candidateIds.add(id);
        }
    }

    for (const id of candidateIds) {
        let symbol = "X";
        for (const page of pages) {
            const record = page.records.get(id);
            if (record) {
                symbol = record.symbol;
                break;
            }
        }

        if (symbol === "s") {
            supplementalIds.add(id);
            continue;
        }

        if (symbol !== "X") continue;

        const samples = collectBoundaryPositions(pages, setBoundaryIndices, id);
        if (samples.length === 0) continue;

        const moves = maxPositionSpread(samples) > MOVEMENT_THRESHOLD;
        const staticProp = samples.some((point) =>
            isLikelyPropPosition(point, field),
        );
        if (moves || staticProp) propIds.add(id);
    }

    return {
        props: labelPerformers(sortedIds(propIds), "PR"),
        supplemental: labelPerformers(sortedIds(supplementalIds), "OT"),
    };
}

/** @deprecated Use {@link discoverMarkers}. */
export function discoverProps(
    pages: ReadonlyArray<{ records: ReadonlyMap<string, CoordinateRecord> }>,
    castIds: ReadonlySet<string>,
    field: DrillFieldBorder,
): DrillPerformer[] {
    const boundaries = pages.length > 0 ? [0, pages.length - 1] : [];
    return discoverMarkers(pages, castIds, field, boundaries).props;
}
