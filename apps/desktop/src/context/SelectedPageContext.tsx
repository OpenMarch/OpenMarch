import {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import Page from "@/global/classes/Page";
import { useTimingObjects } from "@/hooks";
import {
    subscribeToFrameClock,
    useFrameClockStore,
} from "@/services/clock/frame-clock";

// Define the type for the context value
type SelectedPageContextProps = {
    selectedPage: Page | null;
    /**
     * Moves the playback clock to a page's timestamp. `selectedPage` updates as a consequence of
     * the clock moving, rather than being set directly.
     */
    seekTo: (page: { id: number }) => void;
    /**
     * A page to select after once it exists. This is good for selecting a page right after it is created,
     * as it might not be immediately available in the pages list.
     */
    setPageToSelect: (page: { id: number }) => void;
};

const SelectedPageContext = createContext<SelectedPageContextProps | undefined>(
    undefined,
);

// Comparing summed floats (`timestamp + duration`) against a value computed via a different
// floating-point path (`currentTimeMs / 1000`) means two numbers meant to be exactly equal at a
// page boundary can differ by a few ULPs. A tiny tolerance absorbs that without risking an early
// advance into a genuinely-not-yet-reached page (real page durations are orders of magnitude
// larger than this).
const PAGE_BOUNDARY_EPSILON_SECONDS = 1e-6;

/**
 * The page whose end (`timestamp + duration`) is the greatest one `<= currentTimeMs` is the
 * selected page. Pages are already ascending by `timestamp`, so the first one exceeding
 * `currentTimeMs` ends the scan.
 */
export function derivePage(pages: Page[], currentTimeMs: number): Page | null {
    if (pages.length === 0) return null;
    const currentTimeSeconds = currentTimeMs / 1000;
    let result = pages[0];
    for (const page of pages) {
        if (
            page.timestamp + page.duration <=
            currentTimeSeconds + PAGE_BOUNDARY_EPSILON_SECONDS
        )
            result = page;
        else break;
    }
    return result;
}

/**
 * Floors show time (ms) to the end of the page that contains (or ends at/before) that time.
 * Used by the frame clock's `onPause` handler so pause snaps the play head to a page boundary.
 */
export function floorTimeToPageEndMs(
    pages: Page[],
    currentTimeMs: number,
): number {
    const page = derivePage(pages, currentTimeMs);
    if (!page) return currentTimeMs;
    return (page.timestamp + page.duration) * 1000;
}

export function SelectedPageProvider({ children }: { children: ReactNode }) {
    const { pages } = useTimingObjects();
    const [selectedPage, setSelectedPage] = useState<Page | null>(null);
    const pageToSelectRef = useRef<{ id: number } | null>(null);
    // Last known selected page, used to detect end-time changes across `pages` refreshes.
    const prevSelectedPageRef = useRef<Page | null>(null);
    const setPageToSelect = useCallback((page: { id: number }) => {
        pageToSelectRef.current = page;
    }, []);

    const seekTo = useCallback(
        (newPage: { id: number }) => {
            const page = pages.find((p) => p.id === newPage.id);
            if (!page) {
                console.warn(
                    `Page with id ${newPage.id} not found. Not seeking.`,
                );
                return;
            }
            // `audioTimeToShowTime` is the inverse of the `currentTime / 1000` conversion used in
            // `derivePage` (both currently reduce to seconds<->ms), so seeking to a page's
            // timestamp round-trips back to that exact page once `selectedPage` re-derives.
            const { audioTimeToShowTime, seek } = useFrameClockStore.getState();
            seek(audioTimeToShowTime(page.timestamp + page.duration));
        },
        [pages],
    );

    // Register a page-aware pause snap on the frame clock. Cleared on unmount / pages change.
    useEffect(() => {
        useFrameClockStore
            .getState()
            .setOnPause((timeMs) => floorTimeToPageEndMs(pages, timeMs));
        return () => {
            useFrameClockStore.getState().setOnPause(null);
        };
    }, [pages]);

    // Resolve a pending "select once it exists" page by seeking to it as soon as it appears in
    // `pages`. This moves the clock and the derived selection together.
    useEffect(() => {
        const pageToSelect = pageToSelectRef.current;
        if (!pageToSelect) return;
        const page = pages.find((p) => p.id === pageToSelect.id);
        if (page) {
            pageToSelectRef.current = null;
            seekTo(page);
        }
    }, [pages, seekTo]);

    // Re-derive the selected page whenever the pages list changes (e.g. a page's notes/duration
    // are edited, or a page is deleted).
    // - If the previously selected page was deleted, seek to its previous page (or the first
    //   remaining page).
    // - If it still exists but its end time changed and we are paused, re-seek to the new end.
    useEffect(() => {
        const prev = prevSelectedPageRef.current;
        const { currentTime, playing } = useFrameClockStore.getState();

        if (prev) {
            const updated = pages.find((p) => p.id === prev.id);

            if (!updated) {
                const previousPage =
                    prev.previousPageId != null
                        ? pages.find((p) => p.id === prev.previousPageId)
                        : undefined;
                const fallback = previousPage ?? pages[0] ?? null;
                if (fallback) {
                    seekTo(fallback);
                    setSelectedPage(fallback);
                    prevSelectedPageRef.current = fallback;
                } else {
                    setSelectedPage(null);
                    prevSelectedPageRef.current = null;
                }
                return;
            }

            if (!playing) {
                const prevEnd = prev.timestamp + prev.duration;
                const newEnd = updated.timestamp + updated.duration;
                if (
                    Math.abs(prevEnd - newEnd) > PAGE_BOUNDARY_EPSILON_SECONDS
                ) {
                    seekTo(updated);
                    setSelectedPage(updated);
                    prevSelectedPageRef.current = updated;
                    return;
                }
            }
        }

        const derived = derivePage(pages, currentTime);
        setSelectedPage(derived);
        prevSelectedPageRef.current = derived;
    }, [pages, seekTo]);

    // Re-derive the selected page on every clock tick. `subscribeToFrameClock` is a non-React
    // subscription (not `useCurrentTime()`), so this doesn't re-render consumers on every
    // animation frame — React bails out of re-rendering when `setSelectedPage` is called with the
    // same object reference the state already holds.
    useEffect(() => {
        return subscribeToFrameClock((timeMs) => {
            const derived = derivePage(pages, timeMs);
            setSelectedPage(derived);
            prevSelectedPageRef.current = derived;
        });
    }, [pages]);

    // Create the context value object
    const contextValue: SelectedPageContextProps = {
        selectedPage,
        seekTo,
        setPageToSelect,
    };

    return (
        <SelectedPageContext.Provider value={contextValue}>
            {children}
        </SelectedPageContext.Provider>
    );
}

export function useSelectedPage() {
    return useContext(SelectedPageContext);
}
