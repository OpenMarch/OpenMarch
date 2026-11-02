// cspell:words Hola futuro diseño

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { ThemeProvider } from "@/context/ThemeContext";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import { useWebWelcomeStore } from "@/stores/WebWelcomeStore";
import { APP_LANGUAGES } from "@/utilities/languages";
import WelcomeFlow from "../WelcomeFlow";

// The web build flag, switchable per test.
const webBuild = vi.hoisted(() => ({ isWeb: false }));
vi.mock("@/utilities/webBuild", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/utilities/webBuild")>()),
    get isWebBuild() {
        return webBuild.isWeb;
    },
}));

/**
 * Stands in for the preload's settings bridge (the IPC boundary). `language`
 * is the stored setting: undefined when it was never chosen.
 */
function stubElectron(optOutAnalytics: unknown, language?: string) {
    const settings: Record<string, unknown> = { optOutAnalytics, language };
    const electron = {
        invoke: vi.fn(async (_channel: string, key: string) => settings[key]),
        send: vi.fn(),
        getTheme: vi.fn(async () => "dark"),
        setTheme: vi.fn(async () => undefined),
        setLanguage: vi.fn(async () => undefined),
    };
    Object.assign(window, { electron });
    return electron;
}

function renderFlow() {
    const onFinish = vi.fn();
    const reload = vi.fn();
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <ThemeProvider>
                <WelcomeFlow onFinish={onFinish} reload={reload} />
            </ThemeProvider>
        </TolgeeProvider>,
    );
    return { onFinish, reload };
}

const continueButton = () => screen.getByTestId("welcome-continue");

/** From the welcome page through language and theme to the mode step. */
async function goToModeStep() {
    expect(await screen.findByTestId("welcome-greeting")).toBeInTheDocument();
    fireEvent.click(continueButton());
    await screen.findByTestId("welcome-language-options");
    fireEvent.click(continueButton());
    await screen.findByTestId("welcome-theme-options");
    fireEvent.click(continueButton());
    return screen.findByTestId("editor-mode-card-basic");
}

function setSystemLanguages(languages: string[]) {
    Object.defineProperty(navigator, "languages", {
        value: languages,
        configurable: true,
    });
}

beforeEach(() => {
    useEditorModeStore.setState({ mode: null, loaded: true });
    setSystemLanguages(["en-US"]);
});
afterEach(async () => {
    vi.restoreAllMocks();
    webBuild.isWeb = false;
    // Back to jsdom's own navigator.languages.
    delete (navigator as { languages?: unknown }).languages;
    await tolgee.changeLanguage("en");
});

