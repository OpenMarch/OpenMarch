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
