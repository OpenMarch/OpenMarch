import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { useMarcherStore } from '@/stores/marcher/useMarcherStore';
import { Marcher } from '@/global/classes/Marcher';

// Define the type for the context value
type SelectedMarcherContextProps = {
    selectedMarchers: Marcher[];
    setSelectedMarchers: (marchers: Marcher[]) => void;
};

const SelectedMarcherContext = createContext<SelectedMarcherContextProps | undefined>(undefined);

export function SelectedMarchersProvider({ children }: { children: ReactNode }) {
    const { marchers } = useMarcherStore();
    const [selectedMarchers, setSelectedMarchers] = useState<Marcher[]>([]);

    // Send the selected marcher to the electron main process
    useEffect(() => {
        if (selectedMarchers)
            window.electron.sendSelectedMarchers(selectedMarchers.map(m => m.id));
    }, [selectedMarchers]);

    // Update the selected marcher if the marchers list changes. This refreshes the information of the selected marcher
    useEffect(() => {
        if (selectedMarchers) {
            const newSelectedMarchers = selectedMarchers.filter(marcher => marchers.some(m => m.id === marcher.id));
            setSelectedMarchers(newSelectedMarchers);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
