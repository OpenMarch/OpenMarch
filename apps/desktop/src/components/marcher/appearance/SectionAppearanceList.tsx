import { TabContent, TabItem, Tabs, TabsList } from "@openmarch/ui";
import { PlusIcon } from "@phosphor-icons/react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { getSectionObjectByName, SECTIONS } from "@/global/classes/Sections";
import { toast } from "sonner";
import { T, useTolgee } from "@tolgee/react";
import { getTranslatedSectionName } from "@/global/classes/Sections";
import { NewSectionAppearanceArgs } from "@/db-functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    allMarchersQueryOptions,
    allSectionAppearancesQueryOptions,
    createSectionAppearancesMutationOptions,
    deleteSectionAppearancesMutationOptions,
    updateSectionAppearancesMutationOptions,
} from "@/hooks/queries";
import { AppearanceEditor } from "@/components/AppearanceEditor";
import { useMemo } from "react";
import { twMerge } from "tailwind-merge";

export default function SectionAppearanceList() {
    const { t } = useTolgee();
    const queryClient = useQueryClient();
    const { data: sectionAppearances } = useQuery(
        allSectionAppearancesQueryOptions(),
    );

    const sectionAppearancesSorted = useMemo(() => {
        return Array.from(sectionAppearances || []).sort((a, b) =>
            getSectionObjectByName(a.section).compareTo(
                getSectionObjectByName(b.section),
            ),
        );
    }, [sectionAppearances]);
    /** A set of all sections that have an appearance */
    const takenSections = useMemo(() => {
        return new Set(
            sectionAppearancesSorted.map((appearance) => appearance.section),
        );
    }, [sectionAppearancesSorted]);

    const { mutateAsync: createSectionAppearances } = useMutation(
        createSectionAppearancesMutationOptions(queryClient),
    );
    const { mutateAsync: updateSectionAppearances } = useMutation(
        updateSectionAppearancesMutationOptions(queryClient),
    );
    const { mutateAsync: deleteSectionAppearances } = useMutation(
        deleteSectionAppearancesMutationOptions(queryClient),
    );
    const { data: allMarchers } = useQuery(allMarchersQueryOptions());
    const allSectionsInShow = useMemo(() => {
        const allSections = allMarchers?.map((marcher) =>
            getSectionObjectByName(marcher.section),
        );
        if (!allSections || allSections.length === 0) return [];

        const uniqueSections = new Set(allSections);
        return Array.from(uniqueSections).sort((a, b) => a.compareTo(b));
    }, [allMarchers]);

    const defaultShapeType = "circle";

    // Get available sections (sections without appearances)
    const availableSections = Object.values(SECTIONS).map(
        (section) => section.name,
    );

    async function handleCreateNewAppearance(sectionName: string) {
        if (!sectionName) {
            return;
        }

        const newAppearance: NewSectionAppearanceArgs = {
            section: sectionName,
            fill_color: null,
            outline_color: null,
            shape_type: defaultShapeType,
            visible: true,
            label_visible: true,
        };

        try {
            await createSectionAppearances([newAppearance]);
            toast.success(`Added style for ${sectionName}`);
        } catch (error) {
            toast.error("Failed to create section appearance");
            console.error("Error creating section appearance:", error);
        }
    }

    return (
        <div className="animate-scale-in flex flex-col gap-8">
            <header className="flex justify-between gap-24 px-8">
                <div className="flex-grow"></div>
                <Dropdown.Root>
                    <Dropdown.Trigger
                        disabled={availableSections.length === 0}
                        asChild
                    >
                        <div className="hover:text-accent flex cursor-pointer items-center gap-6 transition-colors duration-150">
                            <PlusIcon size={16} />
                            <T keyName="marchers.list.addSectionStyle" />{" "}
                        </div>
                    </Dropdown.Trigger>
                    <Dropdown.Portal>
                        <Dropdown.Content className="bg-modal rounded-6 shadow-modal backdrop-blur-32 border-stroke z-[999] flex max-h-[70vh] flex-col items-start gap-0 overflow-y-auto border p-8">
                            <Tabs
                                defaultValue={
                                    allSectionsInShow.length > 0
                                        ? "inShow"
                                        : "all"
                                }
                            >
                                <TabsList>
                                    {allSectionsInShow.length > 0 && (
                                        <TabItem value="inShow">
                                            In show
                                        </TabItem>
                                    )}
                                    <TabItem value="all">All</TabItem>
                                </TabsList>

                                <TabContent
                                    value="inShow"
                                    style={{ marginTop: "-12px" }}
                                >
                                    {allSectionsInShow.map((section) => (
                                        <Dropdown.Item
                                            disabled={takenSections.has(
                                                section.name,
                                            )}
                                            key={section.name + "-in-show"}
                                            onSelect={() =>
                                                handleCreateNewAppearance(
                                                    section.name,
                                                )
                                            }
                                            className={twMerge(
                                                "text-body w-full px-6 py-4 text-left outline-none",
                                                takenSections.has(section.name)
                                                    ? "text-text-disabled"
                                                    : "text-text hover:text-accent cursor-pointer duration-150 ease-out",
                                            )}
                                        >
                                            {getTranslatedSectionName(
                                                section.name,
                                                t,
                                            )}
                                        </Dropdown.Item>
                                    ))}
                                </TabContent>
                                <TabContent
                                    value="all"
                                    style={{ marginTop: "-12px" }}
                                >
                                    {availableSections.map((sectionName) => (
                                        <Dropdown.Item
                                            key={sectionName}
                                            disabled={takenSections.has(
                                                sectionName,
                                            )}
                                            onSelect={() =>
                                                handleCreateNewAppearance(
                                                    sectionName,
                                                )
                                            }
                                            className={twMerge(
                                                "text-body w-full px-6 py-4 text-left outline-none",
                                                takenSections.has(sectionName)
                                                    ? "text-text-disabled"
                                                    : "text-text hover:text-accent cursor-pointer duration-150 ease-out",
                                            )}
                                        >
                                            {getTranslatedSectionName(
                                                sectionName,
                                                t,
                                            )}
                                        </Dropdown.Item>
                                    ))}
                                </TabContent>
                            </Tabs>
                        </Dropdown.Content>
                    </Dropdown.Portal>
                </Dropdown.Root>
            </header>
            <div className="text-body text-text flex w-[28rem] flex-col gap-8 overflow-y-auto">
                <div className="flex h-fit w-full min-w-0 flex-col gap-16">
                    {sectionAppearances && sectionAppearances.length > 0 ? (
                        <>
                            {sectionAppearancesSorted.map((appearance) => (
                                <AppearanceEditor
                                    key={appearance.id}
                                    label={getTranslatedSectionName(
                                        appearance.section,
                                        t,
                                    )}
                                    appearance={appearance}
                                    handleUpdateAppearance={(
                                        modifiedAppearance,
                                    ) =>
                                        void updateSectionAppearances([
                                            {
                                                id: appearance.id,
                                                ...modifiedAppearance,
                                            },
                                        ])
                                    }
                                    handleDeleteAppearance={() =>
                                        void deleteSectionAppearances(
                                            new Set([appearance.id]),
                                        )
                                    }
                                />
                            ))}
                        </>
                    ) : (
                        <p className="text-body text-text/90">
                            <T keyName="marchers.list.noSectionStyles" />
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
