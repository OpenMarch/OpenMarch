import {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import Page from "@/global/classes/Page";
import { useTimingObjects } from "@/hooks";

// Define the type for the context value
type SelectedPageContextProps = {
    selectedPage: Page | null;
    setSelectedPage: (page: { id: number }) => void;
    /**
     * A page to select after once it exists. This is good for selecting a page right after it is created,
     * as it might not be immediately available in the pages list.
     */
    setPageToSelect: (page: { id: number }) => void;
};

const SelectedPageContext = createContext<SelectedPageContextProps | undefined>(
    undefined,
);

/** How long a selection waits for its page to appear in the page list */
const PENDING_SELECTION_MS = 2000;

export function SelectedPageProvider({ children }: { children: ReactNode }) {
    const { pages } = useTimingObjects();
    const [selectedPage, setSelectedPage] = useState<Page | null>(null);
    // `expires` is set only for a selection waiting on a page that isn't listed yet
    const pageToSelectRef = useRef<{ id: number; expires?: number } | null>(
        null,
    );
    const setPageToSelect = useCallback((page: { id: number }) => {
        pageToSelectRef.current = page;
    }, []);

    // Update the selected page if the pages list changes. This refreshes the information of the selected page
    useEffect(() => {
        let pageWasSet = false;
        const pageToSelect = pageToSelectRef.current;
        if (
            pageToSelect?.expires !== undefined &&
            Date.now() > pageToSelect.expires
        )
            pageToSelectRef.current = null;
        else if (pageToSelect) {
            const page = pages.find((p) => p.id === pageToSelect.id);
            if (page) {
                setSelectedPage(page);
                pageWasSet = true;
                pageToSelectRef.current = null;
            }
        }
        if (!pageWasSet && selectedPage)
            setSelectedPage(
                pages.find((page) => page.id === selectedPage.id) || null,
            );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pages]);

    // The latest page list, for a setter called through an older render's closure
    const pagesRef = useRef(pages);
    pagesRef.current = pages;
    const setSelectedPageFromId = useCallback((newPage: { id: number }) => {
        const page = pagesRef.current.find((p) => p.id === newPage.id);
        if (page) {
            setSelectedPage(page);
            // A later choice wins over one still waiting for its page
            pageToSelectRef.current = null;
        } else {
            // Not in the page list yet (an undo that just restored it, seen first by the
            // caller): select it if it appears soon, so a page that never comes back can't be
            // selected by a much later undo
            console.debug(
                `Page with id ${newPage.id} not found yet. Selecting it once it is.`,
            );
            // While this provider's page list hasn't loaded yet (each `useTimingObjects` caller
            // gets the data in its own commit; StateInitializer selects the first page on load),
            // wait for it without a deadline
            pageToSelectRef.current = {
                id: newPage.id,
                expires:
                    pagesRef.current.length === 0
                        ? undefined
                        : Date.now() + PENDING_SELECTION_MS,
            };
        }
    }, []);

    // Memoised so a provider render that changes none of these doesn't re-render every consumer
    const contextValue: SelectedPageContextProps = useMemo(
        () => ({
            selectedPage,
            setSelectedPage: setSelectedPageFromId,
            setPageToSelect,
        }),
        [selectedPage, setSelectedPageFromId, setPageToSelect],
    );

    return (
        <SelectedPageContext.Provider value={contextValue}>
            {children}
        </SelectedPageContext.Provider>
    );
}

export function useSelectedPage() {
    return useContext(SelectedPageContext);
}
