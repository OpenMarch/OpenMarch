import type { DrillGrid, DrillPerformer, DrillPoint } from "./types";
import {
    fieldDepthSteps,
    halfWidthSteps,
    stepsFromNearestSideline,
    xUnitsToSteps,
    yUnitsToStepsFromCenter,
} from "./coords";

/** A decoded coordinate record from a page frame's encrypted block. */
export interface CoordinateRecord {
    id: string;
    symbol: string;
    point: DrillPoint;
}

/** Minimum spread between sampled positions to treat a marker as moving, in steps. */
const MOVEMENT_THRESHOLD_STEPS = 0.8;

// All thresholds are in real 8-to-5 steps and measured against the grid's own
// landmarks (via `coords.ts`), so they hold for any field size, unit, or grid.
/** On a sideline or endline. */
const LINE_TOLERANCE_STEPS = 1;
/** Yard-number / hash reference ticks hug the sidelines a few steps in. */
const SIDELINE_BAND_STEPS = 8;
/** …and stay within the center third of the field horizontally. */
const SIDELINE_BAND_HALF_WIDTH_STEPS = 24;
/** The center-of-field reference dot cluster. */
const CENTER_RADIUS_Y_STEPS = 4;
const CENTER_RADIUS_X_STEPS = 8;
/** Props stay at least this far inside the sidelines. */
const PROP_EDGE_MARGIN_STEPS = 10;

/**
 * Heuristic filter for design/reference markers — the grid ticks, yard-number
 * arcs, and center reference dots the author leaves on the field. All tests are
 * expressed in steps relative to the grid's real landmarks (sidelines, endlines,
 * center), not hardcoded source-unit positions, so they scale to any field.
 * Position alone is not enough — reference ids are also static across the show.
 */
export function isLikelyReferenceMarker(
    point: DrillPoint,
    grid: DrillGrid,
): boolean {
    const fromSideline = stepsFromNearestSideline(point, grid);
    const xSteps = Math.abs(xUnitsToSteps(point.x, grid));
    const yFromCenter = Math.abs(yUnitsToStepsFromCenter(point.y, grid));

    const onSideline = fromSideline <= LINE_TOLERANCE_STEPS;
    const onEndline =
        Math.abs(xSteps - halfWidthSteps(grid)) <= LINE_TOLERANCE_STEPS;
    const inSidelineBand =
        fromSideline <= SIDELINE_BAND_STEPS &&
        xSteps <= SIDELINE_BAND_HALF_WIDTH_STEPS;
    const nearCenter =
        yFromCenter <= CENTER_RADIUS_Y_STEPS && xSteps <= CENTER_RADIUS_X_STEPS;

    return onSideline || onEndline || inSidelineBand || nearCenter;
}

/** Interior field position that could be a static prop (platform, flag pole). */
export function isLikelyPropPosition(
    point: DrillPoint,
    grid: DrillGrid,
): boolean {
    if (isLikelyReferenceMarker(point, grid)) return false;
    const yFromCenter = Math.abs(yUnitsToStepsFromCenter(point.y, grid));
    return yFromCenter < fieldDepthSteps(grid) / 2 - PROP_EDGE_MARGIN_STEPS;
}

/** The largest distance between any two sampled positions, in steps. */
function maxPositionSpreadSteps(
    points: readonly DrillPoint[],
    grid: DrillGrid,
): number {
    let max = 0;
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const dx = xUnitsToSteps(points[i]!.x - points[j]!.x, grid);
            const dy = (points[i]!.y - points[j]!.y) * grid.stepsPerUnitY;
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
    grid: DrillGrid,
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

        const moves =
            maxPositionSpreadSteps(samples, grid) > MOVEMENT_THRESHOLD_STEPS;
        const staticProp = samples.some((point) =>
            isLikelyPropPosition(point, grid),
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
    grid: DrillGrid,
): DrillPerformer[] {
    const boundaries = pages.length > 0 ? [0, pages.length - 1] : [];
    return discoverMarkers(pages, castIds, grid, boundaries).props;
}
