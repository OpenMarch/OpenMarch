import Marcher from "@/global/classes/Marcher";
import {
    FAMILIES,
    getSectionObjectByName,
    getTranslatedSectionName,
    SectionFamily,
} from "@/global/classes/Sections";
import {
    allMarchersQueryOptions,
    allTagsQueryOptions,
    marcherIdsForAllTagIdsQueryOptions,
} from "@/hooks/queries";
import { useQuery } from "@tanstack/react-query";
import ToolbarSection from "../ToolbarSection";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useCallback, useEffect, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import * as Popover from "@radix-ui/react-popover";
import { getTagName, type DatabaseTag } from "@/db-functions/tag";
import ChipSelector from "./ChipSelector";

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

    const selectMarcherIds = useCallback(
        (ids: number[], options?: { shiftKey?: boolean }) => {
            const newSelectedMarchers = allMarchers.filter((marcher) =>
                ids.includes(marcher.id),
            );

            // if holding shift, add to selection
            if (options?.shiftKey) {
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

    return { selectMarcherIds };
};

const SelectByOptions = ["section", "tag", "family", "drillPrefix"] as const;
type SelectByOption = (typeof SelectByOptions)[number];
function SelectByPopover({
    selectByOptionState,
}: {
    selectByOptionState: [
        SelectByOption,
        React.Dispatch<React.SetStateAction<SelectByOption>>,
    ];
}) {
    const [selectByOptionStateValue, setSelectByOption] = selectByOptionState;
    const [open, setOpen] = useState(false);

    return (
        <ToolbarSection>
            <Popover.Root open={open} onOpenChange={setOpen}>
                <Popover.Trigger className="hover:text-accent flex items-center gap-6 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50">
                    <T keyName="toolbar.select.selectByText" />
                    <CaretDownIcon size={18} />
                    <span className="text-text-subtitle px-4">
                        <T
                            keyName={`toolbar.select.selectBy.${selectByOptionStateValue}`}
                        />
                    </span>
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content className="bg-modal text-text rounded-6 shadow-modal backdrop-blur-32 border-stroke z-50 m-8 flex flex-col items-start gap-0 border p-8">
                        {SelectByOptions.map((option) => (
                            <button
                                key={option}
                                className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                                onClick={() => {
                                    setSelectByOption(option);
                                    setOpen(false);
                                }}
                            >
                                <T
                                    keyName={`toolbar.select.selectBy.${option}`}
                                />
                            </button>
                        ))}
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>
        </ToolbarSection>
    );
}

function SectionSelector({ marchers }: { marchers: Marcher[] }) {
    const { t } = useTranslate();
    const sections = sectionsFromMarchers(marchers ?? []);
    const { selectMarcherIds } = useHandleSelect({
        allMarchers: marchers ?? [],
    });

    const handleSelectBySection = useCallback(
        (
            section: (typeof sections)[number],
            options?: { shiftKey?: boolean },
        ) => {
            const marcherIds = marchers
                .filter((marcher) => marcher.section === section.name)
                .map((marcher) => marcher.id);
            selectMarcherIds(marcherIds, options);
        },
        [marchers, selectMarcherIds],
    );

    return (
        <ToolbarSection aria-label="Select sections">
            <ChipSelector
                items={sections}
                getId={(section) => section.name}
                getLabel={(section) => <T keyName={section.tName} />}
                getSearchText={(section) =>
                    getTranslatedSectionName(section.name, t)
                }
                onSelect={handleSelectBySection}
                emptyMessage={
                    <div>
                        <T keyName="toolbar.select.noSectionsToSelect" />
                    </div>
                }
                ariaLabel="Select sections"
                recentCategory="section"
            />
        </ToolbarSection>
    );
}

function TagSelector({ marchers }: { marchers: Marcher[] }) {
    const { data: tags, isSuccess: tagsLoaded } = useQuery(
        allTagsQueryOptions(),
    );
    const { data: marcherIdsForTags, isSuccess: marcherIdsForTagsLoaded } =
        useQuery(marcherIdsForAllTagIdsQueryOptions());
    const { selectMarcherIds } = useHandleSelect({
        allMarchers: marchers ?? [],
    });

    const handleSelectByTag = useCallback(
        (tag: DatabaseTag, options?: { shiftKey?: boolean }) => {
            if (!marcherIdsForTagsLoaded) {
                console.error("Marcher IDs for tags not loaded");
                return false;
            }
            const marcherIds = marcherIdsForTags.get(tag.id);
            if (marcherIds == null) {
                console.error(`Marcher IDs for tag ${tag.id} not found`);
                return false;
            }
            selectMarcherIds(marcherIds, options);
        },
        [marcherIdsForTags, marcherIdsForTagsLoaded, selectMarcherIds],
    );

    return (
        <ToolbarSection aria-label="Select tags">
            <ChipSelector
                items={
                    tagsLoaded && marcherIdsForTagsLoaded ? (tags ?? []) : []
                }
                getId={(tag) => tag.id}
                getLabel={(tag) =>
                    getTagName({ tag_id: tag.id, name: tag.name })
                }
                getSearchText={(tag) =>
                    getTagName({ tag_id: tag.id, name: tag.name })
                }
                onSelect={handleSelectByTag}
                emptyMessage={
                    <div>
                        <T keyName="toolbar.select.noTagsToSelect" />
                    </div>
                }
                ariaLabel="Select tags"
                recentCategory="tag"
            />
        </ToolbarSection>
    );
}

function DrillPrefixSelector({ marchers }: { marchers: Marcher[] }) {
    const drillPrefixes = Array.from(
        new Set(marchers.map((marcher) => marcher.drill_prefix)),
    ).sort();
    const { selectMarcherIds } = useHandleSelect({
        allMarchers: marchers ?? [],
    });

    const handleSelectByDrillPrefix = useCallback(
        (drillPrefix: string, options?: { shiftKey?: boolean }) => {
            const marcherIds = marchers
                .filter((marcher) => marcher.drill_prefix === drillPrefix)
                .map((marcher) => marcher.id);
            selectMarcherIds(marcherIds, options);
        },
        [marchers, selectMarcherIds],
    );

    return (
        <ToolbarSection aria-label="Select drill prefixes">
            <ChipSelector
                items={drillPrefixes}
                getId={(drillPrefix) => drillPrefix}
                getLabel={(drillPrefix) => drillPrefix}
                getSearchText={(drillPrefix) => drillPrefix}
                onSelect={handleSelectByDrillPrefix}
                emptyMessage={
                    <div>
                        <T keyName="toolbar.select.noDrillPrefixesToSelect" />
                    </div>
                }
                ariaLabel="Select drill prefixes"
                recentCategory="drillPrefix"
            />
        </ToolbarSection>
    );
}

function FamilySelector({ marchers }: { marchers: Marcher[] }) {
    const { t } = useTranslate();
    const sections = sectionsFromMarchers(marchers ?? []);
    const { selectMarcherIds } = useHandleSelect({
        allMarchers: marchers ?? [],
    });
    const families = Object.values(FAMILIES);
    const handleSelectByFamily = useCallback(
        (family: SectionFamily, options?: { shiftKey?: boolean }) => {
            const sectionsToSelect = sections.filter(
                (section) => section.family.name === family.name,
            );
            const sectionNames = new Set(
                sectionsToSelect.map((section) => section.name),
            );
            const marcherIdsToSelect = marchers
                .filter((marcher) => sectionNames.has(marcher.section))
                .map((marcher) => marcher.id);
            selectMarcherIds(marcherIdsToSelect, options);
        },
        [marchers, sections, selectMarcherIds],
    );

    return (
        <ToolbarSection aria-label="Select families">
            <ChipSelector
                items={families}
                getId={(family) => family.name}
                getLabel={(family) => <T keyName={family.tName} />}
                getSearchText={(family) => t(family.tName)}
                onSelect={handleSelectByFamily}
                ariaLabel="Select families"
            />
        </ToolbarSection>
    );
}

const SELECT_BY_STORAGE_KEY = "openmarch-select-tab-mode";

function SelectTabContents() {
    const { data: marchers, isSuccess: marchersLoaded } = useQuery(
        allMarchersQueryOptions(),
    );
    const [selectByOption, setSelectByOption] = useState<SelectByOption>(() => {
        const stored = localStorage.getItem(SELECT_BY_STORAGE_KEY);
        if (stored && SelectByOptions.includes(stored as SelectByOption)) {
            return stored as SelectByOption;
        }
        return "section";
    });

    useEffect(() => {
        localStorage.setItem(SELECT_BY_STORAGE_KEY, selectByOption);
    }, [selectByOption]);

    if (!marchersLoaded) {
        return <div>Loading...</div>;
    }
    let Selector: React.JSX.Element;
    switch (selectByOption) {
        case "section":
            Selector = <SectionSelector marchers={marchers ?? []} />;
            break;
        case "tag":
            Selector = <TagSelector marchers={marchers ?? []} />;
            break;
        case "drillPrefix":
            Selector = <DrillPrefixSelector marchers={marchers ?? []} />;
            break;
        case "family":
            Selector = <FamilySelector marchers={marchers ?? []} />;
            break;
        default:
            Selector = <div>No selector found</div>;
            break;
    }
    return (
        <>
            <SelectByPopover
                selectByOptionState={[selectByOption, setSelectByOption]}
            />
            {Selector}
        </>
    );
}
