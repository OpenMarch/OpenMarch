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

export const TEMPO_ONLY_TIME_SIGNATURES = [
    "2/4",
    "3/4",
    "4/4",
    "5/4",
    "6/4",
    "7/4",
] as const;

export type TempoOnlyTimeSignature =
    (typeof TEMPO_ONLY_TIME_SIGNATURES)[number];

export const TEMPO_ONLY_MEASURE_COUNT = 20;
export const TEMPO_ONLY_PAGE_START_MEASURE_NUMBERS = [1, 5, 9, 13, 17] as const;
export const TEMPO_ONLY_LAST_PAGE_MEASURES = 2;

export const DEFAULT_TEMPO_ONLY_TIME_SIGNATURE: TempoOnlyTimeSignature = "4/4";

export function isTempoOnlyTimeSignature(
    value: string | undefined,
): value is TempoOnlyTimeSignature {
    return (
        value !== undefined &&
        (TEMPO_ONLY_TIME_SIGNATURES as readonly string[]).includes(value)
    );
}

export interface NewShowTempoData {
    method: "xml" | "tempo_only" | "skip";
    tempo?: number;
    timeSignature?: TempoOnlyTimeSignature;
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
