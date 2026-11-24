import { useQuery } from "@tanstack/react-query";
import type { FieldSurfaceStyle } from "@/view3d/core/field/plan";
import { KIT_FIELD_STYLE, kitFieldStyle } from "@/view3d/core/kits/fieldStyle";
import { fieldPropertiesQueryOptions } from "./useFieldProperties";
import { useVenueSettings } from "./useVenueSettings";

/**
 * The surface the show's venue paints its field in (`kitFieldStyle`): the
 * kit's own style, except a non-football floor in a venue with a field of
 * its own (Mark Diesel), which lies on its turf as a tarp.
 */
export function useVenueFieldStyle(): FieldSurfaceStyle {
    const { data: venue } = useVenueSettings();
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const kit = venue?.kit ?? "hs";
    return fieldProperties
        ? kitFieldStyle(kit, fieldProperties)
        : KIT_FIELD_STYLE[kit];
}
