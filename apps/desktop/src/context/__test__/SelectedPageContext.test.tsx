import { act, renderHook } from "@testing-library/react";
import {
    useSelectedPage,
    SelectedPageProvider,
} from "@/context/SelectedPageContext";
import { ElectronApi } from "electron/preload";
import { mockPages } from "@/__mocks__/globalMocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimingObjects } from "@/hooks";

// Mock the electron api
window.electron = {
    sendSelectedPage: vi.fn(),
} as Partial<ElectronApi> as ElectronApi;

// Mock the useTimingObjects hook
vi.mock("@/hooks", () => ({
    useTimingObjects: vi.fn(() => ({
        pages: mockPages,
        measures: [],
        beats: [],
        fetchTimingObjects: vi.fn(),
        isLoading: false,
        hasError: false,
    })),
}));

/** The pages the mocked hook gives, as `vi.mock` set it up; the tests below put it back */
const timing = vi.mocked(useTimingObjects);
const base = timing.getMockImplementation()!;
const withPages = (pages: typeof mockPages) => () => ({
    ...(base as () => ReturnType<typeof useTimingObjects>)(),
    pages,
});

describe("SelectedPageContext", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // A failing test must not leave its page list or clock to the next (pre-merge review C3)
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("set selected page", async () => {
        const { result } = renderHook(() => useSelectedPage(), {
            wrapper: SelectedPageProvider,
        });
        const pages = mockPages;

        // copy the first marcher to avoid reference equality issues
        const expectedPage = pages[0];
        void act(() => result.current?.setSelectedPage(expectedPage));
        expect(result.current?.selectedPage).toEqual({ ...expectedPage });
    });

    it("set selected page - multiple changes", async () => {
        const { result } = renderHook(() => useSelectedPage(), {
            wrapper: SelectedPageProvider,
        });
        const pages = mockPages;

        // copy the page to avoid reference equality issues
        let expectedPage = pages[0];
        void act(() => result.current?.setSelectedPage(expectedPage));
        expect(result.current?.selectedPage).toEqual({ ...expectedPage });

        // copy the page to avoid reference equality issues
        expectedPage = pages[2];
        void act(() => result.current?.setSelectedPage(expectedPage));
        expect(result.current?.selectedPage).toEqual({ ...expectedPage });

        // copy the page to avoid reference equality issues
        expectedPage = pages[1];
        void act(() => result.current?.setSelectedPage(expectedPage));
        expect(result.current?.selectedPage).toEqual({ ...expectedPage });
    });

    it("selects a page that isn't in the list yet once it is (an undo's restored page)", async () => {
        timing.mockImplementation(withPages(mockPages.slice(0, 2)) as never);
        const { result, rerender } = renderHook(() => useSelectedPage(), {
            wrapper: SelectedPageProvider,
        });
        void act(() => result.current?.setSelectedPage(mockPages[0]));
        // A caller that already sees the restored page asks for it first
        void act(() => result.current?.setSelectedPage(mockPages[2]));
        expect(result.current?.selectedPage?.id).toBe(mockPages[0].id);
        timing.mockImplementation(withPages(mockPages) as never);
        rerender();
        expect(result.current?.selectedPage?.id).toBe(mockPages[2].id);
    });

    it("a later choice wins over one still waiting for its page", async () => {
        timing.mockImplementation(withPages(mockPages.slice(0, 2)) as never);
        const { result, rerender } = renderHook(() => useSelectedPage(), {
            wrapper: SelectedPageProvider,
        });
        void act(() => result.current?.setSelectedPage(mockPages[2]));
        void act(() => result.current?.setSelectedPage(mockPages[1]));
        timing.mockImplementation(withPages(mockPages) as never);
        rerender();
        expect(result.current?.selectedPage?.id).toBe(mockPages[1].id);
    });

    it("a waiting choice lapses if its page doesn't appear soon", async () => {
        const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
        timing.mockImplementation(withPages(mockPages.slice(0, 2)) as never);
        const { result, rerender } = renderHook(() => useSelectedPage(), {
            wrapper: SelectedPageProvider,
        });
        void act(() => result.current?.setSelectedPage(mockPages[0]));
        void act(() => result.current?.setSelectedPage(mockPages[2]));
        // Much later, an undo restores the page: it must not be selected then
        now.mockReturnValue(60_000);
        timing.mockImplementation(withPages(mockPages) as never);
        rerender();
        expect(result.current?.selectedPage?.id).toBe(mockPages[0].id);
    });
});
