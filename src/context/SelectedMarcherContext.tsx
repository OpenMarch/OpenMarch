import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { Marcher } from '../Interfaces';
import { useMarcherStore } from '@/stores/Store';
import { getMarchers } from '@/api/api';

// Define the type for the context value
type SelectedMarcherContextProps = {
    selectedMarcher: Marcher | null;
    setSelectedMarcher: (marcher: Marcher | null) => void;
};

const SelectedMarcherContext = createContext<SelectedMarcherContextProps | undefined>(undefined);

export function SelectedMarcherProvider({ children }: { children: ReactNode }) {
    const { marchers } = useMarcherStore();
    const [selectedMarcher, setSelectedMarcher] = useState<Marcher | null>(null);

    // Send the selected marcher to the electron main process
    useEffect(() => {
        if (selectedMarcher)
            window.electron.getSelectedMarchers([selectedMarcher.id]);
    }, [selectedMarcher]);

    // Update the selected marcher if the marchers list changes
    useEffect(() => {
        if (selectedMarcher)
            setSelectedMarcher(marchers.find(marcher => marcher.id === selectedMarcher.id) || null);
    }, [marchers]);

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
