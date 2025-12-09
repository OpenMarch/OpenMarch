import Marcher from "@/global/classes/Marcher";
import {
    FAMILIES,
    getSectionObjectByName,
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
import { T } from "@tolgee/react";
import * as Popover from "@radix-ui/react-popover";
import { getTagName } from "@/db-functions/tag";

export default function ViewTab() {
    return (
        <div className="flex w-full flex-wrap gap-8">
            <SelectTabContents />
        </div>
    );
}

const Separator = () => {
    return <span className="text-text-subtitle opacity-50">|</span>;
};

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
        (e: React.MouseEvent<HTMLButtonElement>, ids: number[]) => {
            e.preventDefault();
            const newSelectedMarchers = allMarchers.filter((marcher) =>
                ids.includes(marcher.id),
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
    const sections = sectionsFromMarchers(marchers ?? []);
    const { selectMarcherIds } = useHandleSelect({
        allMarchers: marchers ?? [],
    });

    const handleSelectBySection = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>, section: string) => {
            e.preventDefault();
            const marcherIds = marchers
                .filter((marcher) => marcher.section === section)
                .map((marcher) => marcher.id);
            selectMarcherIds(e, marcherIds);
        },
        [marchers, selectMarcherIds],
    );

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
                                <T keyName={section.tName} />
                            </button>
                            {index < sections.length - 1 && <Separator />}
                        </div>
                    ))
                ) : (
                    <div>
                        <T keyName="toolbar.select.noSectionsToSelect" />
                    </div>
                )}
            </div>
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
        (e: React.MouseEvent<HTMLButtonElement>, tagId: number) => {
            e.preventDefault();
            if (!marcherIdsForTagsLoaded) {
                console.error("Marcher IDs for tags not loaded");
                return;
            }
            const marcherIds = marcherIdsForTags.get(tagId);
            if (marcherIds == null) {
                console.error(`Marcher IDs for tag ${tagId} not found`);
                return;
            }
            selectMarcherIds(e, marcherIds);
        },
        [marcherIdsForTags, marcherIdsForTagsLoaded, selectMarcherIds],
    );

    return (
        <ToolbarSection aria-label="Select sections">
            <div className="flex gap-8">
                {tagsLoaded && tags?.length > 0 ? (
                    tags.map((tag, index) => (
                        <div key={tag.id} className="flex items-center gap-8">
                            <button
                                className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                                onClick={(e) => handleSelectByTag(e, tag.id)}
                            >
                                {getTagName({ tag_id: tag.id, name: tag.name })}
                            </button>
                            {index < tags.length - 1 && <Separator />}
                        </div>
                    ))
                ) : (
                    <div>
                        <T keyName="toolbar.select.noTagsToSelect" />
                    </div>
                )}
            </div>
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
        (e: React.MouseEvent<HTMLButtonElement>, drillPrefix: string) => {
            e.preventDefault();
            const marcherIds = marchers
                .filter((marcher) => marcher.drill_prefix === drillPrefix)
                .map((marcher) => marcher.id);
            selectMarcherIds(e, marcherIds);
        },
        [marchers, selectMarcherIds],
    );

    return (
        <ToolbarSection aria-label="Select drill prefixes">
            <div className="flex gap-8">
                {drillPrefixes.length > 0 ? (
                    drillPrefixes.map((drillPrefix, index) => (
                        <div
                            key={drillPrefix}
                            className="flex items-center gap-8"
                        >
                            <button
                                className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                                onClick={(e) =>
                                    handleSelectByDrillPrefix(e, drillPrefix)
                                }
                            >
                                {drillPrefix}
                            </button>
                            {index < drillPrefixes.length - 1 && <Separator />}
                        </div>
                    ))
                ) : (
                    <div>
                        <T keyName="toolbar.select.noDrillPrefixesToSelect" />
                    </div>
                )}
            </div>
        </ToolbarSection>
    );
}

function FamilySelector({ marchers }: { marchers: Marcher[] }) {
    const sections = sectionsFromMarchers(marchers ?? []);
    const { selectMarcherIds } = useHandleSelect({
        allMarchers: marchers ?? [],
    });
    const families = Object.values(FAMILIES);
    const handleSelectByFamily = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>, family: SectionFamily) => {
            e.preventDefault();
            const sectionsToSelect = sections.filter(
                (section) => section.family.name === family.name,
            );
            const sectionNames = new Set(
                sectionsToSelect.map((section) => section.name),
            );
            const marcherIdsToSelect = marchers
                .filter((marcher) => sectionNames.has(marcher.section))
                .map((marcher) => marcher.id);
            selectMarcherIds(e, marcherIdsToSelect);
        },
        [marchers, sections, selectMarcherIds],
    );

    return (
        <ToolbarSection aria-label="Select families">
            <div className="flex gap-8">
                {families.map((family, index) => (
                    <div key={family.name} className="flex items-center gap-8">
                        <button
                            className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                            onClick={(e) => handleSelectByFamily(e, family)}
                        >
                            <T keyName={family.tName} />
                        </button>
                        {index < families.length - 1 && <Separator />}
                    </div>
                ))}
            </div>
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
