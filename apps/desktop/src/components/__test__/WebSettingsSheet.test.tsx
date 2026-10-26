import { act, fireEvent, render, screen } from "@testing-library/react";
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { ThemeProvider } from "@/context/ThemeContext";
import { requestOpenSettings } from "@/utilities/settingsSheet";
import WebSettingsSheet from "../WebSettingsSheet";

beforeAll(async () => {
    await tolgee.run();
});
beforeEach(() => {
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

const renderSheet = () =>
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <ThemeProvider>
                <WebSettingsSheet />
            </ThemeProvider>
        </TolgeeProvider>,
    );

describe("WebSettingsSheet", () => {
    it("opens over the page when asked, and closes from its button", async () => {
        renderSheet();
        expect(screen.queryByRole("dialog")).toBeNull();

        await act(async () => requestOpenSettings());
        expect(await screen.findByRole("dialog")).toBeTruthy();
        expect(screen.getByRole("navigation")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Touch & Input/ }));
        expect(
            screen.getByRole("heading", { name: "Touch & Input" }),
        ).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("keeps keys typed in it away from the app's shortcuts", async () => {
        renderSheet();
        await act(async () => requestOpenSettings());
        const dialog = await screen.findByRole("dialog");
        const appShortcut = vi.fn();
        window.addEventListener("keydown", appShortcut);
        fireEvent.keyDown(dialog, { key: " " });
        window.removeEventListener("keydown", appShortcut);
        expect(appShortcut).not.toHaveBeenCalled();
    });
});
