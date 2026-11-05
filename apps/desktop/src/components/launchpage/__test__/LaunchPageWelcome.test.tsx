import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { ThemeProvider } from "@/context/ThemeContext";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import { useAnalyticsQuestionStore } from "@/stores/AnalyticsQuestionStore";
import LaunchPage from "../LaunchPage";

// The title bar reads the open show's path; it isn't what these tests are about.
vi.mock("@/components/titlebar/TitleBar", () => ({ default: () => null }));

/** The preload's bridge: a mode stored, the analytics question never answered. */
function stubElectron() {
    const settings: Record<string, unknown> = { editorMode: "basic" };
    const electron = new Proxy(
        {
            invoke: vi.fn(async (_c: string, key: string) => settings[key]),
            send: vi.fn(),
            getTheme: vi.fn(async () => "light"),
            setTheme: vi.fn(async () => undefined),
            getRecentFiles: vi.fn(async () => []),
            getPendingNewShowDialog: vi.fn(async () => false),
            clearPendingNewShowDialog: vi.fn(async () => undefined),
            onNewShowOpen: vi.fn(() => () => {}),
            onSettingsChanged: vi.fn(() => () => {}),
            getEnv: vi.fn(async () => ({})),
        } as Record<string, unknown>,
        {
            // Anything else the title bar asks for: a harmless function.
            get: (target, key: string) =>
                key in target ? target[key] : vi.fn(async () => undefined),
        },
    );
    Object.assign(window, { electron });
    return electron;
}

function renderLaunchPage() {
    render(
        <QueryClientProvider client={new QueryClient()}>
            <TolgeeProvider tolgee={tolgee} fallback="">
                <ThemeProvider>
                    <LaunchPage setDatabaseIsReady={() => {}} />
                </ThemeProvider>
            </TolgeeProvider>
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    stubElectron();
    useEditorModeStore.setState({ mode: "basic", loaded: true });
});
afterEach(() => {
    vi.restoreAllMocks();
    useAnalyticsQuestionStore.setState({ status: "loading" });
});

describe("LaunchPage and the analytics question", () => {
    it("opens the welcome flow at the analytics step, with no modal, when a mode is stored but analytics is unanswered", async () => {
        useAnalyticsQuestionStore.setState({ status: "unanswered" });
        renderLaunchPage();

        expect(
            await screen.findByTestId("welcome-analytics-opt-in"),
        ).toBeInTheDocument();
        expect(screen.queryByTestId("welcome-greeting")).toBeNull();
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("shows the launch page once analytics is answered", async () => {
        useAnalyticsQuestionStore.setState({ status: "answered" });
        renderLaunchPage();

        await waitFor(() =>
            expect(screen.queryByTestId("welcome-flow")).toBeNull(),
        );
        expect(screen.queryByTestId("welcome-analytics-opt-in")).toBeNull();
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
