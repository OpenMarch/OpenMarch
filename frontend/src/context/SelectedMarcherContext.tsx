import { ReactNode, createContext, useContext, useState } from 'react';
import { Marcher } from '../types';

// Define the type for the context value
type SelectedMarcherContextProps = {
    selectedMarcher: Marcher | null;
    setSelectedMarcher: (marcher: Marcher | null) => void;
};

const SelectedMarcherContext = createContext<SelectedMarcherContextProps | undefined>(undefined);

export function SelectedMarcherProvider({ children }: { children: ReactNode }) {
    const [selectedMarcher, setSelectedMarcher] = useState<Marcher | null>(null);

    // Create the context value object
    const contextValue: SelectedMarcherContextProps = {
        selectedMarcher,
        setSelectedMarcher,
    };

    return (
        <SelectedMarcherContext.Provider value={contextValue}>
            {children}
        </SelectedMarcherContext.Provider>
    );
}

export function useSelectedMarcher() {
    return useContext(SelectedMarcherContext);
}
