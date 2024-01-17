import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { Page } from '../Interfaces';

// Define the type for the context value
type SelectedPageContextProps = {
    selectedPage: Page | null;
    setSelectedPage: (page: Page | null) => void;
};

const SelectedPageContext = createContext<SelectedPageContextProps | undefined>(undefined);

export function SelectedPageProvider({ children }: { children: ReactNode }) {
    const [selectedPage, setSelectedPage] = useState<Page | null>(null);

    useEffect(() => {
        if (selectedPage)
            window.electron.getSelectedPage(selectedPage.id);
    }, [selectedPage]);

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
