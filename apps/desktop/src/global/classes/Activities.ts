import type { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

export interface ActivityDefinition {
    // label is both the display string and the persisted value
    label: string;
    defaultTemplate: FieldProperties;
}

// Keyed by a stable identifier so other modules can reference an activity's label
export const ACTIVITIES = {
    MarchingBand: {
        label: "Marching Band",
        defaultTemplate:
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
    },
    DrumCorps: {
        label: "Drum Corps",
        defaultTemplate:
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
    },
    SoundSport: {
        label: "SoundSport",
        defaultTemplate: FieldPropertiesTemplates.SOUNDSPORT_8to5,
    },
    WinterGuard: {
        label: "Winter Guard",
        defaultTemplate: FieldPropertiesTemplates.INDOOR_50x80_8to5,
    },
    IndoorPercussion: {
        label: "Indoor Percussion",
        defaultTemplate: FieldPropertiesTemplates.INDOOR_50x80_8to5,
    },
    IndoorWinds: {
        label: "Indoor Winds",
        defaultTemplate: FieldPropertiesTemplates.INDOOR_50x80_8to5,
    },
    Other: {
        label: "Other",
        defaultTemplate:
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
    },
} as const satisfies Record<string, ActivityDefinition>;

// Union of every activity label, used to type things keyed by activity
export type ActivityLabel =
    (typeof ACTIVITIES)[keyof typeof ACTIVITIES]["label"];

export const ACTIVITY_LABELS: string[] = Object.values(ACTIVITIES).map(
    (a) => a.label,
);

// Activity a new show starts on before the user picks one
export const DEFAULT_ACTIVITY: string = ACTIVITY_LABELS[0];

// Default field template for a new show, based on the chosen activity
export function getDefaultFieldTemplate(activity?: string): FieldProperties {
    const match = Object.values(ACTIVITIES).find((a) => a.label === activity);
    return (
        match?.defaultTemplate ??
        FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES
    );
}
