import { act, renderHook } from "@testing-library/react";
import {
    useSelectedPage,
    SelectedPageProvider,
    floorTimeToPageEndMs,
    derivePage,
} from "@/context/SelectedPageContext";
import { useFrameClockStore } from "@/services/clock/frame-clock";
import { ElectronApi } from "electron/preload";
import { mockPages } from "@/__mocks__/globalMocks";
import { useTimingObjects } from "@/hooks";
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

const mockedUseTimingObjects = vi.mocked(useTimingObjects);

describe("SelectedPageContext", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedUseTimingObjects.mockReturnValue({
            pages: mockPages,
            measures: [],
            beats: [],
            fetchTimingObjects: vi.fn(),
            isLoading: false,
            hasError: false,
        } as ReturnType<typeof useTimingObjects>);
        // The frame clock is a module-level singleton, so reset it between tests to avoid
        // leaking `currentTime`/`playing`/`_onPause` state across cases.
        useFrameClockStore.setState({
            currentTime: 0,
            playing: false,
            _onPause: null,
        });
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

    describe("derivePage", () => {
        it("selects the page whose end matches currentTimeMs despite float drift from a different computation path", () => {
            // Real tempo-derived timestamps from a reported bug: `currentTimeMs / 1000` lands a
            // few ULPs short of the stored `timestamp + duration` sum at a page boundary, so a
            // strict `<=` comparison used to leave the selection stuck on the previous page.
            const pages = [
                {
                    ...mockPages[0],
                    name: "2A",
                    timestamp: 21.953717724072536,
                    duration: 4.067796033898305,
                },
                {
                    ...mockPages[1],
                    name: "3",
                    timestamp: 26.02151375797084,
                    duration: 4.067796610169491,
                },
            ];

            expect(derivePage(pages, 30089.31036814033)?.name).toBe("3");
        });
    });

    describe("floorTimeToPageEndMs", () => {
        it("floors mid-page time to the prior page end", () => {
            // Between page 1 end (8s) and page 2 end (12s) → floor to page 1 end
            expect(floorTimeToPageEndMs(mockPages, 10_000)).toBe(8_000);
        });

        it("leaves time unchanged when already on a page end", () => {
            expect(floorTimeToPageEndMs(mockPages, 12_000)).toBe(12_000);
        });

        it("returns current time when there are no pages", () => {
            expect(floorTimeToPageEndMs([], 5_000)).toBe(5_000);
        });
    });

    describe("pause snaps to floored page end", () => {
        it("seeks mid-page time to the page end and updates selectedPage", () => {
            const { result } = renderHook(() => useSelectedPage(), {
                wrapper: SelectedPageProvider,
            });

            void act(() => {
                useFrameClockStore.setState({
                    currentTime: 10_000,
                    playing: true,
                });
                useFrameClockStore.getState().pause();
            });

            expect(useFrameClockStore.getState().currentTime).toBe(8_000);
            expect(useFrameClockStore.getState().playing).toBe(false);
            expect(result.current?.selectedPage).toEqual({ ...mockPages[0] });
        });

        it("leaves time unchanged when already on a page end", () => {
            const { result } = renderHook(() => useSelectedPage(), {
                wrapper: SelectedPageProvider,
            });

            void act(() => {
                useFrameClockStore.setState({
                    currentTime: 12_000,
                    playing: true,
                });
                useFrameClockStore.getState().pause();
            });

            expect(useFrameClockStore.getState().currentTime).toBe(12_000);
            expect(result.current?.selectedPage).toEqual({ ...mockPages[1] });
        });

        it("does not throw or change time when pages are empty", () => {
            mockedUseTimingObjects.mockReturnValue({
                pages: [],
                measures: [],
                beats: [],
                fetchTimingObjects: vi.fn(),
                isLoading: false,
                hasError: false,
            } as ReturnType<typeof useTimingObjects>);

            renderHook(() => useSelectedPage(), {
                wrapper: SelectedPageProvider,
            });

            void act(() => {
                useFrameClockStore.setState({
                    currentTime: 5_000,
                    playing: true,
                });
                useFrameClockStore.getState().pause();
            });

            expect(useFrameClockStore.getState().currentTime).toBe(5_000);
            expect(useFrameClockStore.getState().playing).toBe(false);
        });
    });
});
