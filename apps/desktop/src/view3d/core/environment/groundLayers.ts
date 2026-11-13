/**
 * Flat layers on the ground (land, site paint, lots, track, field) lie a few
 * centimeters apart, too little for the depth buffer to tell apart hundreds
 * of meters away or with the near plane pulled in for a close-up, so they
 * flashed through each other as the camera moved. Each layer instead draws
 * with a polygon offset by its level: a higher level always wins over a lower
 * one, at any distance. Keep the layers' heights in the same order too.
 *
 * The field draws at its true depth and the layers under it are pushed back.
 * A polygon offset moves a surface by a few pixels' worth of its depth
 * slope, so a field pulled toward the camera covered the bottom few pixels
 * of everything standing on it; from far out that was the marchers' feet.
 */
import type { Material } from "three";

export const GROUND_LAYER = {
    /** The kits' big plain ground plane, furthest back. */
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
    /**
     * Marchers' soft contact shadows, on the field. They and the rings are
     * pulled toward the camera, so they overlap the feet a pixel or two.
     */
    contact: 7,
    /** Selection rings at marchers' feet, over their shadows. */
    selection: 8,
} as const;

/** Draws `material` at a ground layer's level (see `GROUND_LAYER`). */
export function setGroundLayer<M extends Material>(
    material: M,
    level: number,
): M {
    // Relative to the field, which gets no offset.
    const above = level - GROUND_LAYER.field;
    material.polygonOffset = above !== 0;
    material.polygonOffsetFactor = -above;
    material.polygonOffsetUnits = -2 * above;
    return material;
}

/**
 * Draws `material` just behind anything lying flush on it: a wall behind the
 * trim, doors and beams set into it, a roof frame behind its girders. Without
 * this, two surfaces in the same plane flash through each other as the camera
 * moves. A higher `level` sits further back, for a backing behind a backing.
 */
export function setFlushBacking<M extends Material>(material: M, level = 1): M {
    material.polygonOffset = true;
    material.polygonOffsetFactor = level;
    material.polygonOffsetUnits = 2 * level;
    return material;
}
