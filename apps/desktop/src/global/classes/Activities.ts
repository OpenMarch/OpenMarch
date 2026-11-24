import type { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

export interface ActivityDefinition {
    // label is the persisted value (English in every language); show labelKey instead
    label: string;
    // Tolgee key for the on-screen name
    labelKey: string;
    defaultTemplate: FieldProperties;
    /** Performs on an indoor floor: the new show's field step asks for its size, step size and image */
    indoorFloor?: boolean;
    /** Has no front ensemble: the new show skips the Front ensemble step */
    noFrontEnsemble?: boolean;
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
        defaultTemplate: FieldPropertiesTemplates.INDOOR_60x90_8to5,
        indoorFloor: true,
        noFrontEnsemble: true,
    },
    {
        label: "Indoor Percussion",
        labelKey: "activities.indoorPercussion",
        defaultTemplate: FieldPropertiesTemplates.INDOOR_60x90_8to5,
        indoorFloor: true,
    },
    {
        label: "Indoor Winds",
        labelKey: "activities.indoorWinds",
        defaultTemplate: FieldPropertiesTemplates.INDOOR_60x90_8to5,
        indoorFloor: true,
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

/** Whether a stored activity performs on an indoor floor */
export function isIndoorFloorActivity(activity?: string): boolean {
    return ACTIVITIES.find((a) => a.label === activity)?.indoorFloor ?? false;
}

/** Whether a stored activity can have a front ensemble (Winter Guard has none) */
export function activityHasFrontEnsemble(activity?: string): boolean {
    return !ACTIVITIES.find((a) => a.label === activity)?.noFrontEnsemble;
}
