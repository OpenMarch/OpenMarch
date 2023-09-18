import { ReactNode, createContext, useContext, useState } from 'react';
import { Page } from '../types';

// Define the type for the context value
type SelectedPageContextProps = {
    selectedPage: Page | null;
    setSelectedPage: (page: Page | null) => void;
};

const SelectedPageContext = createContext<SelectedPageContextProps | undefined>(undefined);

export function SelectedPageProvider({ children }: { children: ReactNode }) {
    const [selectedPage, setSelectedPage] = useState<Page | null>(null);

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
