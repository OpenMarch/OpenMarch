import { FieldProperties } from "@openmarch/core";
import type { DrillFieldBorder, DrillPoint } from "@openmarch/drill-interop";
export {
    deriveMarcherFromDrillLabel,
    deriveMarcherFromDrillLabel as deriveMarcherFromLabel,
    type DerivedMarcher,
} from "@/global/drillLabel";

/** The OpenMarch field geometry needed to place a source coordinate. */
export interface FieldGeometry {
    /** Distance in pixels for one 8-to-5 step. */
    pixelsPerStep: number;
    /** Canvas pixel location of the center of the front sideline. */
    centerFrontPoint: { xPixels: number; yPixels: number };
    /** Largest absolute x checkpoint distance from center, in steps. */
    maxXSteps: number;
    /** Steps-from-center-front at the front sideline (0). */
    frontYSteps: number;
    /** Steps-from-center-front at the back sideline (negative). */
    backYSteps: number;
}

/** Reads the OpenMarch field geometry needed to place source coordinates. */
export function fieldGeometry(field: FieldProperties): FieldGeometry {
    const yStepValues = field.yCheckpoints.map((c) => c.stepsFromCenterFront);
    const xStepValues = field.xCheckpoints.map((c) =>
        Math.abs(c.stepsFromCenterFront),
    );
    // Y checkpoints store unsigned distance from the front sideline (0 = front,
    // back sideline is the largest value). Canvas placement uses signed steps:
    // 0 at the front, negative toward the back (top of the canvas).
    const frontSidelineSteps = Math.min(...yStepValues);
    const backSidelineSteps = -Math.max(...yStepValues);
    return {
        pixelsPerStep: field.pixelsPerStep,
        centerFrontPoint: field.centerFrontPoint,
        maxXSteps: Math.max(...xStepValues, 1),
        frontYSteps: frontSidelineSteps,
        backYSteps: backSidelineSteps,
    };
}

/**
 * Converts a source coordinate (field units, measured from field center) into an
 * OpenMarch canvas pixel position.
 *
 * The mapping is an affine fit of the source field rectangle onto OpenMarch's
 * field rectangle, so it stays correct regardless of the source tool's unit
 * choice. The source y axis points toward the back of the field; OpenMarch's
 * origin is the front sideline with the back of the field above it.
 */
export function sourcePointToPixels(
    point: DrillPoint,
    border: DrillFieldBorder,
    field: FieldGeometry,
): { x: number; y: number } {
    const sourceHalfWidth = Math.max(
        Math.abs(border.minX),
        Math.abs(border.maxX),
        1,
    );
    const sourceDepth = Math.max(border.maxY - border.minY, 1);
    const omDepth = field.frontYSteps - field.backYSteps;

    const xSteps = (point.x / sourceHalfWidth) * field.maxXSteps;
    // Source front sideline (border.minY) -> front checkpoint; source back
    // (border.maxY) -> back checkpoint. OpenMarch y-steps grow negative
    // (toward the top of the canvas) as you move away from the front sideline.
    const fractionToBack = (point.y - border.minY) / sourceDepth;
    const ySteps = field.frontYSteps - fractionToBack * omDepth;

    return {
        x: field.centerFrontPoint.xPixels + xSteps * field.pixelsPerStep,
        y: field.centerFrontPoint.yPixels + ySteps * field.pixelsPerStep,
    };
}
