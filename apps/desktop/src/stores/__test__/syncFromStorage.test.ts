import { afterEach, describe, expect, it } from "vitest";
import {
    SHORTCUT_OVERRIDES_STORAGE_KEY,
    useShortcutOverridesStore,
} from "@/stores/ShortcutOverridesStore";
import {
    UI_SETTINGS_STORAGE_KEY,
    useUiSettingsStore,
} from "@/stores/UiSettingsStore";

const fireStorage = (key: string, newValue: string | null) =>
    window.dispatchEvent(new StorageEvent("storage", { key, newValue }));

afterEach(() => {
    localStorage.clear();
    useShortcutOverridesStore.getState().resetAll();
});

describe("cross-window store sync", () => {
    it("applies shortcut overrides written by another window", () => {
        fireStorage(
            SHORTCUT_OVERRIDES_STORAGE_KEY,
            JSON.stringify({ performUndo: ["$mod+u"] }),
        );
        expect(useShortcutOverridesStore.getState().overrides).toEqual({
            performUndo: ["$mod+u"],
        });
    });

    it("applies UI settings written by another window", () => {
        const next = {
            ...useUiSettingsStore.getState().uiSettings,
            showFullDatabasePath: true,
        };
        fireStorage(UI_SETTINGS_STORAGE_KEY, JSON.stringify(next));
        expect(
            useUiSettingsStore.getState().uiSettings.showFullDatabasePath,
        ).toBe(true);
    });

    it("ignores other keys", () => {
        const before = useShortcutOverridesStore.getState().overrides;
        fireStorage("someone-else", "{}");
        expect(useShortcutOverridesStore.getState().overrides).toBe(before);
    });

    it("keeps the current value when the new value is corrupt", () => {
        useShortcutOverridesStore
            .getState()
            .addBinding("performUndo", "$mod+u");
        const before = useShortcutOverridesStore.getState().overrides;
        fireStorage(SHORTCUT_OVERRIDES_STORAGE_KEY, "{not json");
        expect(useShortcutOverridesStore.getState().overrides).toBe(before);
    });

    it("does not write back to localStorage when applying (no echo)", () => {
        localStorage.setItem(SHORTCUT_OVERRIDES_STORAGE_KEY, "sentinel");
        fireStorage(SHORTCUT_OVERRIDES_STORAGE_KEY, JSON.stringify({}));
        expect(localStorage.getItem(SHORTCUT_OVERRIDES_STORAGE_KEY)).toBe(
            "sentinel",
        );
    });
});
