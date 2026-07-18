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
 * Props piggyback on the marcher system: a prop is a marcher whose `type`
 * discriminator is "prop". These predicates are the single source of truth for
 * that check — prefer them over inline `type === "prop"` comparisons.
 */
export const PROP_MARCHER_TYPE = "prop" as const;

export const isProp = <T extends { type: string }>(marcher: T): boolean =>
    marcher.type === PROP_MARCHER_TYPE;

export const isNotProp = <T extends { type: string }>(marcher: T): boolean =>
    !isProp(marcher);

/**
 * Pixels per foot, derived from PIXELS_PER_INCH for consistency across field types.
 */
export function getPixelsPerFoot(): number {
    return FieldProperties.PIXELS_PER_INCH * 12;
}
