import { describe, it, expect } from "vitest";
import {
    ACTIVITIES,
    ACTIVITY_LABELS,
    DEFAULT_ACTIVITY,
    getDefaultFieldTemplate,
} from "../Activities";
import FieldPropertiesTemplates from "../FieldProperties.templates";

describe("Activities registry", () => {
    it("exposes the expected activity labels in order", () => {
        expect(ACTIVITY_LABELS).toEqual([
            "Marching Band",
            "Drum Corps",
            "SoundSport",
            "Winter Guard",
            "Indoor Percussion",
            "Indoor Winds",
            "Other",
        ]);
    });

    it("DEFAULT_ACTIVITY is the first activity label", () => {
        expect(DEFAULT_ACTIVITY).toBe(ACTIVITY_LABELS[0]);
    });

    it("every activity points at a real field template", () => {
        const known = new Set(Object.values(FieldPropertiesTemplates));
        for (const activity of ACTIVITIES) {
            expect(known.has(activity.defaultTemplate)).toBe(true);
        }
    });
});

describe("getDefaultFieldTemplate", () => {
    it("returns the SoundSport preset for the SoundSport activity", () => {
        expect(getDefaultFieldTemplate("SoundSport")).toBe(
            FieldPropertiesTemplates.SOUNDSPORT_8to5,
        );
    });

    it("returns an indoor floor for an indoor activity", () => {
        expect(getDefaultFieldTemplate("Winter Guard")).toBe(
            FieldPropertiesTemplates.INDOOR_50x80_8to5,
        );
    });

    it("returns college football for Marching Band", () => {
        expect(getDefaultFieldTemplate("Marching Band")).toBe(
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
        );
    });

    it("falls back to college football for unknown or missing activity", () => {
        expect(getDefaultFieldTemplate(undefined)).toBe(
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
        );
        expect(getDefaultFieldTemplate("Basket Weaving")).toBe(
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
        );
    });
});
