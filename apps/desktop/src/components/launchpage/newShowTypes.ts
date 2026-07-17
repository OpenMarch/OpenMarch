import type { FieldProperties } from "@openmarch/core";
import type { NewMarcherArgs, NewSectionAppearanceArgs } from "@/db-functions";

export type NewShowStepId =
    | "start"
    | "project"
    | "ensemble"
    | "field"
    | "performers"
    | "audio"
    | "tempo";

export const NEW_SHOW_STEPS: NewShowStepId[] = [
    "start",
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

export type NewShowSetupMode = "blank" | "importPrevious";

export interface NewShowStartData {
    mode: NewShowSetupMode;
}

export interface NewShowEnsembleData {
    activity: string;
}

export interface NewShowFieldData {
    template: FieldProperties;
    isCustom: boolean;
}

export interface PreviousDotsCoordinateData {
    drill_prefix: string;
    drill_order: number;
    x: number;
    y: number;
}

export interface PreviousDotsTagData {
    key: number;
    name?: string | null;
    description?: string | null;
    icon?: string | null;
    color_hex?: string | null;
}

export interface PreviousDotsMarcherTagData {
    drill_prefix: string;
    drill_order: number;
    tagKey: number;
}

export interface PreviousDotsImportData {
    sourcePath: string;
    field: NewShowFieldData;
    fieldImage?: Uint8Array | null;
    performers: NewShowPerformersData;
    coordinates: PreviousDotsCoordinateData[];
    sectionAppearances: NewSectionAppearanceArgs[];
    tags: PreviousDotsTagData[];
    marcherTags: PreviousDotsMarcherTagData[];
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
    start: NewShowStartData | null;
    project: NewShowProjectData | null;
    ensemble: NewShowEnsembleData | null;
    field: NewShowFieldData | null;
    performers: NewShowPerformersData | null;
    audio: NewShowAudioData | null;
    tempo: NewShowTempoData | null;
    draftFilePath?: string;
    previousDotsImport?: PreviousDotsImportData;
}

export const DEFAULT_NEW_SHOW_WIZARD_STATE: NewShowWizardState = {
    start: null,
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
    fieldTemplate: FieldProperties;
    designer?: string;
    client?: string;
    defaultTempo: number;
    ensemble?: NewShowEnsembleData | null;
    performers?: NewShowPerformersData | null;
    audio?: NewShowAudioData | null;
    tempo?: NewShowTempoData | null;
    draftFilePath?: string;
    previousDotsImport?: PreviousDotsImportData;
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
        fieldTemplate: state.field.template,
        designer: state.project.designer,
        client: state.project.client,
        defaultTempo,
        ensemble: state.ensemble,
        performers: state.performers,
        audio: state.audio,
        tempo: state.tempo,
        draftFilePath: state.draftFilePath,
        previousDotsImport: state.previousDotsImport,
    };
}

export function hasNewShowProgress(state: NewShowWizardState): boolean {
    return (
        state.start !== null ||
        state.project !== null ||
        state.ensemble !== null ||
        state.field !== null ||
        state.performers !== null ||
        state.audio !== null ||
        state.tempo !== null ||
        !!state.draftFilePath
    );
}
