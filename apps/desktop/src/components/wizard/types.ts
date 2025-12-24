import { FieldProperties } from "@openmarch/core";
import { NewMarcherArgs } from "@/db-functions";

export type WizardStepId =
    | "project"
    | "ensemble"
    | "field"
    | "performers"
    | "music";

export interface ProjectData {
    projectName: string;
    fileLocation?: string;
    designer?: string;
    client?: string;
}

export interface EnsembleData {
    environment: "indoor" | "outdoor";
    ensemble_type: string;
}

export interface FieldData {
    template: FieldProperties;
    isCustom: boolean;
}

export interface PerformersData {
    marchers: NewMarcherArgs[];
}

export interface MusicData {
    method: "xml" | "mp3" | "tempo_only" | "skip";
    tempo?: number;
    startCount?: number;
}

export interface WizardState {
    currentStep: WizardStepId;
    project: ProjectData | null;
    ensemble: EnsembleData | null;
    field: FieldData | null;
    performers: PerformersData | null;
    music: MusicData | null;
}

export const WIZARD_STEPS: WizardStepId[] = [
    "project",
    "ensemble",
    "field",
    "performers",
    "music",
];

export const DEFAULT_WIZARD_STATE: WizardState = {
    currentStep: "project",
    project: null,
    ensemble: null,
    field: null,
    performers: null,
    music: null,
};
