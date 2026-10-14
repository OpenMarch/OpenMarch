import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
    EDITOR_MODE_SETTING,
    initEditorModeStore,
    isBasicMode,
    useEditorMode,
    useEditorModeStore,
    useIsBasicMode,
} from "../EditorModeStore";

type SettingsListener = (change: Record<string, unknown>) => void;

/** A stand-in for the preload's settings bridge (the IPC boundary). */
function stubElectron({
    stored,
    env = {},
}: {
    stored?: unknown;
    env?: { isCI?: boolean; isPlaywrightSession?: boolean };
}) {
    const listeners: SettingsListener[] = [];
    const electron = {
        invoke: vi.fn(async (channel: string, key: string) =>
            channel === "settings:get" && key === EDITOR_MODE_SETTING
                ? stored
                : undefined,
        ),
        send: vi.fn(),
        getEnv: vi.fn(async () => ({
            isCodegen: false,
            isCI: false,
            isPlaywrightSession: false,
            ...env,
        })),
        isPlaywrightSession: false,
        onSettingsChanged: vi.fn((listener: SettingsListener) => {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
        }),
    };
    Object.assign(window, { electron });
    return {
        electron,
        broadcast: (change: Record<string, unknown>) =>
            listeners.forEach((listener) => listener(change)),
    };
}

async function initAndWait() {
    initEditorModeStore();
    await vi.waitFor(() =>
        expect(useEditorModeStore.getState().loaded).toBe(true),
    );
}

beforeEach(() => {
    useEditorModeStore.setState({ mode: null, loaded: false });
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe("EditorModeStore", () => {
    it("is null and not Basic before loading", () => {
        const { result } = renderHook(() => ({
            mode: useEditorMode(),
            basic: useIsBasicMode(),
        }));
        expect(result.current).toEqual({ mode: null, basic: false });
        expect(isBasicMode()).toBe(false);
    });

    it("loads the stored mode", async () => {
        const { electron } = stubElectron({ stored: "basic" });
        await initAndWait();
        expect(electron.invoke).toHaveBeenCalledWith(
            "settings:get",
            EDITOR_MODE_SETTING,
        );
        expect(useEditorModeStore.getState().mode).toBe("basic");
        expect(isBasicMode()).toBe(true);
    });

    it("stays unset when nothing is stored, so the welcome flow asks", async () => {
        stubElectron({ stored: undefined });
        await initAndWait();
        expect(useEditorModeStore.getState().mode).toBeNull();
        expect(isBasicMode()).toBe(false);
    });

    it("ignores a stored value that isn't a mode", async () => {
        stubElectron({ stored: "advanced" });
        await initAndWait();
        expect(useEditorModeStore.getState().mode).toBeNull();
    });

    it.each([{ isCI: true }, { isPlaywrightSession: true }])(
        "defaults to Expert without saving in automated sessions (%o)",
        async (env) => {
            const { electron } = stubElectron({ stored: undefined, env });
            await initAndWait();
            expect(useEditorModeStore.getState().mode).toBe("expert");
            expect(isBasicMode()).toBe(false);
            expect(electron.send).not.toHaveBeenCalled();
        },
    );

    it("keeps a stored choice in automated sessions", async () => {
        stubElectron({ stored: "basic", env: { isCI: true } });
        await initAndWait();
        expect(useEditorModeStore.getState().mode).toBe("basic");
    });

    it("setMode updates the store and saves the setting", async () => {
        const { electron } = stubElectron({ stored: "expert" });
        await initAndWait();
        const { result } = renderHook(() => useIsBasicMode());
        expect(result.current).toBe(false);

        act(() => useEditorModeStore.getState().setMode("basic"));

        expect(result.current).toBe(true);
        expect(electron.send).toHaveBeenCalledWith("settings:set", {
            [EDITOR_MODE_SETTING]: "basic",
        });
    });

    it("follows a change made in another window", async () => {
        const { broadcast } = stubElectron({ stored: "expert" });
        await initAndWait();
        broadcast({ [EDITOR_MODE_SETTING]: "basic" });
        expect(useEditorModeStore.getState().mode).toBe("basic");
        broadcast({ language: "fr" });
        expect(useEditorModeStore.getState().mode).toBe("basic");
    });
});
