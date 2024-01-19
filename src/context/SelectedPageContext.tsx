import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { Page } from '../Interfaces';
import { usePageStore } from '@/stores/Store';

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
            window.electron.getSelectedPage(selectedPage.id);
    }, [selectedPage]);

    // Update the selected page if the pages list changes
    useEffect(() => {
        if (selectedPage)
            setSelectedPage(pages.find(page => page.id === selectedPage.id) || null);
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
