import {
    act,
    cleanup,
    render,
    renderHook,
    screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TolgeeProvider } from "@tolgee/react";
import type { ReactNode } from "react";
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import { ACTIONS } from "../definitions";
import CommandPalette from "../palette/CommandPalette";
import { runAction } from "../registry";
import { useUiActionHandlers } from "../handlers/useUiActionHandlers";

/**
 * Tablet 0.6 (#846): Basic or Expert is a registered action, so the command palette (and so a
 * tablet) can switch it. It goes through the store's `setMode`, as Settings › Timeline does,
 * which saves the choice to the app settings.
 */

const Providers = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            {children}
        </TolgeeProvider>
    </QueryClientProvider>
);

const mode = () => useEditorModeStore.getState().mode;
const send = vi.fn();

beforeAll(async () => {
    // jsdom has no layout, so it doesn't implement scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
    await tolgee.run();
});

beforeEach(() => {
    send.mockClear();
    (window as unknown as { electron: { send: typeof send } }).electron = {
        send,
    };
});

afterEach(() => {
    cleanup();
    useEditorModeStore.setState({ mode: null, loaded: false });
    delete (window as unknown as { electron?: unknown }).electron;
    localStorage.clear();
});

function Handlers() {
    useUiActionHandlers();
    return null;
}

function paletteLabels() {
    render(
        <Providers>
            <Handlers />
            <CommandPalette />
        </Providers>,
    );
    act(() => {
        runAction("openCommandPalette");
    });
    return screen.getAllByRole("option").map((o) => o.textContent ?? "");
}

describe("Switch between Basic and Expert", () => {
    it("has no default key and works in Basic too", () => {
        expect(ACTIONS.toggleEditorMode.defaultBindings).toEqual([]);
        expect(
            (ACTIONS.toggleEditorMode as { expertOnly?: boolean }).expertOnly,
        ).toBeUndefined();
    });

    it("switches Expert to Basic and back, saving each choice as the setting does", () => {
        useEditorModeStore.setState({ mode: "expert", loaded: true });
        renderHook(() => useUiActionHandlers(), { wrapper: Providers });

        act(() => {
            runAction("toggleEditorMode");
        });
        expect(mode()).toBe("basic");
        expect(send).toHaveBeenLastCalledWith("settings:set", {
            editorMode: "basic",
        });

        act(() => {
            runAction("toggleEditorMode");
        });
        expect(mode()).toBe("expert");
        expect(send).toHaveBeenLastCalledWith("settings:set", {
            editorMode: "expert",
        });
    });

    it("treats an unset mode as Expert, so it switches to Basic", () => {
        useEditorModeStore.setState({ mode: null, loaded: true });
        renderHook(() => useUiActionHandlers(), { wrapper: Providers });
        act(() => {
            runAction("toggleEditorMode");
        });
        expect(mode()).toBe("basic");
    });

    it("is in the palette, naming the mode that is on", () => {
        useEditorModeStore.setState({ mode: "expert", loaded: true });
        expect(paletteLabels()).toContain("Switch to Basic (Expert is on)");
        cleanup();

        useEditorModeStore.setState({ mode: "basic", loaded: true });
        expect(paletteLabels()).toContain("Switch to Expert (Basic is on)");
    });
});
