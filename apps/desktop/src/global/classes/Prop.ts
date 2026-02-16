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
 * Calculates pixels per foot from field properties.
 * Based on 8-to-5 step = 22.5 inches.
 */
export function getPixelsPerFoot(fieldProperties: FieldProperties): number {
    const pixelsPerStep = fieldProperties.pixelsPerStep;
    const inchesPerStep = 22.5;
    return (pixelsPerStep / inchesPerStep) * 12;
}

/**
 * Converts feet to pixels
 */
export function feetToPixels(
    feet: number,
    fieldProperties: FieldProperties,
): number {
    return feet * getPixelsPerFoot(fieldProperties);
}

/**
 * Converts pixels to feet
 */
export function pixelsToFeet(
    pixels: number,
    fieldProperties: FieldProperties,
): number {
    return pixels / getPixelsPerFoot(fieldProperties);
}
