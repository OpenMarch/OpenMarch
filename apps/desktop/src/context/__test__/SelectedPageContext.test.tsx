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

    describe("re-seek when selected page end changes", () => {
        it("seeks to the new end when the selected page lengthens", async () => {
            const { result, rerender } = renderHook(() => useSelectedPage(), {
                wrapper: SelectedPageProvider,
            });

            void act(() => result.current?.seekTo({ id: mockPages[1].id }));
            expect(useFrameClockStore.getState().currentTime).toBe(12_000);

            const lengthenedPages = mockPages.map((page) =>
                page.id === 2
                    ? { ...page, duration: 6, counts: 12 }
                    : page.id === 3
                      ? { ...page, timestamp: 14 }
                      : page,
            );
            mockedUseTimingObjects.mockReturnValue({
                pages: lengthenedPages,
                measures: [],
                beats: [],
                fetchTimingObjects: vi.fn(),
                isLoading: false,
                hasError: false,
            } as ReturnType<typeof useTimingObjects>);

            void act(() => rerender());

            expect(useFrameClockStore.getState().currentTime).toBe(14_000);
            expect(result.current?.selectedPage).toEqual(lengthenedPages[1]);
        });

        it("seeks to the new end when the selected page shortens", async () => {
            const { result, rerender } = renderHook(() => useSelectedPage(), {
                wrapper: SelectedPageProvider,
            });

            void act(() => result.current?.seekTo({ id: mockPages[1].id }));
            expect(useFrameClockStore.getState().currentTime).toBe(12_000);

            const shortenedPages = mockPages.map((page) =>
                page.id === 2
                    ? { ...page, duration: 2, counts: 4 }
                    : page.id === 3
                      ? { ...page, timestamp: 10 }
                      : page,
            );
            mockedUseTimingObjects.mockReturnValue({
                pages: shortenedPages,
                measures: [],
                beats: [],
                fetchTimingObjects: vi.fn(),
                isLoading: false,
                hasError: false,
            } as ReturnType<typeof useTimingObjects>);

            void act(() => rerender());

            expect(useFrameClockStore.getState().currentTime).toBe(10_000);
            expect(result.current?.selectedPage).toEqual(shortenedPages[1]);
        });

        it("does not re-seek while playing", async () => {
            const { result, rerender } = renderHook(() => useSelectedPage(), {
                wrapper: SelectedPageProvider,
            });

            void act(() => result.current?.seekTo({ id: mockPages[1].id }));
            expect(useFrameClockStore.getState().currentTime).toBe(12_000);

            void act(() => {
                useFrameClockStore.setState({ playing: true });
            });

            const lengthenedPages = mockPages.map((page) =>
                page.id === 2
                    ? { ...page, duration: 6, counts: 12 }
                    : page.id === 3
                      ? { ...page, timestamp: 14 }
                      : page,
            );
            mockedUseTimingObjects.mockReturnValue({
                pages: lengthenedPages,
                measures: [],
                beats: [],
                fetchTimingObjects: vi.fn(),
                isLoading: false,
                hasError: false,
            } as ReturnType<typeof useTimingObjects>);

            void act(() => rerender());

            expect(useFrameClockStore.getState().currentTime).toBe(12_000);
            // Old end (12s) is now mid page 2 (ends at 14s), so derivePage falls back to page 1.
            expect(result.current?.selectedPage).toEqual(lengthenedPages[0]);
        });
    });

    describe("selection when pages are deleted", () => {
        it("seeks to the previous page when the selected page is deleted", async () => {
            const { result, rerender } = renderHook(() => useSelectedPage(), {
                wrapper: SelectedPageProvider,
            });

            void act(() => result.current?.seekTo({ id: mockPages[1].id }));
            expect(result.current?.selectedPage).toEqual({ ...mockPages[1] });

            const pagesWithout2 = [
                mockPages[0],
                {
                    ...mockPages[2],
                    previousPageId: mockPages[0].id,
                    timestamp: 8,
                },
            ];
            mockedUseTimingObjects.mockReturnValue({
                pages: pagesWithout2,
                measures: [],
                beats: [],
                fetchTimingObjects: vi.fn(),
                isLoading: false,
                hasError: false,
            } as ReturnType<typeof useTimingObjects>);

            void act(() => rerender());

            expect(useFrameClockStore.getState().currentTime).toBe(8_000);
            expect(result.current?.selectedPage).toEqual(pagesWithout2[0]);
        });

        it("seeks to the new first page when the first page is deleted", async () => {
            const { result, rerender } = renderHook(() => useSelectedPage(), {
                wrapper: SelectedPageProvider,
            });

            void act(() => result.current?.seekTo({ id: mockPages[0].id }));
            expect(result.current?.selectedPage).toEqual({ ...mockPages[0] });

            const pagesWithout1 = [
                {
                    ...mockPages[1],
                    previousPageId: null,
                    timestamp: 0,
                },
                {
                    ...mockPages[2],
                    previousPageId: mockPages[1].id,
                    timestamp: 4,
                },
            ];
            mockedUseTimingObjects.mockReturnValue({
                pages: pagesWithout1,
                measures: [],
                beats: [],
                fetchTimingObjects: vi.fn(),
                isLoading: false,
                hasError: false,
            } as ReturnType<typeof useTimingObjects>);

            void act(() => rerender());

            expect(useFrameClockStore.getState().currentTime).toBe(4_000);
            expect(result.current?.selectedPage).toEqual(pagesWithout1[0]);
        });

        it("re-seeks when a non-selected delete grows the selected page duration", async () => {
            const { result, rerender } = renderHook(() => useSelectedPage(), {
                wrapper: SelectedPageProvider,
            });

            void act(() => result.current?.seekTo({ id: mockPages[1].id }));
            expect(useFrameClockStore.getState().currentTime).toBe(12_000);

            // Simulate deleting page 3 and merging its time into page 2.
            const pagesAfterMerge = [
                mockPages[0],
                {
                    ...mockPages[1],
                    duration: 12,
                    counts: 24,
                    nextPageId: null,
                },
            ];
            mockedUseTimingObjects.mockReturnValue({
                pages: pagesAfterMerge,
                measures: [],
                beats: [],
                fetchTimingObjects: vi.fn(),
                isLoading: false,
                hasError: false,
            } as ReturnType<typeof useTimingObjects>);

            void act(() => rerender());

            expect(useFrameClockStore.getState().currentTime).toBe(20_000);
            expect(result.current?.selectedPage).toEqual(pagesAfterMerge[1]);
        });

        it("does not re-seek when a later page is deleted and the selected page is unchanged", async () => {
            const { result, rerender } = renderHook(() => useSelectedPage(), {
                wrapper: SelectedPageProvider,
            });

            void act(() => result.current?.seekTo({ id: mockPages[1].id }));
            expect(useFrameClockStore.getState().currentTime).toBe(12_000);

            const pagesWithout3 = [
                mockPages[0],
                { ...mockPages[1], nextPageId: null },
            ];
            mockedUseTimingObjects.mockReturnValue({
                pages: pagesWithout3,
                measures: [],
                beats: [],
                fetchTimingObjects: vi.fn(),
                isLoading: false,
                hasError: false,
            } as ReturnType<typeof useTimingObjects>);

            void act(() => rerender());

            expect(useFrameClockStore.getState().currentTime).toBe(12_000);
            expect(result.current?.selectedPage).toEqual(pagesWithout3[1]);
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
