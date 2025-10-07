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

export function SelectedPageProvider({ children }: { children: ReactNode }) {
    const { pages } = useTimingObjects();
    const [selectedPage, setSelectedPage] = useState<Page | null>(null);
    const pageToSelectRef = useRef<{ id: number } | null>(null);
    const setPageToSelect = useCallback((page: { id: number }) => {
        pageToSelectRef.current = page;
    }, []);

    // Update the selected page if the pages list changes. This refreshes the information of the selected page
    useEffect(() => {
        let pageWasSet = false;
        const pageToSelect = pageToSelectRef.current;
        if (pageToSelect) {
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

    const setSelectedPageFromId = useCallback(
        (newPage: { id: number }) => {
            const page = pages.find((p) => p.id === newPage.id);
            if (page) setSelectedPage(page);
            else
                console.warn(
                    `Page with id ${newPage.id} not found. Not setting selected page.`,
                );
        },
        [pages],
    );

    // Create the context value object
    const contextValue: SelectedPageContextProps = {
        selectedPage,
        setSelectedPage: setSelectedPageFromId,
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
