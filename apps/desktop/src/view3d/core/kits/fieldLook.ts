import type { FieldCenterArt, TurfColors } from "../field";
import type { VenueKitId } from "../types";
import { dieselFieldArt } from "./markDiesel/brand";
import { DIESEL_TURF } from "./markDiesel/turf";

/*
 * How a kit's own field looks, apart from the kits' geometry, so the 2D
 * venue underlay can paint the same field as the 3D View without loading
 * every kit.
 */

/**
 * Midfield art a kit paints in place of the OpenMarch logo
 * (`FieldSurfaceInput.centerArt`).
 */
export const KIT_FIELD_ART: Readonly<
    Partial<Record<VenueKitId, FieldCenterArt>>
> = { markDiesel: dieselFieldArt };

/**
 * Grass colors a kit paints in place of the shared turf's
 * (`FieldSurfaceInput.turf`). Kits without an entry are unchanged.
 */
export const KIT_FIELD_TURF: Readonly<Partial<Record<VenueKitId, TurfColors>>> =
    { markDiesel: DIESEL_TURF };
