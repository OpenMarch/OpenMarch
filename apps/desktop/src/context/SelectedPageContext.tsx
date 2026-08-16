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

/**
 * The page whose `timestamp` is the greatest one `<= currentTimeMs` is the selected page. Pages
 * are already ascending by `timestamp`, so the first one exceeding `currentTimeMs` ends the scan.
 */
function derivePage(pages: Page[], currentTimeMs: number): Page | null {
    if (pages.length === 0) return null;
    const currentTimeSeconds = currentTimeMs / 1000;
    let result = pages[0];
    for (const page of pages) {
        if (page.timestamp + page.duration <= currentTimeSeconds) result = page;
        else break;
    }
    return result;
}

export function SelectedPageProvider({ children }: { children: ReactNode }) {
    const { pages } = useTimingObjects();
    const [selectedPage, setSelectedPage] = useState<Page | null>(null);
    const pageToSelectRef = useRef<{ id: number } | null>(null);
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
    // are edited), using the clock's current time, so the selected page's object reference stays
    // fresh even when the clock hasn't moved.
    useEffect(() => {
        setSelectedPage(
            derivePage(pages, useFrameClockStore.getState().currentTime),
        );
    }, [pages]);

    // Re-derive the selected page on every clock tick. `subscribeToFrameClock` is a non-React
    // subscription (not `useCurrentTime()`), so this doesn't re-render consumers on every
    // animation frame — React bails out of re-rendering when `setSelectedPage` is called with the
    // same object reference the state already holds.
    useEffect(() => {
        return subscribeToFrameClock((timeMs) => {
            setSelectedPage(derivePage(pages, timeMs));
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
