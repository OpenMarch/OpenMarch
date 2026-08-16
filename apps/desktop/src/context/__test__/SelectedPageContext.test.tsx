import { act, renderHook } from "@testing-library/react";
import {
    useSelectedPage,
    SelectedPageProvider,
} from "@/context/SelectedPageContext";
import { useFrameClockStore } from "@/services/clock/frame-clock";
import { ElectronApi } from "electron/preload";
import { mockPages } from "@/__mocks__/globalMocks";
import { describe, expect, it, vi, beforeEach } from "vitest";

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

describe("SelectedPageContext", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // The frame clock is a module-level singleton, so reset it between tests to avoid
        // leaking `currentTime`/`playing` state across cases.
        useFrameClockStore.setState({ currentTime: 0, playing: false });
    });

    it("seekTo derives the selected page from the clock", async () => {
        const { result } = renderHook(() => useSelectedPage(), {
            wrapper: SelectedPageProvider,
        });
        const pages = mockPages;

        // copy the first page to avoid reference equality issues
        const expectedPage = pages[0];
        void act(() => result.current?.seekTo({ id: expectedPage.id }));
        expect(result.current?.selectedPage).toEqual({ ...expectedPage });
    });

    it("seekTo - multiple changes", async () => {
        const { result } = renderHook(() => useSelectedPage(), {
            wrapper: SelectedPageProvider,
        });
        const pages = mockPages;

        // copy the page to avoid reference equality issues
        let expectedPage = pages[0];
        void act(() => result.current?.seekTo({ id: expectedPage.id }));
        expect(result.current?.selectedPage).toEqual({ ...expectedPage });

        // copy the page to avoid reference equality issues
        expectedPage = pages[2];
        void act(() => result.current?.seekTo({ id: expectedPage.id }));
        expect(result.current?.selectedPage).toEqual({ ...expectedPage });

        // copy the page to avoid reference equality issues
        expectedPage = pages[1];
        void act(() => result.current?.seekTo({ id: expectedPage.id }));
        expect(result.current?.selectedPage).toEqual({ ...expectedPage });
    });
});
