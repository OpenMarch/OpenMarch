/**
 * Flat layers on the ground (land, site paint, lots, track, field) lie a few
 * centimeters apart, too little for the depth buffer to tell apart hundreds
 * of meters away or with the near plane pulled in for a close-up, so they
 * flashed through each other as the camera moved. Each layer instead draws
 * with a polygon offset by its level: a higher level always wins over a lower
 * one, at any distance. Keep the layers' heights in the same order too.
 */
import type { Material } from "three";

export const GROUND_LAYER = {
    /** The kits' big plain ground plane: no offset. */
    ground: 0,
    /** The shared land past the stands. */
    land: 1,
    /** A kit's painted site: lawns, plazas, paths. */
    site: 2,
    /** Parking lots and pads on the site. */
    lots: 3,
    /** The running track, or an apron under the field. */
    track: 4,
    /** Paint on the track, such as the finish line. */
    decal: 5,
    /** The field surface, over everything else on the ground. */
    field: 6,
} as const;

/** Draws `material` at a ground layer's level (see `GROUND_LAYER`). */
export function setGroundLayer<M extends Material>(
    material: M,
    level: number,
): M {
    material.polygonOffset = level !== 0;
    material.polygonOffsetFactor = -level;
    material.polygonOffsetUnits = -2 * level;
    return material;
}
