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
import { useTimelineMode } from "@/hooks/queries/useWorkspaceSettings";
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
    const selectedPageContext = useSelectedPage();
    const selectedPage = selectedPageContext?.selectedPage ?? null;
    const queryClient = useQueryClient();
    // Hidden marchers can't be selected. Page mode reads the selected page's appearances; timeline
    // mode samples the appearance steps at the beat the paused canvas shows, as the canvas draws
    // them (UI-9, `useTimelineAppearance`)
    const timelineMode = useTimelineMode();
    const { data: marcherAppearances } = useQuery({
        ...marcherAppearancesQueryOptions(selectedPage?.id, queryClient),
        enabled: selectedPage !== null && !timelineMode,
    });
    const appearanceSteps = useMarcherAppearanceSteps(timelineMode);
    const changeBeats = useMemo(
        () => (appearanceSteps ? appearanceChangeBeats(appearanceSteps) : []),
        [appearanceSteps],
    );
    // Re-render only when the displayed beat crosses an appearance change, not on every beat
    const changeIndex = useTimelineSelectionStore((s) =>
        changeIndexAtBeat(changeBeats, displayedBeat(s)),
    );
    const hiddenMarcherIds: Set<number> = useMemo(() => {
        if (timelineMode)
            return appearanceSteps
                ? hiddenMarcherIdsAtBeat(
                      appearanceSteps,
                      changeIndex > 0 ? changeBeats[changeIndex - 1]! : 0,
                  )
                : new Set();
        if (marcherAppearances == null) return new Set();
        const hiddenMarcherIds = new Set(
            Object.entries(marcherAppearances)
                .filter((marcherAppearance) =>
                    appearanceIsHidden(marcherAppearance[1]),
                )
                .map((marcherAppearance) => parseInt(marcherAppearance[0])),
        );
        return hiddenMarcherIds;
    }, [
        timelineMode,
        appearanceSteps,
        changeBeats,
        changeIndex,
        marcherAppearances,
    ]);

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
