import { afterEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "openmarch:uiSettings";

/** The settings store as a fresh app start would load it from what's saved. */
async function loadStore(saved?: unknown) {
    if (saved !== undefined)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    vi.resetModules();
    const { useUiSettingsStore } = await import("../UiSettingsStore");
    return useUiSettingsStore;
}

afterEach(() => localStorage.clear());

describe("start flag positions settings", () => {
    it("start with selected dots normally and everything while N is held", async () => {
        const store = await loadStore();
        expect(store.getState().uiSettings.startFlagPositions).toEqual({
            always: { dots: "selected", paths: "off" },
            hold: { dots: "all", paths: "all" },
        });
    });

    it("load paths wider than dots narrowed to the dots level", async () => {
        const store = await loadStore({
            startFlagPositions: {
                always: { dots: "off", paths: "all" },
                hold: { dots: "selected", paths: "all" },
            },
        });
        expect(store.getState().uiSettings.startFlagPositions).toEqual({
            always: { dots: "off", paths: "off" },
            hold: { dots: "selected", paths: "selected" },
        });
    });

    it("load unreadable or missing levels as the defaults", async () => {
        const store = await loadStore({
            startFlagPositions: {
                always: { dots: "everyone", paths: 3 },
                hold: null,
            },
        });
        expect(store.getState().uiSettings.startFlagPositions).toEqual({
            always: { dots: "selected", paths: "off" },
            hold: { dots: "all", paths: "all" },
        });
        const partial = await loadStore({
            startFlagPositions: { always: { dots: "all" } },
        });
        expect(partial.getState().uiSettings.startFlagPositions).toEqual({
            always: { dots: "all", paths: "off" },
            hold: { dots: "all", paths: "all" },
        });
    });

    it("set and save paths no wider than dots", async () => {
        const store = await loadStore();
        store.getState().setStartFlagPositions({
            always: { dots: "selected", paths: "all" },
            hold: { dots: "all", paths: "selected" },
        });
        const expected = {
            always: { dots: "selected", paths: "selected" },
            hold: { dots: "all", paths: "selected" },
        };
        expect(store.getState().uiSettings.startFlagPositions).toEqual(
            expected,
        );
        expect(
            JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
                .startFlagPositions,
        ).toEqual(expected);
    });

    it("ignore the old Previous paths setting when loading", async () => {
        const store = await loadStore({ previousPaths: true });
        expect(store.getState().uiSettings).not.toHaveProperty("previousPaths");
    });

    it("ignore the old timeline focus when loading, and don't save it again", async () => {
        const store = await loadStore({ focussedComponent: "timeline" });
        expect(store.getState().uiSettings).not.toHaveProperty(
            "focussedComponent",
        );
        store.getState().setAudioVolume(50);
        expect(
            JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"),
        ).not.toHaveProperty("focussedComponent");
    });
});
