import type { FieldSurfaceStyle } from "../field";
import type { KitBuilder, VenueKitId } from "../types";
import { buildBighs } from "./bighs";
import { buildBlank } from "./blank";
import { buildCollege } from "./college";
import { buildGym } from "./gym";
import { buildHs } from "./hs";
import { buildProKit } from "./pro";

/**
 * The venue kit registry (P3.1, design.md section 6). The scene looks a kit up
 * by the show's `VenueSettings.kit` and never imports a kit module directly.
 */
export const KIT_BUILDERS: Readonly<Record<VenueKitId, KitBuilder>> = {
    hs: buildHs,
    bighs: buildBighs,
    college: buildCollege,
    pro: buildProKit,
    gym: buildGym,
    blank: buildBlank,
};

/**
 * The field surface style each kit sits on (design.md section 4): turf for the
 * stadiums, the field image or a generated tarp for the gym, and the 2D
 * canvas's theme colors for the blank kit.
 */
export const KIT_FIELD_STYLE: Readonly<Record<VenueKitId, FieldSurfaceStyle>> =
    {
        hs: "turf",
        bighs: "turf",
        college: "turf",
        pro: "turf",
        gym: "tarp",
        blank: "theme",
    };

/** Crowd density used when a kit doesn't suggest one (`KitResult`). */
export const DEFAULT_CROWD_DENSITY = 0.6;
