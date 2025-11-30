import Marcher from "@/global/classes/Marcher";
import { getSectionObjectByName } from "@/global/classes/Sections";
import { allMarchersQueryOptions } from "@/hooks/queries";
import { useQuery } from "@tanstack/react-query";
import ToolbarSection from "../ToolbarSection";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useCallback } from "react";

export default function ViewTab() {
    return (
        <div className="flex w-full flex-wrap gap-8">
            <SelectTabContents />
        </div>
    );
}

const sectionsFromMarchers = (marchers: Pick<Marcher, "section">[]) => {
    const sectionStrings = new Set([
        ...marchers.map((marcher) => marcher.section),
    ]);
    const sections = Array.from(sectionStrings)
        .map((sectionString) => getSectionObjectByName(sectionString))
        .sort((a, b) => a.compareTo(b));

    return sections;
};

const useHandleSelect = ({ allMarchers }: { allMarchers: Marcher[] }) => {
    const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;

    const handleSelectBySection = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>, section: string) => {
            e.preventDefault();
            const newSelectedMarchers = allMarchers.filter(
                (marcher) => marcher.section === section,
            );

            // if holding shift, add to selection
            if (e.shiftKey) {
                const currentlySelectedIds = new Set(
                    selectedMarchers.map((marcher) => marcher.id),
                );
                const newSelectedMarchersToAdd = newSelectedMarchers.filter(
                    (marcher) => !currentlySelectedIds.has(marcher.id),
                );
                setSelectedMarchers([
                    ...selectedMarchers,
                    ...newSelectedMarchersToAdd,
                ]);
            } else {
                setSelectedMarchers(newSelectedMarchers);
            }
        },
        [allMarchers, selectedMarchers, setSelectedMarchers],
    );

    return { handleSelectBySection };
};

function SelectTabContents() {
    const { data: marchers, isSuccess: marchersLoaded } = useQuery(
        allMarchersQueryOptions(),
    );
    const sections = sectionsFromMarchers(marchers ?? []);
    const { handleSelectBySection } = useHandleSelect({
        allMarchers: marchers ?? [],
    });

    if (!marchersLoaded) {
        return <div>Loading...</div>;
    }
    return (
        <ToolbarSection aria-label="Select sections">
            <div className="flex gap-8">
                {sections.length > 0 ? (
                    sections.map((section, index) => (
                        <div
                            key={section.name}
                            className="flex items-center gap-8"
                        >
                            <button
                                className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                                onClick={(e) =>
                                    handleSelectBySection(e, section.name)
                                }
                            >
                                {section.name}
                            </button>
                            {index < sections.length - 1 && <span>|</span>}
                        </div>
                    ))
                ) : (
                    <div>No sections to select found</div>
                )}
            </div>
        </ToolbarSection>
    );
}
