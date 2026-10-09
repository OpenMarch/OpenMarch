import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { ThemeProvider } from "@/context/ThemeContext";
import SettingsWindow from "../SettingsWindow";
import { SETTINGS_SECTION_STORAGE_KEY, SETTINGS_SECTIONS } from "../sections";

beforeEach(() => {
    // jsdom lacks ResizeObserver, which the Radix slider in Mouse settings needs.
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    Object.assign(window, {
        electron: {
            isMacOS: true,
            getZoomFactor: () => 1,
            getTheme: vi.fn().mockResolvedValue("dark"),
            setTheme: vi.fn(),
            getLanguage: vi.fn().mockResolvedValue("en"),
            setLanguage: vi.fn(),
            onSettingsChanged: () => () => {},
            invoke: vi.fn().mockResolvedValue(undefined),
            send: vi.fn(),
            closeWindow: vi.fn(),
            databaseIsReady: vi.fn().mockResolvedValue(false),
            databaseGetPath: vi.fn().mockResolvedValue(""),
        },
    });
});
afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
});

const renderWindow = () =>
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <ThemeProvider>
                <SettingsWindow />
            </ThemeProvider>
        </TolgeeProvider>,
    );

describe("SettingsWindow", () => {
    it("lists the eight sections in order", () => {
        expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
            "general",
            "appearance",
            "mouse",
            "shortcuts",
            "plugins",
            "privacy",
            "developer",
            "database",
        ]);
    });

    it("keeps the language in General and the theme in Appearance", async () => {
        renderWindow();
        expect(await screen.findByRole("combobox")).toBeVisible();
        expect(screen.queryByRole("radio", { name: "Light" })).toBeNull();

        const nav = screen.getByRole("navigation");
        fireEvent.click(
            within(nav).getByRole("button", { name: "Appearance" }),
        );
        expect(screen.getByRole("radio", { name: "Light" })).toBeVisible();
        expect(screen.getByRole("radio", { name: "Dark" })).toBeVisible();
        expect(screen.queryByRole("combobox")).toBeNull();
    });

    it.each(SETTINGS_SECTIONS.map((section) => section.id))(
        "shows a real description for the %s section",
        async (id) => {
            localStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, id);
            renderWindow();
            const heading = await screen.findByRole("heading", { level: 1 });
            const description = heading.nextElementSibling;
            expect(description?.textContent?.trim()).toBeTruthy();
            expect(description?.textContent).not.toBe(heading.textContent);
            expect(description?.textContent).not.toMatch(/^settings\./);
        },
    );

    it("opens on General and switches section from the sidebar", async () => {
        renderWindow();
        const nav = await screen.findByRole("navigation");
        expect(screen.getByRole("heading", { name: "General" })).toBeVisible();

        fireEvent.click(
            within(nav).getByRole("button", { name: "Keyboard shortcuts" }),
        );
        expect(
            screen.getByRole("heading", { name: "Keyboard shortcuts" }),
        ).toBeVisible();
        expect(
            screen.getByRole("searchbox", { name: "Search shortcuts" }),
        ).toBeVisible();
    });

    it("moves between sections with the arrow keys", async () => {
        renderWindow();
        const nav = await screen.findByRole("navigation");
        const general = within(nav).getByRole("button", { name: "General" });
        general.focus();
        fireEvent.keyDown(general, { key: "ArrowDown" });
        expect(
            screen.getByRole("heading", { name: "Appearance" }),
        ).toBeVisible();
        expect(
            within(nav).getByRole("button", { name: "Appearance" }),
        ).toHaveFocus();
    });

    it("reopens on the last section", async () => {
        localStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, "privacy");
        renderWindow();
        expect(
            await screen.findByRole("heading", { name: "Privacy" }),
        ).toBeVisible();
    });

    it("falls back to General for an unknown saved section", async () => {
        localStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, "nope");
        renderWindow();
        expect(
            await screen.findByRole("heading", { name: "General" }),
        ).toBeVisible();
    });

    it.each(SETTINGS_SECTIONS.map((section) => section.id))(
        "renders the %s section without query or database providers",
        async (id) => {
            localStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, id);
            renderWindow();
            expect(
                await screen.findByRole("heading", { level: 1 }),
            ).toBeVisible();
        },
    );

    it("closes the window on Cmd+W but not on a plain W", async () => {
        renderWindow();
        await screen.findByRole("navigation");
        fireEvent.keyDown(window, { key: "w" });
        expect(window.electron.closeWindow).not.toHaveBeenCalled();
        fireEvent.keyDown(window, { key: "w", metaKey: true });
        expect(window.electron.closeWindow).toHaveBeenCalledTimes(1);
    });
});
