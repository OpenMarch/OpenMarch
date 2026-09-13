import { FieldProperties } from "@openmarch/core";
import {
    type DrillGrid,
    type DrillPoint,
    xUnitsToSteps,
    yUnitsToStepsFromCenterFront,
} from "@openmarch/drill-interop";
export {
    deriveMarcherFromDrillLabel,
    deriveMarcherFromDrillLabel as deriveMarcherFromLabel,
    type DerivedMarcher,
} from "@/global/drillLabel";

/**
 * Converts a source coordinate (source field units, measured from field center)
 * into an OpenMarch canvas pixel position.
 *
 * The source-space math (unit → step, front/back orientation) lives in the
 * drill-interop coordinate subsystem (`xUnitsToSteps`,
 * `yUnitsToStepsFromCenterFront`) so the importer and the marker classifier
 * share one definition. Unlike a rectangle fit, this converts by the source
 * grid's true step size and anchors on the shared physical reference both tools
 * agree on: the center of the front sideline. A marcher therefore keeps its real
 * step distance from the front sideline and the 50, so hashes land exactly on
 * their step counts and the back sideline falls at its true depth instead of
 * being stretched to match a different field template. Pair this with
 * {@link resolveDrillField} so the OpenMarch field matches the source grid.
 */
export function sourcePointToPixels(
    point: DrillPoint,
    grid: DrillGrid,
    field: FieldProperties,
): { x: number; y: number } {
    const xSteps = xUnitsToSteps(point.x, grid);
    const stepsFromCenterFront = yUnitsToStepsFromCenterFront(point.y, grid);

    return {
        x: field.centerFrontPoint.xPixels + xSteps * field.pixelsPerStep,
        y:
            field.centerFrontPoint.yPixels +
            stepsFromCenterFront * field.pixelsPerStep,
    };
}

/**
 * Counts to give the imported show's final page.
 *
 * OpenMarch's last page has no successor to bound it, so its length is stored
 * explicitly. The source drill ends when its last set is reached — the frames
 * and audio that follow are timeline the designer has not drilled into yet, and
 * folding them into the last page would stretch that set's arrival move across
 * the leftover music instead of arriving on time.
 *
 * So the final page runs from the previous page's start to the last set's own
 * arrival, exactly like every other page. Any counts past that arrival stay as
 * bare beats on the timeline for the designer to extend into.
 */
export function lastPageCountsForImport({
    lastSetStartCount,
    previousPageStartCount,
}: {
    /** The final set's arrival count. */
    lastSetStartCount: number;
    /** The start count of the page before it. */
    previousPageStartCount: number;
}): number {
    return Math.max(1, lastSetStartCount - previousPageStartCount);
}
