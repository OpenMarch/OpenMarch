import type { FieldSurfaceStyle } from "../field/plan";
import type { VenueKitId } from "../types";

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
        gym: "tarp",
        arena: "tarp",
        blank: "theme",
    };
