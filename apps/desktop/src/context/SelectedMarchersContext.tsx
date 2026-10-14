import {
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import Marcher from "@/global/classes/Marcher";
import { useQuery } from "@tanstack/react-query";
import { allMarchersQueryOptions } from "@/hooks/queries/useMarchers";
import { useMarcherAppearanceSteps } from "@/hooks/useMarcherAppearanceSteps";
import {
    appearanceChangeBeats,
    changeIndexAtBeat,
    hiddenMarcherIdsAtBeat,
} from "@/services/appearance/appearanceSteps";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";

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
    // Hidden marchers can't be selected: the appearance steps sampled at the beat the paused
    // canvas shows, as the canvas draws them (UI-9, `useTimelineAppearance`)
    const appearanceSteps = useMarcherAppearanceSteps(true);
    const changeBeats = useMemo(
        () => (appearanceSteps ? appearanceChangeBeats(appearanceSteps) : []),
        [appearanceSteps],
    );
    // Re-render only when the displayed beat crosses an appearance change, not on every beat
    const changeIndex = useTimelineSelectionStore((s) =>
        changeIndexAtBeat(changeBeats, displayedBeat(s)),
    );
    const hiddenMarcherIds: Set<number> = useMemo(
        () =>
            appearanceSteps
                ? hiddenMarcherIdsAtBeat(
                      appearanceSteps,
                      changeIndex > 0 ? changeBeats[changeIndex - 1]! : 0,
                  )
                : new Set(),
        [appearanceSteps, changeBeats, changeIndex],
    );

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

    // Memoised so a provider render (a page change re-renders it) doesn't re-render every consumer
    const contextValue: SelectedMarcherContextProps = useMemo(
        () => ({ selectedMarchers, setSelectedMarchers }),
        [selectedMarchers],
    );

    return (
        <SelectedMarcherContext.Provider value={contextValue}>
            {children}
        </SelectedMarcherContext.Provider>
    );
}

export function useSelectedMarchers() {
    return useContext(SelectedMarcherContext);
}
