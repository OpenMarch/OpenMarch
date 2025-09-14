import {
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useState,
} from "react";
import Page from "@/global/classes/Page";
import { useTimingObjects } from "@/hooks";

// Define the type for the context value
type SelectedPageContextProps = {
    selectedPage: Page | null;
    setSelectedPage: (page: Page) => void;
};

const SelectedPageContext = createContext<SelectedPageContextProps | undefined>(
    undefined,
);

export function SelectedPageProvider({ children }: { children: ReactNode }) {
    const { pages } = useTimingObjects();
    const [selectedPage, setSelectedPage] = useState<Page | null>(null);

    // Update the selected page if the pages list changes. This refreshes the information of the selected page
    useEffect(() => {
        if (selectedPage)
            setSelectedPage(
                pages.find((page) => page.id === selectedPage.id) || null,
            );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pages]);

    // Create the context value object
    const contextValue: SelectedPageContextProps = {
        selectedPage,
        setSelectedPage,
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
