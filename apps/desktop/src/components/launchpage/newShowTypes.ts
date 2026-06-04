import type { FieldProperties } from "@openmarch/core";
import type { NewMarcherArgs } from "@/db-functions";

export type NewShowEnvironment = "indoor" | "outdoor";

export type NewShowStepId =
    | "project"
    | "ensemble"
    | "field"
    | "performers"
    | "music";

export const NEW_SHOW_STEPS: NewShowStepId[] = [
    "project",
    "ensemble",
    "field",
    "performers",
    "music",
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

export interface NewShowMusicData {
    method: "xml" | "mp3" | "tempo_only" | "skip";
    tempo?: number;
}

export interface NewShowWizardState {
    project: NewShowProjectData | null;
    ensemble: NewShowEnsembleData | null;
    field: NewShowFieldData | null;
    performers: NewShowPerformersData | null;
    music: NewShowMusicData | null;
    draftFilePath?: string;
}

export const DEFAULT_NEW_SHOW_WIZARD_STATE: NewShowWizardState = {
    project: null,
    ensemble: null,
    field: null,
    performers: null,
    music: null,
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
    music?: NewShowMusicData | null;
    draftFilePath?: string;
};

export function wizardStateToFormState(
    state: NewShowWizardState,
): NewShowFormState {
    if (!state.project || !state.ensemble || !state.field) {
        throw new Error("Wizard state is incomplete");
    }
    const tempo =
        state.music?.method === "tempo_only" && state.music.tempo
            ? state.music.tempo
            : 120;

    return {
        projectName: state.project.projectName,
        filePath: state.project.fileLocation,
        environment: state.ensemble.environment,
        fieldTemplate: state.field.template,
        designer: state.project.designer,
        client: state.project.client,
        defaultTempo: tempo,
        ensemble: state.ensemble,
        performers: state.performers,
        music: state.music,
        draftFilePath: state.draftFilePath,
    };
}

export function hasNewShowProgress(state: NewShowWizardState): boolean {
    return (
        state.project !== null ||
        state.ensemble !== null ||
        state.field !== null ||
        state.performers !== null ||
        state.music !== null ||
        !!state.draftFilePath
    );
}
