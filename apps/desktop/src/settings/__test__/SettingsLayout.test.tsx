import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { ThemeProvider } from "@/context/ThemeContext";
import SettingsWindow from "../SettingsWindow";
import SettingsPanel from "../SettingsPanel";
import SettingRow from "../SettingRow";

describe("SettingsPanel", () => {
    it("renders its heading outside the panel and separates rows with hairlines", () => {
        render(
            <SettingsPanel heading="Display">
                <SettingRow label="One">
                    <button>a</button>
                </SettingRow>
                <SettingRow label="Two">
                    <button>b</button>
                </SettingRow>
            </SettingsPanel>,
        );
        const heading = screen.getByText("Display");
        const list = screen.getByText("One").closest(".divide-y")!;
        expect(list).toHaveClass("divide-y", "divide-stroke");
        expect(list).toHaveClass("bg-fg-1", "rounded-6", "px-16");
        expect(list).not.toHaveClass("border");
        expect(list).toContainElement(screen.getByText("Two"));
        expect(list).not.toContainElement(heading);
        expect(heading).toHaveClass("text-sub", "font-medium");
    });

    it("renders without a heading", () => {
        render(
            <SettingsPanel>
                <SettingRow label="Only">
                    <button>a</button>
                </SettingRow>
            </SettingsPanel>,
        );
        expect(screen.getByText("Only")).toBeVisible();
    });
});

describe("SettingsWindow header", () => {
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

    it("shows a description paragraph directly under the section title", async () => {
        render(
            <TolgeeProvider tolgee={tolgee} fallback="">
                <ThemeProvider>
                    <SettingsWindow />
                </ThemeProvider>
            </TolgeeProvider>,
        );
        const h1 = await screen.findByRole("heading", { level: 1 });
        // descriptionKey is currently a placeholder equal to labelKey (Task 12),
        // so assert the separate paragraph by structure, not by distinct text.
        const description = h1.nextElementSibling!;
        expect(description.tagName).toBe("P");
        expect(description).toHaveClass("text-body", "text-text-subtitle");
        expect(description.textContent).not.toBe("");
        expect(h1).toHaveClass("text-h4");
    });
});
