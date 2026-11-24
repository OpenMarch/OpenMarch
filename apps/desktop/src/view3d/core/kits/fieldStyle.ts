import type { FieldProperties } from "@openmarch/core";
import type { FieldSurfaceStyle } from "../field/plan";
import type { VenueKitId } from "../types";
import { KITS_WITH_OWN_FIELD, fieldFamily } from "../venueSettings";

/**
 * The field surface style each kit sits on (design.md section 4): turf for the
 * stadiums, the field image or a generated tarp for the gym and the arena, and the 2D
 * canvas's theme colors for the blank kit.
 */
export const KIT_FIELD_STYLE: Readonly<Record<VenueKitId, FieldSurfaceStyle>> =
    {
        hs: "turf",
        bighs: "turf",
        college: "turf",
        pro: "turf",
        markDiesel: "turf",
        gym: "tarp",
        arena: "tarp",
        blank: "theme",
    };

/**
 * The surface style a kit paints the show's field in: `KIT_FIELD_STYLE`,
 * except that in a venue with its own field a field that isn't a football
 * field (indoor, SoundSport, any grid) is a tarp (the show's field image,
 * or the generated tarp) laid on the venue's turf. A football field stays
 * turf whatever its step size.
 */
export function kitFieldStyle(
    kitId: VenueKitId,
    fieldProperties: FieldProperties,
): FieldSurfaceStyle {
    const style = KIT_FIELD_STYLE[kitId];
    if (
        !KITS_WITH_OWN_FIELD.includes(kitId) ||
        fieldFamily(fieldProperties) === "football"
    )
        return style;
    return "tarp";
}
