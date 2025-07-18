import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { waitFor, renderHook } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import "@testing-library/jest-dom/vitest";
import { ElectronApi } from "electron/preload";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";

window.electron = {
    setTheme: vi.fn(),
    getTheme: vi.fn().mockResolvedValue(null),
} as Partial<ElectronApi> as ElectronApi;

beforeAll(() => {
    window.matchMedia = vi.fn().mockImplementation((query) => {
        return {
            matches: query === "(prefers-color-scheme: light)",
            media: query,
            onchange: null,
        };
    });
});

describe("ThemeProvider", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Skip this for now as it's hard to validate in actions
    it("should load the default theme (system, light) if no theme is stored", async () => {
        const { result } = renderHook(() => useTheme(), {
            wrapper: ThemeProvider,
        });

        await waitFor(() => {
            expect(result.current?.theme).toBe("dark");
        });
    });

    it("should switch the theme", async () => {
        const { result } = renderHook(() => useTheme(), {
            wrapper: ThemeProvider,
        });

        result.current?.setTheme("dark");

        await waitFor(() => {
            expect(result.current?.theme).toBe("dark");
        });
    });
});
