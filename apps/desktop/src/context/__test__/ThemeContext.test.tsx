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
        document.documentElement.classList.remove("dark");
        localStorage.clear();
    });

    it("starts with the theme index.html set before the first paint", () => {
        document.documentElement.classList.add("dark");
        const { result } = renderHook(() => useTheme(), {
            wrapper: ThemeProvider,
        });
        expect(result.current?.theme).toBe("dark");
    });

    it("falls back to the system theme (light) if no theme is stored, and saves it", async () => {
        const { result } = renderHook(() => useTheme(), {
            wrapper: ThemeProvider,
        });

        await waitFor(() => {
            expect(mockSetTheme).toHaveBeenCalledWith("light");
        });
        expect(result.current?.theme).toBe("light");
    });

    it("should switch the theme, and keep it for the next first paint", async () => {
        const { result } = renderHook(() => useTheme(), {
            wrapper: ThemeProvider,
        });
        // The stored theme (none: the system's) has loaded
        await waitFor(() => {
            expect(mockSetTheme).toHaveBeenCalledWith("light");
        });

        act(() => {
            result.current?.setTheme("dark");
        });

        await waitFor(() => {
            expect(result.current?.theme).toBe("dark");
        });
        expect(document.documentElement).toHaveClass("dark");
        expect(localStorage.getItem("openmarch:theme")).toBe("dark");
        expect(mockSetTheme).toHaveBeenLastCalledWith("dark");
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
