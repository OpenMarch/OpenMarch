import { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ElectronApi } from "electron/preload";

import { useInspectedPage } from "@/hooks/useInspectedPage";
import {
    SelectedPageProvider,
    useSelectedPage,
} from "@/context/SelectedPageContext";
import { IsPlayingProvider, useIsPlaying } from "@/context/IsPlayingContext";
import { mockPages } from "@/__mocks__/globalMocks";

window.electron = {
    sendSelectedPage: vi.fn(),
} as Partial<ElectronApi> as ElectronApi;

vi.mock("@/hooks/useTimingObjects", () => ({
    useTimingObjects: vi.fn(() => ({
        pages: mockPages,
        measures: [],
        beats: [],
        fetchTimingObjects: vi.fn(),
        isLoading: false,
        hasError: false,
    })),
}));

/**
 * Renders children inside the contexts that {@link useInspectedPage} reads
 * from, so each test can drive `selectedPage` and `isPlaying` independently.
 */
const wrapper = ({ children }: { children: ReactNode }) => (
    <IsPlayingProvider>
        <SelectedPageProvider>{children}</SelectedPageProvider>
    </IsPlayingProvider>
);

describe("useInspectedPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns null when no page is selected", () => {
        const { result } = renderHook(() => useInspectedPage(), { wrapper });
        expect(result.current).toBeNull();
    });

    it("returns the selected page when not playing", () => {
        const { result } = renderHook(
            () => {
                const inspected = useInspectedPage();
                const selected = useSelectedPage();
                return { inspected, selected };
            },
            { wrapper },
        );

        const firstPage = mockPages[0];
        void act(() => result.current.selected?.setSelectedPage(firstPage));

        expect(result.current.inspected).toEqual(firstPage);
    });

    it("returns the next page during playback", () => {
        const { result } = renderHook(
            () => {
                const inspected = useInspectedPage();
                const selected = useSelectedPage();
                const playing = useIsPlaying();
                return { inspected, selected, playing };
            },
            { wrapper },
        );

        const firstPage = mockPages[0];
        const secondPage = mockPages.find((p) => p.id === firstPage.nextPageId);

        void act(() => {
            result.current.selected?.setSelectedPage(firstPage);
            result.current.playing?.setIsPlaying(true);
        });

        expect(result.current.inspected).toEqual(secondPage);
    });

    it("falls back to the selected page when nextPageId is null during playback", () => {
        const { result } = renderHook(
            () => {
                const inspected = useInspectedPage();
                const selected = useSelectedPage();
                const playing = useIsPlaying();
                return { inspected, selected, playing };
            },
            { wrapper },
        );

        const lastPage = mockPages.find((p) => p.nextPageId === null);
        if (!lastPage)
            throw new Error(
                "mockPages must contain a final page with nextPageId === null",
            );

        void act(() => {
            result.current.selected?.setSelectedPage(lastPage);
            result.current.playing?.setIsPlaying(true);
        });

        expect(result.current.inspected).toEqual(lastPage);
    });
});
