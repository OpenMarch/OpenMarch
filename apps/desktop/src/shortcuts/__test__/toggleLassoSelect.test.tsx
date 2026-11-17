import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import en from "../../../i18n/en.json";
import tolgee from "@/global/singletons/Tolgee";
import { useFieldSelectToolStore } from "@/field/fieldSelectTool";
import { useInputModeStore } from "@/stores/InputModeStore";
import { ACTIONS } from "../definitions";
import { findConflicts } from "../keymap";
import ShortcutDispatcher from "../ShortcutDispatcher";
import { getActionPaletteItems } from "../palette/actionSource";
import { useCursorActionHandlers } from "../handlers/useCursorActionHandlers";

/**
 * V switches the field's Select tool between Box and Lasso, as the Select bar at the field's top
 * right does (L is Shape › Line). The palette names the tool it would pick. The touch layout hides
 * the bar, so there the action isn't offered at all.
 */

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

const tool = () => useFieldSelectToolStore.getState().tool;
const paletteItem = () =>
    getActionPaletteItems({ t }, {}).find(
        (i) => i.id === "action:toggleLassoSelect",
    );
const pressV = () => {
    fireEvent.keyDown(window, { key: "v", code: "KeyV" });
    fireEvent.keyUp(window, { key: "v", code: "KeyV" });
};

function Handlers() {
    useCursorActionHandlers();
    return null;
}

const renderApp = () =>
    render(
        <QueryClientProvider client={new QueryClient()}>
            <Handlers />
            <ShortcutDispatcher />
        </QueryClientProvider>,
    );

beforeAll(async () => {
    await tolgee.run();
});

afterEach(() => {
    cleanup();
    act(() => {
        useInputModeStore.setState({ mode: "pointer" });
        useFieldSelectToolStore.getState().setTool("box");
    });
    localStorage.clear();
});

describe("Toggle lasso select", () => {
    it("is bound to V, with no conflict on any platform", () => {
        expect(ACTIONS.toggleLassoSelect.defaultBindings).toEqual(["V"]);
        for (const isMac of [false, true]) {
            const conflicts = findConflicts({}, ACTIONS, isMac);
            expect(
                conflicts.filter((c) =>
                    c.actionIds.includes("toggleLassoSelect"),
                ),
            ).toEqual([]);
        }
    });

    it("switches to Lasso and back from the key", () => {
        renderApp();
        expect(tool()).toBe("box");
        act(pressV);
        expect(tool()).toBe("lasso");
        act(pressV);
        expect(tool()).toBe("box");
    });

    it("names the tool it would pick in the palette", () => {
        renderApp();
        expect(paletteItem()?.label).toBe("Use lasso select");
        act(() => {
            void paletteItem()!.run();
        });
        expect(tool()).toBe("lasso");
        expect(paletteItem()?.label).toBe("Use box select");
    });

    it("isn't offered in the touch layout, where the pill's drag modes pick", () => {
        act(() => {
            useInputModeStore.setState({ mode: "touch" });
        });
        renderApp();
        expect(paletteItem()).toBeUndefined();
        act(pressV);
        expect(tool()).toBe("box");
    });
});
