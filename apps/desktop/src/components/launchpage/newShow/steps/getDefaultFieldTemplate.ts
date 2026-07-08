import type { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { SOUNDSPORT_ENSEMBLE_TYPE } from "@/global/classes/fieldTemplates/SoundSport";
import type { NewShowEnvironment } from "../../newShowTypes";

export { SOUNDSPORT_ENSEMBLE_TYPE };

/**
 * Picks the default field template for a new show based on the chosen
 * environment and ensemble type.
 *
 * Indoor ensembles default to a standard indoor floor. Outdoor ensembles
 * default to a college football field, except SoundSport, which defaults to
 * its dedicated performance-area preset.
 */
export function getDefaultFieldTemplate(
    environment: NewShowEnvironment,
    ensembleType?: string,
): FieldProperties {
    if (environment === "indoor") {
        return FieldPropertiesTemplates.INDOOR_50x80_8to5;
    }
    if (ensembleType === SOUNDSPORT_ENSEMBLE_TYPE) {
        return FieldPropertiesTemplates.SOUNDSPORT_8to5;
    }
    return FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
}
