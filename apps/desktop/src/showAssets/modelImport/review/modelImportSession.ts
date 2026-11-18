/**
 * One model import as the review screen drives it (fork #999): the picked files, the user's
 * choices, the worker's latest result, and the name and credits to store. Each choice runs the
 * import again in a fresh worker (#998), so what the review shows is what Add stores. Nothing
 * touches the show until Add; Cancel or a new import ends the running job.
 */
import { create } from "zustand";
import type {
    ImportedModel,
    ModelCredits,
    ModelImportChoices,
    ModelImportResult,
    PickedFile,
} from "../types";

/** The parts of the import the session uses; the app's are in `modelImportSessionApp.ts`. */
export interface ModelImportDeps {
    run(
        files: readonly PickedFile[],
        choices: ModelImportChoices,
        signal: AbortSignal,
    ): Promise<ModelImportResult>;
    /** Stores the model in the show; resolves with what `items.model` names it by */
    save(model: ImportedModel): Promise<{ modelValue: string }>;
}

/**
 * The model at its Original level, for the review's comparison with the chosen level: its
 * picture, and its bytes for the 3D preview (#1091)
 */
export type BeforeSimplify =
    | { status: "loading" }
    | {
          status: "ready";
          thumbnail: Uint8Array;
          model: Uint8Array;
          triangles: number;
      }
    | { status: "failed" };

export interface ModelImportSessionState {
    /** The files being imported, or null when no import is open */
    files: readonly PickedFile[] | null;
    choices: ModelImportChoices;
    /** True while the worker runs */
    running: boolean;
    /** The latest finished run; kept while a new one runs, so the screen doesn't empty */
    result: ModelImportResult | null;
    before: BeforeSimplify | null;
    /** What the prop is called; the file's title or name until the user edits it */
    name: string;
    credits: ModelCredits;
    saving: boolean;
    /** Add failed: shown on the review with Try again */
    saveError: string | null;
}

const IDLE: ModelImportSessionState = {
    files: null,
    choices: {},
    running: false,
    result: null,
    before: null,
    name: "",
    credits: {},
    saving: false,
    saveError: null,
};

export interface ModelImportSession extends ModelImportSessionState {
    /** Starts a new import, ending any open one */
    open(files: readonly PickedFile[]): void;
    /** Changes some choices and runs the import again */
    choose(choices: ModelImportChoices): void;
    /** Runs the import again with the same choices (after a timeout or a failure) */
    retry(): void;
    /** Runs the import at the Original level, once, for the comparison */
    loadBefore(): void;
    setName(name: string): void;
    setCredits(credits: ModelCredits): void;
    /**
     * Stores the model and ends the session. Resolves with its `items.model` value, or null when
     * there's nothing to add or the save failed (then `saveError` says why).
     */
    add(): Promise<string | null>;
    /** Ends the import without storing anything */
    cancel(): void;
}

let deps: ModelImportDeps | null = null;
/** Sets how the session runs and saves imports (the app at startup, tests with stand-ins). */
export function configureModelImportSession(next: ModelImportDeps | null) {
    deps = next;
}

const requireDeps = () => {
    if (!deps) throw new Error("The model import session isn't configured");
    return deps;
};

/** Each run's controller; a newer run or Cancel aborts the older one */
let current: AbortController | null = null;
let beforeRun: AbortController | null = null;
/** Bumped by each new import, so a save that ends after it leaves the new one alone */
let generation = 0;

const isAbort = (error: unknown) =>
    error instanceof DOMException && error.name === "AbortError";

/** The model's name from the file: its title, else the file name without its extension */
export function defaultModelName(
    files: readonly PickedFile[],
    model: ImportedModel | undefined,
): string {
    if (model?.name) return model.name;
    const main =
        files.find((f) => /\.(glb|gltf)$/i.test(f.name)) ?? files.at(0);
    return main ? main.name.replace(/\.[^.]+$/, "") : "";
}

