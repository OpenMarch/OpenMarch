import { useEffect, useMemo, useState } from "react";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import NewMarcherForm from "@/components/marcher/NewMarcherForm";
import { useQuery } from "@tanstack/react-query";
import { allMarchersQueryOptions } from "@/hooks/queries";
import { T, useTolgee } from "@tolgee/react";
import Marcher from "@/global/classes/Marcher";
import * as RadixCollapsible from "@radix-ui/react-collapsible";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import {
    getSectionObjectByName,
    getTranslatedSectionName,
} from "@/global/classes/Sections";

export default function PerformersStep() {
    const { updatePerformers } = useGuidedSetupStore();
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const [openSections, setOpenSections] = useState<Set<string>>(new Set());
    const { t } = useTolgee();

    // Update wizard state when marchers in database change
    // Convert Marcher objects to NewMarcherArgs format for wizard state
    useEffect(() => {
        if (marchers) {
            const marcherArgs = marchers.map((marcher: Marcher) => ({
                section: marcher.section,
                drill_prefix: marcher.drill_prefix,
                drill_order: marcher.drill_order,
            }));
            updatePerformers({ marchers: marcherArgs });
        }
    }, [marchers, updatePerformers]);

    // Group marchers by section
    const marchersBySection = useMemo(() => {
        if (!marchers || marchers.length === 0)
            return new Map<string, Marcher[]>();

        const grouped = new Map<string, Marcher[]>();
        for (const marcher of marchers) {
            const section = marcher.section;
            if (!grouped.has(section)) {
                grouped.set(section, []);
            }
            grouped.get(section)!.push(marcher);
        }

        // Sort marchers within each section by drill_order
        for (const [section, sectionMarchers] of grouped.entries()) {
            sectionMarchers.sort((a, b) => a.drill_order - b.drill_order);
        }

        return grouped;
    }, [marchers]);

    // Get sorted sections
    const sortedSections = useMemo(() => {
        const sections = Array.from(marchersBySection.keys())
            .map((sectionName) => getSectionObjectByName(sectionName))
            .sort((a, b) => a.compareTo(b));
        return sections;
    }, [marchersBySection]);

    // Get display name for a marcher (just the drill number)
    const getMarcherDisplayName = (marcher: Marcher): string => {
        return marcher.drill_number;
    };

    const toggleSection = (sectionName: string) => {
        setOpenSections((prev) => {
            const next = new Set(prev);
            if (next.has(sectionName)) {
                next.delete(sectionName);
            } else {
                next.add(sectionName);
            }
            return next;
        });
    };

    return (
        <div className="flex flex-col gap-16">
            <div className="border-stroke border-b pb-16">
                <h5 className="text-h5 mb-16">
                    <T keyName="wizard.performers.addNew" />
                </h5>
                <NewMarcherForm disabledProp={false} />
            </div>

            <div className="flex flex-col gap-8">
                <h5 className="text-h5">
                    <T keyName="wizard.performers.added" />
                </h5>
                {!marchers || marchers.length === 0 ? (
                    <p className="text-body text-text/60">
                        <T keyName="wizard.performers.noneAdded" />
                    </p>
                ) : (
                    <div className="flex max-h-[400px] flex-col gap-8 overflow-y-auto">
                        {sortedSections.map((section) => {
                            const sectionMarchers =
                                marchersBySection.get(section.name) || [];
                            const count = sectionMarchers.length;
                            const isOpen = openSections.has(section.name);
                            const sectionLabel = getTranslatedSectionName(
                                section.name,
                                t,
                            );

                            return (
                                <RadixCollapsible.Root
                                    key={section.name}
                                    open={isOpen}
                                    onOpenChange={() =>
                                        toggleSection(section.name)
                                    }
                                >
                                    <RadixCollapsible.Trigger className="border-stroke focus-visible:text-accent rounded-6 bg-fg-1 flex w-full items-center justify-between gap-8 border px-16 py-12 duration-150 ease-out">
                                        <div className="flex items-center gap-8">
                                            <span className="text-body font-medium">
                                                {sectionLabel}
                                            </span>
                                            <span className="text-body text-text/60">
                                                ({count})
                                            </span>
                                        </div>
                                        {isOpen ? (
                                            <CaretUpIcon size={20} />
                                        ) : (
                                            <CaretDownIcon size={20} />
                                        )}
                                    </RadixCollapsible.Trigger>
                                    <RadixCollapsible.Content className="bg-fg-1 border-stroke rounded-6 mt-6 border p-8">
                                        <div className="flex flex-col gap-8">
                                            {sectionMarchers.map(
                                                (marcher: Marcher) => (
                                                    <div
                                                        key={marcher.id}
                                                        className="rounded-6 border-stroke bg-fg-2 flex items-center border p-12"
                                                    >
                                                        <span className="text-body">
                                                            {getMarcherDisplayName(
                                                                marcher,
                                                            )}
                                                        </span>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    </RadixCollapsible.Content>
                                </RadixCollapsible.Root>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
