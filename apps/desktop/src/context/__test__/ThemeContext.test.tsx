import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import {
    waitFor,
    renderHook,
    render,
    screen,
    act,
} from "@testing-library/react";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import "@testing-library/jest-dom/vitest";
import { ElectronApi } from "electron/preload";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";

let emit: (change: Record<string, unknown>) => void = () => {};

const mockSetTheme = vi.fn().mockResolvedValue(undefined);
const mockOnSettingsChanged = vi.fn((cb: typeof emit) => {
    emit = cb;
    return () => {};
});

window.electron = {
    setTheme: mockSetTheme,
    getTheme: vi.fn().mockResolvedValue(null),
    onSettingsChanged: mockOnSettingsChanged,
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

function ShowTheme() {
    return <span>{useTheme().theme}</span>;
}

describe("ThemeProvider", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSetTheme.mockClear();
        emit = () => {};
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

    it("applies a theme changed in another window without saving it again", async () => {
        const getThemeFn = vi.fn().mockResolvedValue("light");
        Object.assign(window.electron!, {
            getTheme: getThemeFn,
            setTheme: mockSetTheme,
            onSettingsChanged: mockOnSettingsChanged,
        });

        render(
            <ThemeProvider>
                <ShowTheme />
            </ThemeProvider>,
        );
        await screen.findByText("light");
        mockSetTheme.mockClear();

        act(() => emit({ theme: "dark" }));

        expect(screen.getByText("dark")).toBeInTheDocument();
        expect(document.documentElement).toHaveClass("dark");
        expect(mockSetTheme).not.toHaveBeenCalled();
    });
});
