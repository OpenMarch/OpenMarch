import { Button } from "@openmarch/ui";
import { CaretLeftIcon, CaretDownIcon, XIcon } from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { getSectionObjectByName, SECTIONS } from "@/global/classes/Sections";
import { toast } from "sonner";
import { MarcherListContents } from "../MarchersModal";
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
import { AppearanceEditor } from "@/components/marcher/appearance/AppearanceEditor";
import { useMemo } from "react";

export default function SectionAppearanceList() {
    const { t } = useTolgee();
    const { setContent, toggleOpen } = useSidebarModalStore();

    const queryClient = useQueryClient();
    const { data: sectionAppearances } = useQuery(
        allSectionAppearancesQueryOptions(),
    );
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
    const availableSections = Object.values(SECTIONS)
        .map((section) => section.name)
        .filter(
            (sectionName) =>
                !sectionAppearances?.some(
                    (appearance) => appearance.section === sectionName,
                ),
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
            <header className="flex justify-between gap-24">
                <div className="flex items-center gap-8">
                    <button
                        onClick={() => {
                            setContent(<MarcherListContents />, "marchers");
                        }}
                        className="hover:text-accent duration-150 ease-out"
                    >
                        <CaretLeftIcon size={24} />
                    </button>
                    <h4 className="text-h4 leading-none">
                        <T keyName="marchers.list.sectionStyles" />
                    </h4>
                </div>
                <div className="flex items-center gap-6">
                    <Dropdown.Root>
                        <Dropdown.Trigger
                            disabled={availableSections.length === 0}
                            asChild
                        >
                            <Button
                                variant="primary"
                                size="compact"
                                className="flex items-center gap-6"
                            >
                                <T keyName="marchers.list.addSectionStyle" />{" "}
                                <CaretDownIcon size={16} />
                            </Button>
                        </Dropdown.Trigger>
                        <Dropdown.Portal>
                            <Dropdown.Content className="bg-modal rounded-6 shadow-modal backdrop-blur-32 border-stroke z-[999] flex max-h-[70vh] flex-col items-start gap-0 overflow-y-auto border p-8">
                                <Dropdown.Label className="text-text-subtitle">
                                    <T keyName="marchers.list.sectionsInShow" />
                                </Dropdown.Label>
                                {allSectionsInShow.map((section) => (
                                    <Dropdown.Item
                                        key={section.name + "-in-show"}
                                        onSelect={() =>
                                            handleCreateNewAppearance(
                                                section.name,
                                            )
                                        }
                                        className="text-text text-body hover:text-accent w-full cursor-pointer px-6 py-4 text-left duration-150 ease-out outline-none"
                                    >
                                        {getTranslatedSectionName(
                                            section.name,
                                            t,
                                        )}
                                    </Dropdown.Item>
                                ))}
                                <Dropdown.Separator />
                                <Dropdown.Label className="text-text-subtitle">
                                    <T keyName="marchers.list.allSections" />
                                </Dropdown.Label>
                                {availableSections.map((sectionName) => (
                                    <Dropdown.Item
                                        key={sectionName}
                                        onSelect={() =>
                                            handleCreateNewAppearance(
                                                sectionName,
                                            )
                                        }
                                        className="text-text text-body hover:text-accent w-full cursor-pointer px-6 py-4 text-left duration-150 ease-out outline-none"
                                    >
                                        {getTranslatedSectionName(
                                            sectionName,
                                            t,
                                        )}
                                    </Dropdown.Item>
                                ))}
                            </Dropdown.Content>
                        </Dropdown.Portal>
                    </Dropdown.Root>
                    <button
                        onClick={toggleOpen}
                        className="hover:text-red duration-150 ease-out"
                    >
                        <XIcon size={24} />
                    </button>
                </div>
            </header>
            <div className="text-body text-text flex w-[28rem] flex-col gap-8 overflow-y-auto">
                <div className="flex h-fit w-full min-w-0 flex-col gap-16">
                    {sectionAppearances && sectionAppearances.length > 0 ? (
                        <>
                            {sectionAppearances.map((appearance) => (
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
