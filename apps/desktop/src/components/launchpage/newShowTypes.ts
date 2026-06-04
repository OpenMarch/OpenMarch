import type { FieldProperties } from "@openmarch/core";
import type { NewMarcherArgs } from "@/db-functions";

export type NewShowEnvironment = "indoor" | "outdoor";

export type NewShowStepId =
    | "project"
    | "ensemble"
    | "field"
    | "performers"
    | "audio"
    | "tempo";

export const NEW_SHOW_STEPS: NewShowStepId[] = [
    "project",
    "ensemble",
    "field",
    "performers",
    "audio",
    "tempo",
];

export interface NewShowProjectData {
    projectName: string;
    fileLocation: string;
    designer?: string;
    client?: string;
}

export interface NewShowEnsembleData {
    environment: NewShowEnvironment;
    ensemble_type: string;
}

export interface NewShowFieldData {
    template: FieldProperties;
    isCustom: boolean;
}

export type NewShowMarcherDraft = NewMarcherArgs & { tempId?: string };

export interface NewShowPerformersData {
    method?: "add" | "skip";
    marchers: NewShowMarcherDraft[];
}

export interface NewShowAudioData {
    method: "audio" | "skip";
}

export interface NewShowTempoData {
    method: "xml" | "tempo_only" | "skip";
    tempo?: number;
}

export interface NewShowWizardState {
    project: NewShowProjectData | null;
    ensemble: NewShowEnsembleData | null;
    field: NewShowFieldData | null;
    performers: NewShowPerformersData | null;
    audio: NewShowAudioData | null;
    tempo: NewShowTempoData | null;
    draftFilePath?: string;
}

export const DEFAULT_NEW_SHOW_WIZARD_STATE: NewShowWizardState = {
    project: null,
    ensemble: null,
    field: null,
    performers: null,
    audio: null,
    tempo: null,
};

/** @deprecated Use NewShowWizardState for completion */
export type NewShowFormState = {
    projectName: string;
    filePath: string;
    environment: NewShowEnvironment;
    fieldTemplate: FieldProperties;
    designer?: string;
    client?: string;
    defaultTempo: number;
    ensemble?: NewShowEnsembleData | null;
    performers?: NewShowPerformersData | null;
    audio?: NewShowAudioData | null;
    tempo?: NewShowTempoData | null;
    draftFilePath?: string;
};

export function wizardStateToFormState(
    state: NewShowWizardState,
): NewShowFormState {
    if (!state.project || !state.ensemble || !state.field) {
        throw new Error("Wizard state is incomplete");
    }
    const defaultTempo =
        state.tempo?.method === "tempo_only" && state.tempo.tempo
            ? state.tempo.tempo
            : 120;

    return {
        projectName: state.project.projectName,
        filePath: state.project.fileLocation,
        environment: state.ensemble.environment,
        fieldTemplate: state.field.template,
        designer: state.project.designer,
        client: state.project.client,
        defaultTempo,
        ensemble: state.ensemble,
        performers: state.performers,
        audio: state.audio,
        tempo: state.tempo,
        draftFilePath: state.draftFilePath,
    };
}

export function hasNewShowProgress(state: NewShowWizardState): boolean {
    return (
        state.project !== null ||
        state.ensemble !== null ||
        state.field !== null ||
        state.performers !== null ||
        state.audio !== null ||
        state.tempo !== null ||
        !!state.draftFilePath
    );
}
