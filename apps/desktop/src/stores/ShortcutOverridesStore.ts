import { create } from "zustand";
import type { ActionId } from "@/shortcuts/definitions";
import {
    normalizeOverrides,
    withBinding,
    withoutBinding,
    type ShortcutOverrides,
} from "@/shortcuts/keymap";
import { isMacPlatform } from "@/shortcuts/platform";

export const SHORTCUT_OVERRIDES_STORAGE_KEY = "openmarch:shortcutOverrides";

function loadOverrides(): ShortcutOverrides {
    try {
        const stored = localStorage.getItem(SHORTCUT_OVERRIDES_STORAGE_KEY);
        return stored ? normalizeOverrides(JSON.parse(stored)) : {};
    } catch (error) {
        console.error("Failed to load shortcut overrides:", error);
        return {};
    }
}

function saveOverrides(overrides: ShortcutOverrides): void {
    try {
        localStorage.setItem(
            SHORTCUT_OVERRIDES_STORAGE_KEY,
            JSON.stringify(overrides),
        );
    } catch (error) {
        console.error("Failed to save shortcut overrides:", error);
    }
}

interface ShortcutOverridesStore {
    /** Only the actions whose bindings differ from their defaults. */
    overrides: ShortcutOverrides;
    /** Adds a binding, first removing it from `takeFrom` when the user chose to reassign it. */
    addBinding: (
        id: ActionId,
        binding: string,
        takeFrom?: readonly ActionId[],
    ) => void;
    removeBinding: (id: ActionId, binding: string) => void;
    resetAction: (id: ActionId) => void;
    resetAll: () => void;
}

export const useShortcutOverridesStore = create<ShortcutOverridesStore>(
    (set, get) => {
        const update = (overrides: ShortcutOverrides) => {
            set({ overrides });
            saveOverrides(overrides);
        };
        return {
            overrides: loadOverrides(),
            addBinding: (id, binding, takeFrom = []) =>
                update(
                    withBinding(
                        get().overrides,
                        id,
                        binding,
                        isMacPlatform(),
                        takeFrom,
                    ),
                ),
            removeBinding: (id, binding) =>
                update(
                    withoutBinding(
                        get().overrides,
                        id,
                        binding,
                        isMacPlatform(),
                    ),
                ),
            resetAction: (id) => {
                const { [id]: _removed, ...rest } = get().overrides;
                update(rest);
            },
            resetAll: () => update({}),
        };
    },
);
