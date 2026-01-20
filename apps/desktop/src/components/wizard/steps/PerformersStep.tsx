import { useEffect, useMemo, useState } from "react";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import NewMarcherForm from "@/components/marcher/NewMarcherForm";
import { T, useTolgee } from "@tolgee/react";
import Marcher from "@/global/classes/Marcher";
import * as RadixCollapsible from "@radix-ui/react-collapsible";
import { CaretDownIcon, CaretUpIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@openmarch/ui";
import {
    getSectionObjectByName,
    getTranslatedSectionName,
} from "@/global/classes/Sections";
import { NewMarcherArgs } from "@/db-functions";

type WizardMarcher = Marcher & { tempId: string };

export default function PerformersStep() {
    const { wizardState, updatePerformers } = useGuidedSetupStore();
    const [openSections, setOpenSections] = useState<Set<string>>(new Set());
    const { t } = useTolgee();

    // Ensure each marcher has a stable tempId
    useEffect(() => {
        const currentPerformers = wizardState?.performers;
        const currentMarchers = currentPerformers?.marchers || [];
        const needsIds = currentMarchers.some((m) => !m.tempId);
        if (!needsIds) return;

        const marchersWithIds = currentMarchers.map((m) => ({
            ...m,
            tempId: m.tempId ?? crypto.randomUUID(),
        }));

        updatePerformers({
            method: currentPerformers?.method || "add",
            marchers: marchersWithIds,
        });
    }, [wizardState?.performers, updatePerformers]);

    // Use marchers from wizard state instead of DB
    const marchers = useMemo<WizardMarcher[]>(() => {
        return (wizardState?.performers?.marchers || []).map((m, index) => {
            const tempId =
                m.tempId ?? `${m.drill_prefix}-${m.drill_order}-${index}`;
            // Create temporary Marcher objects for display
            const marcher: WizardMarcher = {
                id: index,
                tempId,
                section: m.section,
                drill_prefix: m.drill_prefix,
                drill_order: m.drill_order,
                drill_number: `${m.drill_prefix}${m.drill_order}`,
                // Default values for other required fields
                name: null,
                year: null,
                notes: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            return marcher;
        });
    }, [wizardState?.performers?.marchers]);

    // Group marchers by section
    const marchersBySection = useMemo(() => {
        if (!marchers || marchers.length === 0)
            return new Map<string, WizardMarcher[]>();

        const grouped = new Map<string, WizardMarcher[]>();
        for (const marcher of marchers) {
            const section = marcher.section;
            if (!grouped.has(section)) {
                grouped.set(section, []);
            }
            grouped.get(section)!.push(marcher);
        }

        // Sort marchers within each section by drill_order
        for (const [, sectionMarchers] of grouped.entries()) {
            sectionMarchers.sort((a, b) => a.drill_order - b.drill_order);
        }

        return grouped;
    }, [marchers]);

    // Get sorted sections
    const sortedSections = useMemo(() => {
        const sections = Array.from(marchersBySection.keys())
            .map((sectionName) => getSectionObjectByName(sectionName))
            .filter((section) => section !== undefined)
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

    const handleAddMarchers = (newMarchers: NewMarcherArgs[]) => {
        const currentMarchers = wizardState?.performers?.marchers || [];
        const marchersWithIds = newMarchers.map((m) => ({
            ...m,
            tempId: crypto.randomUUID(),
        }));
        updatePerformers({
            method: "add",
            marchers: [...currentMarchers, ...marchersWithIds],
        });
    };

    const handleDeleteMarcher = (marcherId: string) => {
        const currentMarchers = wizardState?.performers?.marchers || [];
        const newMarchers = currentMarchers.filter(
            (marcher) => marcher.tempId !== marcherId,
        );
        updatePerformers({
            method: "add",
            marchers: newMarchers,
        });
    };

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-32">
            <div className="grid grid-cols-1 gap-24 lg:grid-cols-2">
                {/* Left Column - Add Performers Form */}
                <div className="flex flex-col gap-20">
                    <h5 className="text-h5 font-medium">
                        <T keyName="wizard.performers.addNew" />
                    </h5>
                    <NewMarcherForm
                        disabledProp={false}
                        hideInfoNote={true}
                        skipSidebarContent={true}
                        onMarchersCreate={handleAddMarchers}
                        existingMarchers={marchers}
                        wizardMode={true}
                    />
                </div>

                {/* Right Column - Added Performers List */}
                <div className="flex flex-col gap-20">
                    <h5 className="text-h5 font-medium">
                        <T keyName="wizard.performers.added" />
                    </h5>
                    {!marchers || marchers.length === 0 ? (
                        <div className="rounded-12 bg-fg-1 border-stroke border p-20">
                            <p className="text-body text-text/60 leading-relaxed">
                                <T keyName="wizard.performers.noneAdded" />
                            </p>
                        </div>
                    ) : (
                        <div className="flex max-h-[500px] flex-col gap-12 overflow-y-auto">
                            {sortedSections.map((section) => {
                                if (!section) return null;
                                const sectionMarchers =
                                    marchersBySection.get(section.name) || [];
                                const count = sectionMarchers?.length || 0;
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
                                        <RadixCollapsible.Trigger className="border-stroke focus-visible:border-accent hover:bg-fg-2 rounded-8 bg-fg-1 flex w-full items-center justify-between gap-8 border px-20 py-16 duration-150 ease-out">
                                            <div className="flex items-center gap-10">
                                                <span className="text-body font-medium">
                                                    {sectionLabel}
                                                </span>
                                                <span className="text-sub text-text/60">
                                                    ({count})
                                                </span>
                                            </div>
                                            {isOpen ? (
                                                <CaretUpIcon size={20} />
                                            ) : (
                                                <CaretDownIcon size={20} />
                                            )}
                                        </RadixCollapsible.Trigger>
                                        <RadixCollapsible.Content className="bg-fg-1 border-stroke rounded-8 mt-8 border p-12">
                                            <div className="flex flex-col gap-10">
                                                {(sectionMarchers || []).map(
                                                    (
                                                        marcher: WizardMarcher,
                                                    ) => (
                                                        <div
                                                            key={marcher.tempId}
                                                            className="rounded-6 border-stroke bg-fg-2 hover:bg-fg-1 flex items-center justify-between gap-8 border px-16 py-12 duration-150 ease-out"
                                                        >
                                                            <span className="text-body">
                                                                {getMarcherDisplayName(
                                                                    marcher,
                                                                )}
                                                            </span>
                                                            <Button
                                                                variant="secondary"
                                                                size="compact"
                                                                content="icon"
                                                                onClick={() =>
                                                                    handleDeleteMarcher(
                                                                        marcher.tempId,
                                                                    )
                                                                }
                                                                className="text-red hover:text-red/80"
                                                                aria-label={`Delete ${getMarcherDisplayName(marcher)}`}
                                                            >
                                                                <TrashIcon
                                                                    size={18}
                                                                />
                                                            </Button>
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
        </div>
    );
}
