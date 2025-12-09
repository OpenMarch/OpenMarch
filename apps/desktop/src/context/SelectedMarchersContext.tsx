import {
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import Marcher from "@/global/classes/Marcher";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { allMarchersQueryOptions } from "@/hooks/queries/useMarchers";
import { useSelectedPage } from "./SelectedPageContext";
import { marcherWithVisualsQueryOptions } from "@/hooks/queries";

// Define the type for the context value
type SelectedMarcherContextProps = {
    selectedMarchers: Marcher[];
    setSelectedMarchers: (marchers: Marcher[]) => void;
};

const setsAreEqual = (set1: Set<number>, set2: Set<number>) => {
    return (
        set1.size === set2.size &&
        Array.from(set1).every((value) => set2.has(value))
    );
};

const SelectedMarcherContext = createContext<
    SelectedMarcherContextProps | undefined
>(undefined);

export function SelectedMarchersProvider({
    children,
}: {
    children: ReactNode;
}) {
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const [selectedMarchers, setSelectedMarchers] = useState<Marcher[]>([]);
    const { selectedPage } = useSelectedPage()!;
    const queryClient = useQueryClient();
    const { data: marcherVisuals } = useQuery(
        marcherWithVisualsQueryOptions(selectedPage?.id, queryClient),
    );
    const hiddenMarcherIds: Set<number> = useMemo(() => {
        if (marcherVisuals == null) return new Set();
        const hiddenMarcherIds = new Set(
            Object.values(marcherVisuals)
                .filter((marcherVisual) => marcherVisual.isHidden())
                .map((marcherVisual) => marcherVisual.marcherId),
        );
        return hiddenMarcherIds;
    }, [marcherVisuals]);

    // Update the selected marcher if the marchers list changes. This refreshes the information of the selected marcher
    useEffect(() => {
        if (selectedMarchers && marchers) {
            const newSelectedMarchers = selectedMarchers.filter((marcher) =>
                marchers.some((m) => m.id === marcher.id),
            );

            setSelectedMarchers(newSelectedMarchers);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [marchers]);

    // Ensure that hidden marchers cannot be selected
    useEffect(() => {
        const currentSelectedMarcherIds = new Set(
            selectedMarchers.map((marcher) => marcher.id),
        );
        const newSelectedMarchers = selectedMarchers.filter(
            (marcher) => !hiddenMarcherIds.has(marcher.id),
        );
        const newSelectedMarcherIds = new Set(
            newSelectedMarchers.map((marcher) => marcher.id),
        );
        if (!setsAreEqual(currentSelectedMarcherIds, newSelectedMarcherIds)) {
            setSelectedMarchers(Array.from(newSelectedMarchers));
        }
    }, [hiddenMarcherIds, selectedMarchers]);

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
