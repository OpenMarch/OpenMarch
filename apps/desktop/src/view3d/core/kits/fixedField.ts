import type { FieldFootprint } from "../types";

const FT = 0.3048;
/** A football field with end zones: 360 ft by 160 ft. */
const FIELD_LENGTH = 360 * FT;
const FIELD_WIDTH = 160 * FT;
/** Meters a footprint may fall short of the field and still be it. */
const TOLERANCE = 0.05;

/**
 * The field a venue with its own field (`KITS_WITH_OWN_FIELD`) is built round: the
 * show's field, grown on each side it falls short to a regulation football
 * field (360 ft by 160 ft) and centered on it, so the bowl never shrinks
 * round a small floor (indoor, SoundSport) and never cuts into a long or
 * wide one. `grown` says it had to grow; the kit then paints the football
 * field itself under a floor (`kitFieldStyle`).
 */
export function fixedFieldFootprint(footprint: FieldFootprint): {
    footprint: FieldFootprint;
    grown: boolean;
} {
    const length = footprint.maxX - footprint.minX;
    const width = footprint.maxZ - footprint.minZ;
    const growX = length < FIELD_LENGTH - TOLERANCE;
    const growZ = width < FIELD_WIDTH - TOLERANCE;
    if (!growX && !growZ) return { footprint, grown: false };
    const cx = (footprint.minX + footprint.maxX) / 2;
    const cz = (footprint.minZ + footprint.maxZ) / 2;
    return {
        footprint: {
            minX: growX ? cx - FIELD_LENGTH / 2 : footprint.minX,
            maxX: growX ? cx + FIELD_LENGTH / 2 : footprint.maxX,
            minZ: growZ ? cz - FIELD_WIDTH / 2 : footprint.minZ,
            maxZ: growZ ? cz + FIELD_WIDTH / 2 : footprint.maxZ,
        },
        grown: true,
    };
}
