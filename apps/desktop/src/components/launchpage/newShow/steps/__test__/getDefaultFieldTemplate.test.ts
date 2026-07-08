import { describe, it, expect } from "vitest";
import { getDefaultFieldTemplate } from "../getDefaultFieldTemplate";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

describe("getDefaultFieldTemplate", () => {
    it("defaults indoor ensembles to a standard indoor floor", () => {
        expect(getDefaultFieldTemplate("indoor", "Winter Guard")).toBe(
            FieldPropertiesTemplates.INDOOR_50x80_8to5,
        );
    });

    it("defaults outdoor ensembles to a college football field", () => {
        expect(getDefaultFieldTemplate("outdoor", "Marching Band")).toBe(
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
        );
    });

    it("falls back to a college football field when no ensemble type is given", () => {
        expect(getDefaultFieldTemplate("outdoor")).toBe(
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
        );
    });

    it("selects the SoundSport preset for the SoundSport ensemble type", () => {
        expect(getDefaultFieldTemplate("outdoor", "SoundSport")).toBe(
            FieldPropertiesTemplates.SOUNDSPORT_8to5,
        );
    });

    it("keeps the indoor floor even if the ensemble type is SoundSport", () => {
        expect(getDefaultFieldTemplate("indoor", "SoundSport")).toBe(
            FieldPropertiesTemplates.INDOOR_50x80_8to5,
        );
    });
});
