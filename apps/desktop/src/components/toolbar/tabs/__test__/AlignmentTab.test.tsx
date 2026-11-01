import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TolgeeProvider } from "@tolgee/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { useAlignmentActionHandlers } from "@/shortcuts/handlers/useAlignmentActionHandlers";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import AlignmentTab from "../AlignmentTab";

/**
 * The Snap toggle's button sits beside Lock X and Lock Y in the toolbar's alignment tab: a click
 * runs Toggle Snap, and it shows pressed while snapping is off, as the floating editor's Snap
 * button does, so a forgotten off state is in plain sight.
 */

const Providers = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            {children}
        </TolgeeProvider>
    </QueryClientProvider>
);

function Handlers() {
    useAlignmentActionHandlers();
    return null;
}

const snapOn = () => useUiSettingsStore.getState().uiSettings.snap;

beforeAll(async () => {
    await tolgee.run();
});

afterEach(() => {
    cleanup();
    act(() => {
        useUiSettingsStore.getState().setSnap(true);
    });
    localStorage.clear();
});

describe("the toolbar's Snap button", () => {
    it("toggles snapping, and is pressed while it's off", () => {
        render(
            <Providers>
                <Handlers />
                <AlignmentTab />
            </Providers>,
        );
        const button = screen.getByTestId("toolbar-snap-toggle");
        expect(button.getAttribute("aria-pressed")).toBe("false");
        expect(button.classList.contains("text-accent")).toBe(false);
        expect(button.title).toContain("Turn Snap off");

        fireEvent.click(button);
        expect(snapOn()).toBe(false);
        expect(button.getAttribute("aria-pressed")).toBe("true");
        expect(button.classList.contains("text-accent")).toBe(true);
        expect(button.title).toContain("Snap off: turn it back on");

        fireEvent.click(button);
        expect(snapOn()).toBe(true);
        expect(button.getAttribute("aria-pressed")).toBe("false");
    });

    it("follows the toggle changed elsewhere (its key, a file opening)", () => {
        render(
            <Providers>
                <Handlers />
                <AlignmentTab />
            </Providers>,
        );
        act(() => {
            useUiSettingsStore.getState().setSnap(false);
        });
        expect(
            screen
                .getByTestId("toolbar-snap-toggle")
                .getAttribute("aria-pressed"),
        ).toBe("true");
    });
});
