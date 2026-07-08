import type { DrillGrid, DrillPoint } from "./types";

/**
 * Source-space coordinate subsystem. One place that knows how the source tool's
 * field is oriented and how its units become 8-to-5 steps, so the importer and
 * the marker classifier reason about positions the same way instead of each
 * hardcoding field-relative constants.
 *
 * Orientation note: the source measures Y with positive toward the **front**
 * (audience) sideline — the opposite of OpenMarch — so the front sideline is the
 * *largest* sideline value. See `FORMAT.md` §5.
 */

/** The front (audience) sideline, in source units. */
export function frontSidelineUnits(grid: DrillGrid): number {
    return grid.sidelinesY.length > 0
        ? Math.max(...grid.sidelinesY)
        : grid.border.maxY;
}

/** The back sideline, in source units. */
export function backSidelineUnits(grid: DrillGrid): number {
    return grid.sidelinesY.length > 0
        ? Math.min(...grid.sidelinesY)
        : grid.border.minY;
}

/** The field's front/back center line, in source units. */
export function centerUnitsY(grid: DrillGrid): number {
    return (frontSidelineUnits(grid) + backSidelineUnits(grid)) / 2;
}

/** An X distance in source units → steps (positive toward side 2 / the right). */
export function xUnitsToSteps(xUnits: number, grid: DrillGrid): number {
    return xUnits * grid.stepsPerUnitX;
}

/**
 * A Y position in source units → OpenMarch-style steps from center front: 0 at
 * the front sideline, growing negative toward the back.
 */
export function yUnitsToStepsFromCenterFront(
    yUnits: number,
    grid: DrillGrid,
): number {
    return (yUnits - frontSidelineUnits(grid)) * grid.stepsPerUnitY;
}

/**
 * A Y position in source units → steps from the field's center line: 0 at
 * center, positive toward the front, negative toward the back.
 */
export function yUnitsToStepsFromCenter(
    yUnits: number,
    grid: DrillGrid,
): number {
    return (yUnits - centerUnitsY(grid)) * grid.stepsPerUnitY;
}

/** The field depth, front sideline to back sideline, in steps. */
export function fieldDepthSteps(grid: DrillGrid): number {
    return Math.abs(
        (frontSidelineUnits(grid) - backSidelineUnits(grid)) *
            grid.stepsPerUnitY,
    );
}

/** The largest yard-line/endline distance from center, in steps. */
export function halfWidthSteps(grid: DrillGrid): number {
    return (
        Math.max(Math.abs(grid.border.minX), Math.abs(grid.border.maxX)) *
        grid.stepsPerUnitX
    );
}

/** Steps a point sits behind the nearest sideline (0 on a sideline). */
export function stepsFromNearestSideline(
    point: DrillPoint,
    grid: DrillGrid,
): number {
    const fromFront = Math.abs(yUnitsToStepsFromCenterFront(point.y, grid));
    const fromBack = Math.abs(fromFront - fieldDepthSteps(grid));
    return Math.min(fromFront, fromBack);
}
