import { FieldProperties } from "@openmarch/core";
import { schema } from "../database/db";

export type DatabaseProp = typeof schema.props.$inferSelect;
export type DatabasePropPageGeometry =
    typeof schema.prop_page_geometry.$inferSelect;

export type PropWithMarcher = DatabaseProp & {
    marcher: typeof schema.marchers.$inferSelect;
};

export type SurfaceType = "floor" | "platform" | "obstacle";
export type ShapeType = "rectangle" | "circle" | "arc" | "polygon" | "freehand";

export const SURFACE_TYPE_Z_ORDER: Record<SurfaceType, number> = {
    floor: 0,
    platform: 1,
    obstacle: 3,
};

export const DEFAULT_PROP_WIDTH = 15;
export const DEFAULT_PROP_HEIGHT = 15;

/**
 * Pixels per foot, derived from PIXELS_PER_INCH for consistency across field types.
 */
export function getPixelsPerFoot(): number {
    return FieldProperties.PIXELS_PER_INCH * 12;
}
