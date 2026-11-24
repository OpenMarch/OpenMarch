import type { KitBuilder, VenueKitId } from "../types";
import { buildArena } from "./arena";
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
    arena: buildArena,
    blank: buildBlank,
};

export { KIT_FIELD_STYLE } from "./fieldStyle";

/** Crowd density used when a kit doesn't suggest one (`KitResult`). */
export const DEFAULT_CROWD_DENSITY = 0.6;
