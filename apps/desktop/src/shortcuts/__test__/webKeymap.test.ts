// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/** The web build (`isWebBuild`) changes some default bindings; load them as it does. */
async function loadWebKeymap() {
    vi.stubEnv("VITE_PUBLIC_WEB_BUILD", "true");
    vi.resetModules();
    const keymap = await import("../keymap");
    const definitions = await import("../definitions");
    return { ...keymap, ...definitions };
}

describe("web build shortcuts", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("shipped defaults have no conflicts", async () => {
        const { findConflicts } = await loadWebKeymap();
        expect(findConflicts()).toEqual([]);
    });

    it("binds Cmd/Ctrl+S to saving and moves swap off it", async () => {
        const { getEffectiveBindings } = await loadWebKeymap();
        expect(getEffectiveBindings("launchSaveFileDialogue")).toEqual([
            "$mod+S",
        ]);
        expect(getEffectiveBindings("launchLoadFileDialogue")).toEqual([
            "$mod+O",
        ]);
        expect(getEffectiveBindings("swapMarchers")).toEqual(["$mod+Shift+S"]);
    });
});
