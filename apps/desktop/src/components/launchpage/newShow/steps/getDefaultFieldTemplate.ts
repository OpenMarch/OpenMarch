import type { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { NewShowEnvironment } from "../../newShowTypes";

/** Default field template for a new show, based on environment and ensemble type. */
export function getDefaultFieldTemplate(
    environment: NewShowEnvironment,
    ensembleType?: string,
): FieldProperties {
    if (environment === "indoor") {
        return FieldPropertiesTemplates.INDOOR_50x80_8to5;
    }
    // "SoundSport" must match the ensemble label in EnsembleStep.
    if (ensembleType === "SoundSport") {
        return FieldPropertiesTemplates.SOUNDSPORT_8to5;
    }
    return FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
}
