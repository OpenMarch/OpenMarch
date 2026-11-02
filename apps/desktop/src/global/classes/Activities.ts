import type { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

export interface ActivityDefinition {
    // label is the persisted value (English in every language); show labelKey instead
    label: string;
    // Tolgee key for the on-screen name
    labelKey: string;
    defaultTemplate: FieldProperties;
}

export const ACTIVITIES: ActivityDefinition[] = [
    {
        label: "Marching Band",
        labelKey: "activities.marchingBand",
        defaultTemplate:
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
    },
    {
        label: "Drum Corps",
        labelKey: "activities.drumCorps",
        defaultTemplate:
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
    },
    {
        label: "SoundSport",
        labelKey: "activities.soundSport",
        defaultTemplate: FieldPropertiesTemplates.SOUNDSPORT_8to5,
    },
    {
        label: "Winter Guard",
        labelKey: "activities.winterGuard",
        defaultTemplate: FieldPropertiesTemplates.INDOOR_50x80_8to5,
    },
    {
        label: "Indoor Percussion",
        labelKey: "activities.indoorPercussion",
        defaultTemplate: FieldPropertiesTemplates.INDOOR_50x80_8to5,
    },
    {
        label: "Indoor Winds",
        labelKey: "activities.indoorWinds",
        defaultTemplate: FieldPropertiesTemplates.INDOOR_50x80_8to5,
    },
    {
        label: "Other",
        labelKey: "activities.other",
        defaultTemplate:
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
    },
];

export const ACTIVITY_LABELS: string[] = ACTIVITIES.map((a) => a.label);

/** The Tolgee key for a stored activity's on-screen name, or undefined for one this app doesn't know. */
export function activityLabelKey(activity: string): string | undefined {
    return ACTIVITIES.find((a) => a.label === activity)?.labelKey;
}

// Activity a new show starts on before the user picks one
export const DEFAULT_ACTIVITY: string = ACTIVITY_LABELS[0];

// Default field template for a new show, based on the chosen activity
export function getDefaultFieldTemplate(activity?: string): FieldProperties {
    const match = ACTIVITIES.find((a) => a.label === activity);
    return (
        match?.defaultTemplate ??
        FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES
    );
}
