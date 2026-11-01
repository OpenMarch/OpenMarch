import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import {
    isSnapOn,
    UI_SETTINGS_STORAGE_KEY,
    useUiSettingsStore,
} from "../UiSettingsStore";

/**
 * The Snap toggle (modifier roles, version A: "No snap is a toggle, not a key") sits with Lock X
 * and Lock Y in the UI settings, on by default, but is never kept: not across a restart and not
 * when a file opens, so a forgotten toggle doesn't leave a show off the half steps.
 */

const stored = () =>
    JSON.parse(localStorage.getItem(UI_SETTINGS_STORAGE_KEY) ?? "{}") as Record<
        string,
        unknown
    >;

afterEach(() => {
    act(() => {
        useUiSettingsStore.getState().setSnap(true);
    });
    localStorage.clear();
    vi.resetModules();
});

describe("the Snap toggle", () => {
    it("is on by default", () => {
        expect(useUiSettingsStore.getState().uiSettings.snap).toBe(true);
    });

    it("turns off and on, and toggles with no argument", () => {
        const { setSnap } = useUiSettingsStore.getState();
        act(() => {
            setSnap(false);
        });
        expect(useUiSettingsStore.getState().uiSettings.snap).toBe(false);
        act(() => {
            setSnap();
        });
        expect(useUiSettingsStore.getState().uiSettings.snap).toBe(true);
        act(() => {
            setSnap();
        });
        expect(useUiSettingsStore.getState().uiSettings.snap).toBe(false);
    });

    it("is read as it is now through isSnapOn", () => {
        expect(isSnapOn()).toBe(true);
        act(() => {
            useUiSettingsStore.getState().setSnap(false);
        });
        expect(isSnapOn()).toBe(false);
    });

    it("is never saved, whichever way the settings are saved", () => {
        const { setSnap, setUiSettings, setTimelineCompact } =
            useUiSettingsStore.getState();
        act(() => {
            setSnap(false);
        });
        act(() => {
            setUiSettings({
                ...useUiSettingsStore.getState().uiSettings,
                gridLines: false,
            });
        });
        expect(stored().gridLines).toBe(false);
        expect(stored()).not.toHaveProperty("snap");

        act(() => {
            setTimelineCompact();
        });
        expect(stored()).not.toHaveProperty("snap");

        act(() => {
            useUiSettingsStore.getState().fetchUiSettings();
        });
        expect(stored()).not.toHaveProperty("snap");
        expect(useUiSettingsStore.getState().uiSettings.snap).toBe(false);
    });

    it("ignores a stored value when the app loads", async () => {
        localStorage.setItem(
            UI_SETTINGS_STORAGE_KEY,
            JSON.stringify({ snap: false, gridLines: false }),
        );
        vi.resetModules();
        const fresh = await import("../UiSettingsStore");
        const { uiSettings } = fresh.useUiSettingsStore.getState();
        expect(uiSettings.gridLines).toBe(false);
        expect(uiSettings.snap).toBe(true);
    });

    it("keeps its own value when another window saves the settings", () => {
        act(() => {
            useUiSettingsStore.getState().setSnap(false);
        });
        act(() => {
            window.dispatchEvent(
                new StorageEvent("storage", {
                    key: UI_SETTINGS_STORAGE_KEY,
                    newValue: JSON.stringify({ snap: true, gridLines: false }),
                }),
            );
        });
        const { uiSettings } = useUiSettingsStore.getState();
        expect(uiSettings.gridLines).toBe(false);
        expect(uiSettings.snap).toBe(false);
    });
});
