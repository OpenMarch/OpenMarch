import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { MenuActions } from "@/shortcuts/ActionHandlers";
import { runAction } from "@/shortcuts/registry";
import { useWhatsNewDialogStore } from "@/stores/WhatsNewDialogStore";
import WhatsNewDialog from "../WhatsNewDialog";
import { WHATS_NEW_SLIDES } from "../whatsNewSlides";

/** The preload's bridge (the IPC boundary): records every write, and hands back the menu's listener. */
function stubElectron() {
    let menuListener: ((action: string) => void) | null = null;
    const electron = {
        invoke: vi.fn(async () => undefined),
        send: vi.fn(),
        setTheme: vi.fn(async () => undefined),
        setLanguage: vi.fn(async () => undefined),
        onMenuAction: vi.fn((listener: (action: string) => void) => {
            menuListener = listener;
            return () => {
                menuListener = null;
            };
        }),
    };
    Object.assign(window, { electron });
    return {
        electron,
        /** The app menu sending an item, as the main process does */
        menu: (action: string) => act(() => menuListener?.(action)),
    };
}

function renderApp() {
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <MenuActions />
            <WhatsNewDialog />
        </TolgeeProvider>,
    );
}

/** Nothing the walkthrough could store: settings, theme, language. */
function expectNothingStored(
    electron: ReturnType<typeof stubElectron>["electron"],
) {
    expect(electron.send).not.toHaveBeenCalled();
    expect(electron.setTheme).not.toHaveBeenCalled();
    expect(electron.setLanguage).not.toHaveBeenCalled();
    expect(electron.invoke).not.toHaveBeenCalledWith(
        expect.stringMatching(/set/),
        expect.anything(),
    );
}

beforeEach(() => useWhatsNewDialogStore.setState({ open: false }));
afterEach(() => vi.restoreAllMocks());

describe("What's new from the menu", () => {
    it("opens the walkthrough from Help › What's new, on its first slide, and Skip closes it storing nothing", async () => {
        const { electron, menu } = stubElectron();
        renderApp();
        expect(screen.queryByTestId("whats-new-dialog")).toBeNull();

        menu("showWhatsNew");
        const dialog = await screen.findByTestId("whats-new-dialog");
        expect(screen.getByText("What's new in 0.2")).toBeInTheDocument();
        expect(
            dialog.querySelector(
                `[data-testid="whats-new-slide-${WHATS_NEW_SLIDES[0].id}"]`,
            ),
        ).not.toBeNull();
        // Only the slides: none of the welcome flow's other steps
        expect(screen.queryByTestId("welcome-language-options")).toBeNull();
        expect(screen.queryByTestId("editor-mode-card-basic")).toBeNull();
        expect(screen.queryByTestId("welcome-analytics-opt-in")).toBeNull();
        // Nothing before the first slide
        expect(screen.getByTestId("whats-new-back")).toBeDisabled();

        fireEvent.click(screen.getByTestId("whats-new-skip"));
        await waitFor(() =>
            expect(screen.queryByTestId("whats-new-dialog")).toBeNull(),
        );
        expectNothingStored(electron);
    });

    it("runs to the last slide, whose Done closes it, and opens again from the start (the web menu runs the same action)", async () => {
        const { electron } = stubElectron();
        renderApp();

        act(() => {
            runAction("showWhatsNew");
        });
        await screen.findByTestId("whats-new-dialog");
        for (let i = 1; i < WHATS_NEW_SLIDES.length; i++)
            fireEvent.click(screen.getByTestId("whats-new-next"));
        const last = WHATS_NEW_SLIDES.at(-1)!;
        await screen.findByTestId(`whats-new-slide-${last.id}`);
        expect(screen.getByTestId("whats-new-next")).toHaveTextContent("Done");
        fireEvent.click(screen.getByTestId("whats-new-next"));
        await waitFor(() =>
            expect(screen.queryByTestId("whats-new-dialog")).toBeNull(),
        );

        act(() => {
            runAction("showWhatsNew");
        });
        await screen.findByTestId(`whats-new-slide-${WHATS_NEW_SLIDES[0].id}`);
        expectNothingStored(electron);
    });

    it("closes on Escape, storing nothing", async () => {
        const { electron, menu } = stubElectron();
        renderApp();
        menu("showWhatsNew");
        await screen.findByTestId("whats-new-dialog");

        fireEvent.keyDown(window, { key: "Escape" });
        await waitFor(() =>
            expect(screen.queryByTestId("whats-new-dialog")).toBeNull(),
        );
        expectNothingStored(electron);
    });

    it("ignores menu actions it doesn't know", async () => {
        const { menu } = stubElectron();
        renderApp();
        menu("deleteEverything");
        expect(screen.queryByTestId("whats-new-dialog")).toBeNull();
    });
});