export const useModelImportSession = create<ModelImportSession>((set, get) => {
    const runNow = () => {
        const { files, choices } = get();
        if (!files) return;
        current?.abort();
        const controller = new AbortController();
        current = controller;
        set({ running: true });
        requireDeps()
            .run(files, choices, controller.signal)
            .then((result) => {
                if (current !== controller) return;
                current = null;
                // The file's own name and credits fill in with the first run that reads it
                // (Try again after a failed one included); later runs keep the user's edits
                const firstModel = result.ok && !get().result?.ok;
                set({
                    running: false,
                    result,
                    ...(firstModel
                        ? {
                              name: defaultModelName(files, result.model),
                              credits: { ...result.model.credits },
                          }
                        : {}),
                });
            })
            .catch((error: unknown) => {
                if (isAbort(error) || current !== controller) return;
                current = null;
                set({
                    running: false,
                    result: {
                        ok: false,
                        report: {
                            cantImport: [
                                { code: "failed", reason: String(error) },
                            ],
                            needsChoice: [],
                            fixedForYou: [],
                            notes: [],
                        },
                    },
                });
            });
    };

    const endRuns = () => {
        current?.abort();
        current = null;
        beforeRun?.abort();
        beforeRun = null;
    };

    return {
        ...IDLE,
        open(files) {
            generation++;
            endRuns();
            set({ ...IDLE, files: [...files] });
            runNow();
        },
        choose(choices) {
            if (!get().files) return;
            const next = { ...get().choices, ...choices };
            // The Original depends on everything but the level
            const keepsBefore = Object.keys(choices).every(
                (key) => key === "detail",
            );
            if (!keepsBefore) {
                beforeRun?.abort();
                beforeRun = null;
            }
            set({
                choices: next,
                ...(keepsBefore ? {} : { before: null }),
            });
            runNow();
        },
        retry: runNow,
        loadBefore() {
            const { files, choices, before } = get();
            if (!files || before?.status === "loading") return;
            if (before?.status === "ready") return;
            const controller = new AbortController();
            beforeRun = controller;
            set({ before: { status: "loading" } });
            requireDeps()
                .run(
                    files,
                    { ...choices, detail: "original" },
                    controller.signal,
                )
                .then((result) => {
                    if (beforeRun !== controller) return;
                    beforeRun = null;
                    set({
                        before: result.ok
                            ? {
                                  status: "ready",
                                  thumbnail: result.model.parts.thumbnail,
                                  model: result.model.parts.model,
                                  triangles: result.model.sidecar.triangles,
                              }
                            : { status: "failed" },
                    });
                })
                .catch((error: unknown) => {
                    if (isAbort(error) || beforeRun !== controller) return;
                    beforeRun = null;
                    set({ before: { status: "failed" } });
                });
        },
        setName: (name) => set({ name }),
        setCredits: (credits) => set({ credits }),
        async add() {
            const { result, running, saving, name, credits } = get();
            if (!result?.ok || running || saving) return null;
            const started = generation;
            set({ saving: true, saveError: null });
            try {
                const trimmed = name.trim();
                const { modelValue } = await requireDeps().save({
                    ...result.model,
                    name: trimmed || result.model.name,
                    credits: withoutEmpty(credits),
                });
                // Another import opened meanwhile: the model is stored, and that one goes on
                if (started !== generation) return null;
                endRuns();
                set(IDLE);
                return modelValue;
            } catch (error) {
                if (started === generation)
                    set({ saving: false, saveError: String(error) });
                return null;
            }
        },
        cancel() {
            // A save can't be taken back once it starts; the review keeps Cancel off meanwhile
            if (get().saving) return;
            generation++;
            endRuns();
            set(IDLE);
        },
    };
});

/** Credits with blank fields left out: empty means Unknown (props-spec section 10) */
export function withoutEmpty(credits: ModelCredits): ModelCredits {
    const out: ModelCredits = {};
    for (const [key, value] of Object.entries(credits) as [
        keyof ModelCredits,
        string | undefined,
    ][]) {
        const trimmed = typeof value === "string" ? value.trim() : undefined;
        if (trimmed) out[key] = trimmed;
    }
    return out;
}
