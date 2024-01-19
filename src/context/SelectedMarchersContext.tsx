import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { Marcher } from '../Interfaces';
import { useMarcherStore } from '@/stores/Store';
import { getMarchers } from '@/api/api';

// Define the type for the context value
type SelectedMarcherContextProps = {
    selectedMarchers: Marcher | null;
    setSelectedMarchers: (marcher: Marcher | null) => void;
};

const SelectedMarcherContext = createContext<SelectedMarcherContextProps | undefined>(undefined);

export function SelectedMarchersProvider({ children }: { children: ReactNode }) {
    const { marchers } = useMarcherStore();
    const [selectedMarchers, setSelectedMarchers] = useState<Marcher | null>(null);

    // Send the selected marcher to the electron main process
    useEffect(() => {
        if (selectedMarchers)
            window.electron.getSelectedMarchers([selectedMarchers.id]);
    }, [selectedMarchers]);

    // Update the selected marcher if the marchers list changes
    useEffect(() => {
        if (selectedMarchers) {
            // const newMarcher = marchers.find(marcher => marcher.id === selectedMarchers.id);
            setSelectedMarchers(marchers.find(marcher => marcher.id === selectedMarchers.id) || null);
        }
    }, [marchers]);

    // Create the context value object
    const contextValue: SelectedMarcherContextProps = {
        selectedMarchers,
        setSelectedMarchers,
    };

    return (
        <SelectedMarcherContext.Provider value={contextValue}>
            {children}
        </SelectedMarcherContext.Provider>
    );
}

export function useSelectedMarchers() {
    return useContext(SelectedMarcherContext);
}
