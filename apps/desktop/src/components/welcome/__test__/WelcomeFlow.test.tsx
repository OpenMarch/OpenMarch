// cspell:words Hola futuro diseño

import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { ThemeProvider } from "@/context/ThemeContext";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import { useAnalyticsQuestionStore } from "@/stores/AnalyticsQuestionStore";
import { WHATS_NEW_SLIDES } from "../whatsNewSlides";
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
 * is the stored setting: undefined when it was never chosen. `earlier` is
 * what an earlier OpenMarch left behind: other settings and recent files.
 */
function stubElectron(
    optOutAnalytics: unknown,
    language?: string,
    earlier: {
        theme?: string;
        databasePath?: string;
        recentFiles?: unknown[];
    } = {},
) {
    const settings: Record<string, unknown> = {
        optOutAnalytics,
        language,
        theme: earlier.theme,
        databasePath: earlier.databasePath,
    };
    const electron = {
        invoke: vi.fn(async (_channel: string, key: string) => settings[key]),
        getRecentFiles: vi.fn(async () => earlier.recentFiles ?? []),
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

/** From the welcome page through language, What's new (skipped) and theme to the mode step. */
async function goToModeStep() {
    expect(await screen.findByTestId("welcome-greeting")).toBeInTheDocument();
    fireEvent.click(continueButton());
    await screen.findByTestId("welcome-language-options");
    fireEvent.click(continueButton());
    fireEvent.click(await screen.findByTestId("whats-new-skip"));
    await screen.findByTestId("welcome-theme-options");
    fireEvent.click(continueButton());
    return screen.findByTestId("editor-mode-card-basic");
}

/** Each step's content, to tell where the flow is. */
const STEP_TEST_IDS = {
    "welcome-greeting": "welcome",
    "welcome-whats-new": "whatsNew",
    "welcome-language-options": "language",
    "welcome-theme-options": "theme",
    "editor-mode-card-basic": "mode",
} as const;

async function currentStep(): Promise<string> {
    let found = "";
    await waitFor(() => {
        const testId = Object.keys(STEP_TEST_IDS).find((id) =>
            screen.queryByTestId(id),
        ) as keyof typeof STEP_TEST_IDS | undefined;
        expect(testId).toBeDefined();
        found = STEP_TEST_IDS[testId!];
    });
    return found;
}

/** Continues from the first page to the mode step; returns the steps passed. */
async function stepsToMode(): Promise<string[]> {
    const seen: string[] = [];
    let step = await currentStep();
    while (step !== "mode") {
        seen.push(step);
        // What's new is a walkthrough of its own: Skip leaves it.
        fireEvent.click(
            step === "whatsNew"
                ? screen.getByTestId("whats-new-skip")
                : continueButton(),
        );
        const left = step;
        await waitFor(async () => expect(await currentStep()).not.toBe(left));
        step = await currentStep();
    }
    return seen;
}

function setSystemLanguages(languages: string[]) {
    Object.defineProperty(navigator, "languages", {
        value: languages,
        configurable: true,
    });
}

beforeEach(() => {
    useEditorModeStore.setState({ mode: null, loaded: true });
    useAnalyticsQuestionStore.setState({ status: "loading" });
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

        await stepsToMode();
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

        await stepsToMode();
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
        const waiting: ((value: unknown) => void)[] = [];
        const answer = (value: unknown) => waiting.forEach((r) => r(value));
        electron.invoke.mockImplementation(async (_channel, key) =>
            key === "optOutAnalytics"
                ? new Promise((resolve) => waiting.push(resolve))
                : undefined,
        );
        renderFlow();

        // Until it's read, the page waits (it may be "Welcome back").
        await waitFor(() =>
            expect(electron.invoke).toHaveBeenCalledWith(
                "settings:get",
                "optOutAnalytics",
            ),
        );
        const skip = screen.queryByTestId("welcome-dev-skip");
        if (skip) expect(skip).toBeDisabled();
        answer(false);
        await waitFor(() =>
            expect(screen.getByTestId("welcome-dev-skip")).toBeEnabled(),
        );
    });

    it("switches and saves the language and theme as they are picked", async () => {
        const electron = stubElectron(undefined);
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
        fireEvent.click(await screen.findByTestId("whats-new-skip"));
        fireEvent.click(await screen.findByTestId("welcome-theme-light"));
        expect(electron.setTheme).toHaveBeenCalledWith("light");
        expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    it("starts on the system's language and saves it on Continue", async () => {
        setSystemLanguages(["es-MX", "en-US"]);
        const electron = stubElectron(undefined);
        renderFlow();

        fireEvent.click(await screen.findByTestId("welcome-continue"));
        expect(
            await screen.findByTestId("welcome-language-es"),
        ).toHaveAttribute("aria-checked", "true");
        expect(electron.setLanguage).not.toHaveBeenCalled();

        fireEvent.click(continueButton());
        expect(electron.setLanguage).toHaveBeenCalledWith("es");
        await screen.findByTestId("welcome-whats-new");
    });

    it("keeps a saved language, even English, instead of the system's", async () => {
        setSystemLanguages(["es-MX", "en-US"]);
        const electron = stubElectron(undefined, "en");
        renderFlow();

        fireEvent.click(await screen.findByTestId("welcome-continue"));
        await waitFor(() =>
            expect(screen.getByTestId("welcome-language-en")).toHaveAttribute(
                "aria-checked",
                "true",
            ),
        );
        fireEvent.click(continueButton());
        await screen.findByTestId("welcome-whats-new");
        expect(electron.setLanguage).not.toHaveBeenCalled();
        expect(tolgee.getLanguage()).toBe("en");
    });

    it("follows the saved language when it is applied after the flow opens", async () => {
        const electron = stubElectron(undefined, "fr");
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
        await screen.findByTestId("welcome-whats-new");
        expect(electron.setLanguage).not.toHaveBeenCalled();
        expect(tolgee.getLanguage()).toBe("fr");
    });

    it("doesn't undo a language changed in Settings during the flow", async () => {
        setSystemLanguages(["es-MX", "en-US"]);
        const electron = stubElectron(undefined);
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
        await screen.findByTestId("welcome-whats-new");
        expect(electron.setLanguage).not.toHaveBeenCalled();
        expect(tolgee.getLanguage()).toBe("ja");
    });

    it("shows the welcome page in every language, starting on the suggested one", async () => {
        setSystemLanguages(["es-MX", "en-US"]);
        stubElectron(undefined);
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

    it("welcomes a returning person back and skips what they already chose", async () => {
        const electron = stubElectron(false, "en", {
            theme: "dark",
            recentFiles: [{ path: "/shows/fall.dots" }],
        });
        const { onFinish } = renderFlow();

        const greeting = await screen.findByTestId("welcome-greeting");
        await waitFor(() => expect(greeting.textContent).toBe("Welcome back"));
        expect(continueButton()).toHaveAccessibleName("Continue");

        fireEvent.click(continueButton());
        // The walkthrough: one slide per feature, Next to the end.
        const slideTitles: string[] = [];
        for (const slide of WHATS_NEW_SLIDES) {
            const section = await screen.findByTestId(
                `whats-new-slide-${slide.id}`,
            );
            const title = section.querySelector("h2");
            slideTitles.push(title?.textContent ?? "");
            expect(title).toHaveFocus();
            expect(section.querySelector("video")).toHaveAttribute(
                "aria-label",
            );
            fireEvent.click(screen.getByTestId("whats-new-next"));
        }
        expect(slideTitles).toEqual([
            "The timeline",
            "Shapes",
            "The 3D View",
            "Props",
        ]);

        fireEvent.click(await screen.findByTestId("editor-mode-card-basic"));
        fireEvent.click(continueButton());

        expect(useEditorModeStore.getState().mode).toBe("basic");
        expect(electron.setLanguage).not.toHaveBeenCalled();
        expect(electron.setTheme).not.toHaveBeenCalled();
        expect(onFinish).toHaveBeenCalledWith({ willReload: false });
    });

    it("asks a returning person for the choices they never made", async () => {
        stubElectron(undefined, undefined, {
            databasePath: "/shows/fall.dots",
        });
        renderFlow();

        expect(await stepsToMode()).toEqual([
            "welcome",
            "language",
            "whatsNew",
            "theme",
        ]);
        fireEvent.click(screen.getByTestId("editor-mode-card-expert"));
        fireEvent.click(continueButton());
        expect(
            await screen.findByTestId("welcome-analytics-opt-in"),
        ).toBeInTheDocument();
    });

    it("gives a new person the first-time welcome", async () => {
        stubElectron(undefined);
        renderFlow();

        expect(await stepsToMode()).toEqual([
            "welcome",
            "language",
            "whatsNew",
            "theme",
        ]);
    });

    it("never says welcome back on the web", async () => {
        webBuild.isWeb = true;
        stubElectron(true, "en", { theme: "dark" });
        renderFlow();

        expect(await stepsToMode()).toEqual([
            "welcome",
            "language",
            "whatsNew",
            "theme",
        ]);
    });

    it("shows a new person What's new after the language step, titled with the version; Skip goes on, Back goes back", async () => {
        stubElectron(undefined);
        renderFlow();

        fireEvent.click(await screen.findByTestId("welcome-continue"));
        await screen.findByTestId("welcome-language-options");
        fireEvent.click(continueButton());
        await screen.findByTestId("whats-new-slide-timeline");
        expect(screen.getByText("What's new in 0.2")).toBeInTheDocument();

        // Back on the first slide returns to the language step
        fireEvent.click(screen.getByTestId("whats-new-back"));
        await screen.findByTestId("welcome-language-options");
        fireEvent.click(continueButton());

        // Skip goes on to the theme, and Back from there returns to What's new
        fireEvent.click(await screen.findByTestId("whats-new-skip"));
        await screen.findByTestId("welcome-theme-options");
        fireEvent.click(screen.getByTestId("welcome-back"));
        expect(
            await screen.findByTestId("whats-new-slide-timeline"),
        ).toBeInTheDocument();
    });

    it("moves through What's new with the arrow keys and leaves on Escape", async () => {
        stubElectron(false, "en", { theme: "dark" });
        renderFlow();
        fireEvent.click(await screen.findByTestId("welcome-continue"));
        await screen.findByTestId("whats-new-slide-timeline");

        fireEvent.keyDown(window, { key: "ArrowRight" });
        await screen.findByTestId("whats-new-slide-shapes");
        fireEvent.keyDown(window, { key: "ArrowRight" });
        await screen.findByTestId("whats-new-slide-view3d");
        fireEvent.keyDown(window, { key: "ArrowLeft" });
        await screen.findByTestId("whats-new-slide-shapes");
        // Modified arrows are left alone.
        fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
        expect(
            screen.getByTestId("whats-new-slide-shapes"),
        ).toBeInTheDocument();

        fireEvent.keyDown(window, { key: "Escape" });
        expect(
            await screen.findByTestId("editor-mode-card-basic"),
        ).toBeInTheDocument();
    });

    it("names every What's new step and jumps to one when it's clicked", async () => {
        stubElectron(false, "en", { theme: "dark" });
        renderFlow();
        fireEvent.click(await screen.findByTestId("welcome-continue"));
        await screen.findByTestId("whats-new-slide-timeline");

        const steps = within(screen.getByTestId("whats-new-steps"));
        expect(steps.getByTestId("whats-new-step-timeline")).toHaveTextContent(
            "Timeline",
        );
        expect(steps.getByTestId("whats-new-step-view3d")).toHaveTextContent(
            "3D View",
        );
        expect(steps.getByTestId("whats-new-step-timeline")).toHaveAttribute(
            "aria-current",
            "step",
        );

        fireEvent.click(steps.getByTestId("whats-new-step-props"));
        await screen.findByTestId("whats-new-slide-props");
        expect(steps.getByTestId("whats-new-step-props")).toHaveAttribute(
            "aria-current",
            "step",
        );
        expect(
            steps.getByTestId("whats-new-step-timeline"),
        ).not.toHaveAttribute("aria-current");
    });

    it("shows the last slide's guides link and Continue, and Back to the welcome page from the first", async () => {
        stubElectron(false, "en", { theme: "dark" });
        renderFlow();
        fireEvent.click(await screen.findByTestId("welcome-continue"));
        await screen.findByTestId("whats-new-slide-timeline");
        expect(screen.queryByTestId("whats-new-guides")).toBeNull();
        fireEvent.click(screen.getByTestId("whats-new-back"));
        expect(
            await screen.findByTestId("welcome-greeting"),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByTestId("welcome-continue"));
        for (let i = 1; i < WHATS_NEW_SLIDES.length; i++)
            fireEvent.click(await screen.findByTestId("whats-new-next"));
        await screen.findByTestId("whats-new-slide-props");
        expect(screen.getByTestId("whats-new-guides")).toHaveAttribute(
            "href",
            "https://openmarch.com/guides",
        );
        expect(screen.getByTestId("whats-new-next")).toHaveTextContent(
            "Continue",
        );
    });

    it("shows still pictures instead of videos with reduced motion", async () => {
        const matchMedia = vi.fn((query: string) => ({
            matches: query.includes("prefers-reduced-motion"),
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }));
        Object.assign(window, { matchMedia });
        try {
            stubElectron(false, "en", { theme: "dark" });
            renderFlow();
            fireEvent.click(await screen.findByTestId("welcome-continue"));
            const section = await screen.findByTestId(
                "whats-new-slide-timeline",
            );
            expect(section.querySelector("video")).toBeNull();
            const poster = screen.getByTestId("whats-new-poster");
            expect(poster.tagName).toBe("IMG");
            expect(poster.getAttribute("alt")).toMatch(/20 marchers/);
        } finally {
            delete (window as { matchMedia?: unknown }).matchMedia;
        }
    });

    it("asks only about analytics when a mode is already stored", async () => {
        useEditorModeStore.setState({ mode: "basic", loaded: true });
        useAnalyticsQuestionStore.setState({ status: "unanswered" });
        const electron = stubElectron(undefined, "en", {
            recentFiles: [{ path: "/shows/fall.dots" }],
        });
        const { onFinish, reload } = renderFlow();

        expect(
            await screen.findByTestId("welcome-analytics-opt-in"),
        ).toBeInTheDocument();
        // One short screen: no welcome page, no Back, no step count.
        expect(screen.queryByTestId("welcome-greeting")).toBeNull();
        expect(screen.queryByTestId("welcome-back")).toBeNull();
        expect(screen.queryByText(/Step \d of/)).toBeNull();

        fireEvent.click(screen.getByTestId("welcome-analytics-opt-in"));
        expect(electron.send).toHaveBeenCalledWith("settings:set", {
            optOutAnalytics: false,
        });
        expect(electron.send).not.toHaveBeenCalledWith(
            "settings:set",
            expect.objectContaining({ editorMode: expect.anything() }),
        );
        expect(useEditorModeStore.getState().mode).toBe("basic");
        expect(useAnalyticsQuestionStore.getState().status).toBe("answered");
        expect(onFinish).toHaveBeenCalledWith({ willReload: true });
        expect(reload).toHaveBeenCalled();
    });
});
