import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../../i18n/en.json";
import { getActionDefinition } from "@/shortcuts/definitions";
import { runAction } from "@/shortcuts/registry";
import { searchItems } from "@/shortcuts/search";
import { getActionPaletteItems } from "@/shortcuts/palette/actionSource";
import { useUiActionHandlers } from "@/shortcuts/handlers/useUiActionHandlers";

/** Looks a key up in en.json, as the app's `t` does in English (the key itself when missing). */
const t = (key: string): string => {
    const value = key
        .split(".")
        .reduce<unknown>(
            (node, part) => (node as Record<string, unknown>)?.[part],
            en,
        );
    return typeof value === "string" ? value : key;
};

describe("openView3d", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("opens the 3D View window", () => {
        const openView3d = vi.fn().mockResolvedValue(undefined);
        Object.assign(window, { electron: { openView3d } });
        renderHook(() => useUiActionHandlers());
        expect(runAction("openView3d")).toBe(true);
        expect(openView3d).toHaveBeenCalledOnce();
    });

    it("has no default shortcut", () => {
        expect(getActionDefinition("openView3d").defaultBindings).toEqual([]);
    });

    it.each(["3d", "stadium", "open 3d view"])(
        'is found in the command palette by "%s"',
        (query) => {
            Object.assign(window, { electron: { openView3d: vi.fn() } });
            renderHook(() => useUiActionHandlers());
            const items = getActionPaletteItems({ t }, {});
            const matches = searchItems(items, query, (item) => [
                item.label,
                item.group,
                ...(item.keywords ?? []),
            ]);
            const match = matches.find(
                (item) => item.id === "action:openView3d",
            );
            expect(match?.label).toBe("Open 3D View");
            expect(match?.disabled).toBe(false);
        },
    );
});
