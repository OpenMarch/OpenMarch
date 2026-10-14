import { create } from "zustand";

/**
 * Basic or Expert (UI-19). An app setting, not a file setting: switching it
 * never writes the open show.
 */
export type EditorMode = "basic" | "expert";

/** The electron-store key. Unset means the person hasn't chosen yet. */
export const EDITOR_MODE_SETTING = "editorMode";

interface EditorModeState {
    /**
     * The mode in use. Null while loading, or when the person hasn't chosen
     * (the welcome flow then asks). Playwright, CI and codegen sessions without
     * a stored choice get "expert" without anything being saved.
     */
    mode: EditorMode | null;
    /** Whether the stored setting has been read. */
    loaded: boolean;
    /** Chooses a mode and saves it to the app settings. */
    setMode(mode: EditorMode): void;
}

export function isEditorMode(value: unknown): value is EditorMode {
    return value === "basic" || value === "expert";
}

export const useEditorModeStore = create<EditorModeState>((set) => ({
    mode: null,
    loaded: false,
    setMode: (mode) => {
        set({ mode, loaded: true });
        window.electron?.send("settings:set", { [EDITOR_MODE_SETTING]: mode });
    },
}));

/** The mode in use, or null while loading or before the person has chosen. */
export function useEditorMode(): EditorMode | null {
    return useEditorModeStore((state) => state.mode);
}

/** True only when the mode is "basic"; loading and unset count as Expert. */
export function useIsBasicMode(): boolean {
    return useEditorModeStore((state) => state.mode === "basic");
}

/** Non-hook read of `useIsBasicMode`, for event handlers and plain functions. */
export function isBasicMode(): boolean {
    return useEditorModeStore.getState().mode === "basic";
}

interface TestEnv {
    isCodegen?: boolean;
    isCI?: boolean;
    isPlaywrightSession?: boolean;
}

/** Automated sessions keep Expert so existing tests behave as before. */
function isAutomatedSession(env: TestEnv | undefined): boolean {
    return Boolean(
        env?.isPlaywrightSession ||
        env?.isCI ||
        env?.isCodegen ||
        window.electron?.isPlaywrightSession,
    );
}

/** Applies a value from another window (the Settings window) if it is a mode. */
function applyExternalChange(value: unknown) {
    if (isEditorMode(value))
        useEditorModeStore.setState({ mode: value, loaded: true });
}

let unsubscribeSettings: (() => void) | undefined;

/**
 * Reads the stored mode and keeps it in sync with other windows. Call once at
 * renderer startup.
 */
export function initEditorModeStore(): void {
    const electron = window.electron;
    if (!electron) {
        useEditorModeStore.setState({ loaded: true });
        return;
    }

    unsubscribeSettings?.();
    unsubscribeSettings = electron.onSettingsChanged?.((change) => {
        if (EDITOR_MODE_SETTING in change)
            applyExternalChange(change[EDITOR_MODE_SETTING]);
    });

    const load = async () => {
        let stored: unknown;
        let env: TestEnv | undefined;
        try {
            [stored, env] = await Promise.all([
                electron.invoke("settings:get", EDITOR_MODE_SETTING),
                electron.getEnv?.() as Promise<TestEnv> | undefined,
            ]);
        } catch (error) {
            console.warn("Failed to load the editor mode setting:", error);
        }
        // A choice made while loading (setMode, another window) wins.
        if (useEditorModeStore.getState().loaded) return;
        const mode: EditorMode | null = isEditorMode(stored)
            ? stored
            : isAutomatedSession(env)
              ? "expert"
              : null;
        useEditorModeStore.setState({ mode, loaded: true });
    };
    void load();
}
