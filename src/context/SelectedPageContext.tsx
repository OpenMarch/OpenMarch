import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { usePageStore } from '@/stores/page/usePageStore';
import Page from '@/global/classes/Page';

// Define the type for the context value
type SelectedPageContextProps = {
    selectedPage: Page | null;
    setSelectedPage: (page: Page | null) => void;
};

const SelectedPageContext = createContext<SelectedPageContextProps | undefined>(undefined);

export function SelectedPageProvider({ children }: { children: ReactNode }) {
    const { pages } = usePageStore();
    const [selectedPage, setSelectedPage] = useState<Page | null>(null);

    // Send the selected page to the electron main process
    useEffect(() => {
        if (selectedPage)
            window.electron.sendSelectedPage(selectedPage.id);
    }, [selectedPage]);

    // Update the selected page if the pages list changes. This refreshes the information of the selected page
    useEffect(() => {
        if (selectedPage)
            setSelectedPage(pages.find(page => page.id === selectedPage.id) || null);
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
