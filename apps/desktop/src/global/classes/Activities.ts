import type { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

export interface ActivityDefinition {
    // label is both the display string and the persisted value
    label: string;
    defaultTemplate: FieldProperties;
}

export const ACTIVITIES: ActivityDefinition[] = [
    {
        label: "Marching Band",
        defaultTemplate:
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
    },
    {
        label: "Drum Corps",
        defaultTemplate:
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
    },
    {
        label: "SoundSport",
        defaultTemplate: FieldPropertiesTemplates.SOUNDSPORT_8to5,
    },
    {
        label: "Winter Guard",
        defaultTemplate: FieldPropertiesTemplates.INDOOR_50x80_8to5,
    },
    {
        label: "Indoor Percussion",
        defaultTemplate: FieldPropertiesTemplates.INDOOR_50x80_8to5,
    },
    {
        label: "Indoor Winds",
        defaultTemplate: FieldPropertiesTemplates.INDOOR_50x80_8to5,
    },
    {
        label: "Other",
        defaultTemplate:
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
    },
];

export const ACTIVITY_LABELS: string[] = ACTIVITIES.map((a) => a.label);

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
