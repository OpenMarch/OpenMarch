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
import { marcherAppearancesQueryOptions } from "@/hooks/queries/useMarcherAppearances";
import { appearanceIsHidden } from "@/entity-components/appearance";
import { analytics } from "@/utilities/analytics";

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
    const selectedPageContext = useSelectedPage();
    const selectedPage = selectedPageContext?.selectedPage ?? null;
    const queryClient = useQueryClient();
    const { data: marcherAppearances } = useQuery({
        ...marcherAppearancesQueryOptions(selectedPage?.id, queryClient),
        enabled: selectedPage !== null,
    });
    const hiddenMarcherIds: Set<number> = useMemo(() => {
        if (marcherAppearances == null) return new Set();
        const hiddenMarcherIds = new Set(
            Object.entries(marcherAppearances)
                .filter((marcherAppearance) =>
                    appearanceIsHidden(marcherAppearance[1]),
                )
                .map((marcherAppearance) => parseInt(marcherAppearance[0])),
        );
        return hiddenMarcherIds;
    }, [marcherAppearances]);

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
        setSelectedMarchers: (newMarchers) => {
            const currentIds = new Set(selectedMarchers.map((m) => m.id));
            const newIds = new Set(newMarchers.map((m) => m.id));
            if (!setsAreEqual(currentIds, newIds)) {
                analytics.trackSelectionChanged("marcher", newMarchers.length);
            }
            setSelectedMarchers(newMarchers);
        },
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