describe("WelcomeFlow", () => {
    it("needs a mode before Continue, then asks about analytics", async () => {
        const electron = stubElectron(undefined);
        const { onFinish, reload } = renderFlow();

        const basic = await goToModeStep();
        expect(basic).toHaveAttribute("aria-checked", "false");
        expect(screen.getByTestId("editor-mode-card-expert")).toHaveAttribute(
            "aria-checked",
            "false",
        );
        expect(continueButton()).toBeDisabled();

        fireEvent.click(basic);
        expect(basic).toHaveAttribute("aria-checked", "true");
        expect(continueButton()).toBeEnabled();
        fireEvent.click(continueButton());

        fireEvent.click(await screen.findByTestId("welcome-analytics-opt-out"));
        expect(useEditorModeStore.getState().mode).toBe("basic");
        expect(electron.send).toHaveBeenCalledWith("settings:set", {
            editorMode: "basic",
        });
        expect(electron.send).toHaveBeenCalledWith("settings:set", {
            optOutAnalytics: true,
        });
        expect(onFinish).toHaveBeenCalledWith({ willReload: true });
        expect(reload).toHaveBeenCalled();
    });

    it("skips the analytics step when it was already answered", async () => {
        const electron = stubElectron(false);
        const { onFinish, reload } = renderFlow();
        await waitFor(() => expect(electron.invoke).toHaveBeenCalled());

        await goToModeStep();
        fireEvent.click(screen.getByTestId("editor-mode-card-expert"));
        await waitFor(() => expect(continueButton()).toBeEnabled());
        fireEvent.click(continueButton());

        expect(screen.queryByTestId("welcome-analytics-opt-in")).toBeNull();
        expect(useEditorModeStore.getState().mode).toBe("expert");
        expect(electron.send).toHaveBeenCalledTimes(1);
        expect(onFinish).toHaveBeenCalledWith({ willReload: false });
        expect(reload).not.toHaveBeenCalled();
    });

    // Vitest runs with import.meta.env.DEV, so the dev-only button shows.
    it("dev skip saves Expert and answers an open analytics question no", async () => {
        const electron = stubElectron(undefined);
        useWebWelcomeStore.setState({ open: true });
        const { onFinish, reload } = renderFlow();
        await waitFor(() => expect(electron.invoke).toHaveBeenCalled());

        fireEvent.click(await screen.findByTestId("welcome-dev-skip"));

        expect(useWebWelcomeStore.getState().open).toBe(false);
        expect(useEditorModeStore.getState().mode).toBe("expert");
        expect(electron.send).toHaveBeenCalledWith("settings:set", {
            editorMode: "expert",
        });
        expect(electron.send).toHaveBeenCalledWith("settings:set", {
            optOutAnalytics: true,
        });
        expect(onFinish).toHaveBeenCalledWith({ willReload: true });
        expect(reload).toHaveBeenCalled();
    });

    it("dev skip keeps an analytics answer and doesn't reload", async () => {
        const electron = stubElectron(false);
        const { onFinish, reload } = renderFlow();
        await waitFor(() => expect(electron.invoke).toHaveBeenCalled());

        await goToModeStep();
        fireEvent.click(screen.getByTestId("welcome-dev-skip"));

        expect(useEditorModeStore.getState().mode).toBe("expert");
        expect(electron.send).toHaveBeenCalledTimes(1);
        expect(onFinish).toHaveBeenCalledWith({ willReload: false });
        expect(reload).not.toHaveBeenCalled();
    });

    it("dev skip on the web closes the web welcome and saves no analytics", async () => {
        webBuild.isWeb = true;
        const electron = stubElectron(undefined);
        useWebWelcomeStore.setState({ open: true });
        const { onFinish, reload } = renderFlow();

        fireEvent.click(await screen.findByTestId("welcome-dev-skip"));

        expect(useWebWelcomeStore.getState().open).toBe(false);
        expect(useEditorModeStore.getState().mode).toBe("expert");
        expect(electron.send).toHaveBeenCalledTimes(1);
        expect(onFinish).toHaveBeenCalledWith({ willReload: false });
        expect(reload).not.toHaveBeenCalled();
    });

    it("dev skip waits for the analytics setting off the web", async () => {
        const electron = stubElectron(true);
        let answer: (value: unknown) => void = () => {};
        electron.invoke.mockImplementation(async (_channel, key) =>
            key === "optOutAnalytics"
                ? new Promise((resolve) => (answer = resolve))
                : undefined,
        );
        renderFlow();

        const skip = await screen.findByTestId("welcome-dev-skip");
        expect(skip).toBeDisabled();
        answer(false);
        await waitFor(() => expect(skip).toBeEnabled());
    });

    it("switches and saves the language and theme as they are picked", async () => {
        const electron = stubElectron(false);
        renderFlow();

        fireEvent.click(await screen.findByTestId("welcome-continue"));
        fireEvent.click(await screen.findByTestId("welcome-language-fr"));
        expect(electron.setLanguage).toHaveBeenCalledWith("fr");
        await waitFor(() => expect(tolgee.getLanguage()).toBe("fr"));
        expect(screen.getByTestId("welcome-language-fr")).toHaveAttribute(
            "aria-checked",
            "true",
        );

        fireEvent.click(continueButton());
        fireEvent.click(await screen.findByTestId("welcome-theme-light"));
        expect(electron.setTheme).toHaveBeenCalledWith("light");
        expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    it("starts on the system's language and saves it on Continue", async () => {
        setSystemLanguages(["es-MX", "en-US"]);
        const electron = stubElectron(false);
        renderFlow();

        fireEvent.click(await screen.findByTestId("welcome-continue"));
        expect(
            await screen.findByTestId("welcome-language-es"),
        ).toHaveAttribute("aria-checked", "true");
        expect(electron.setLanguage).not.toHaveBeenCalled();

        fireEvent.click(continueButton());
        expect(electron.setLanguage).toHaveBeenCalledWith("es");
        await screen.findByTestId("welcome-theme-options");
    });

    it("keeps a saved language, even English, instead of the system's", async () => {
        setSystemLanguages(["es-MX", "en-US"]);
        const electron = stubElectron(false, "en");
        renderFlow();

        fireEvent.click(await screen.findByTestId("welcome-continue"));
        await waitFor(() =>
            expect(screen.getByTestId("welcome-language-en")).toHaveAttribute(
                "aria-checked",
                "true",
            ),
        );
        fireEvent.click(continueButton());
        await screen.findByTestId("welcome-theme-options");
        expect(electron.setLanguage).not.toHaveBeenCalled();
        expect(tolgee.getLanguage()).toBe("en");
    });

    it("follows the saved language when it is applied after the flow opens", async () => {
        const electron = stubElectron(false, "fr");
        renderFlow();
        fireEvent.click(await screen.findByTestId("welcome-continue"));
        await screen.findByTestId("welcome-language-options");

        // main.tsx applies the stored language once it has loaded.
        await tolgee.changeLanguage("fr");
        await waitFor(() =>
            expect(screen.getByTestId("welcome-language-fr")).toHaveAttribute(
                "aria-checked",
                "true",
            ),
        );
        fireEvent.click(continueButton());
        await screen.findByTestId("welcome-theme-options");
        expect(electron.setLanguage).not.toHaveBeenCalled();
        expect(tolgee.getLanguage()).toBe("fr");
    });

    it("doesn't undo a language changed in Settings during the flow", async () => {
        setSystemLanguages(["es-MX", "en-US"]);
        const electron = stubElectron(false);
        renderFlow();
        fireEvent.click(await screen.findByTestId("welcome-continue"));
        await screen.findByTestId("welcome-language-options");

        // The Settings window saves Japanese and broadcasts it.
        await tolgee.changeLanguage("ja");
        await waitFor(() =>
            expect(screen.getByTestId("welcome-language-ja")).toHaveAttribute(
                "aria-checked",
                "true",
            ),
        );
        fireEvent.click(continueButton());
        await screen.findByTestId("welcome-theme-options");
        expect(electron.setLanguage).not.toHaveBeenCalled();
        expect(tolgee.getLanguage()).toBe("ja");
    });

    it("shows the welcome page in every language, starting on the suggested one", async () => {
        setSystemLanguages(["es-MX", "en-US"]);
        stubElectron(false);
        renderFlow();

        const description = await screen.findByTestId("welcome-description");
        await waitFor(() =>
            expect(description.children).toHaveLength(APP_LANGUAGES.length),
        );
        const active = () => description.querySelector("[data-active]");
        await waitFor(() => expect(active()).toHaveAttribute("lang", "es"));
        expect(active()?.textContent).toMatch(/futuro del diseño/);
        const greeting = screen.getByTestId("welcome-greeting");
        expect(greeting.querySelector("[data-active]")?.textContent).toBe(
            "Hola",
        );

        // The next step is in the app's language again.
        fireEvent.click(continueButton());
        expect(
            await screen.findByText("Choose your language"),
        ).toBeInTheDocument();
    });
});
