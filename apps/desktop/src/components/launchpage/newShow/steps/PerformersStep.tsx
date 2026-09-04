import { useEffect, useMemo, useState } from "react";
import MarcherForm from "@/components/marcher/MarcherForm";
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
import type {
    NewShowEnsembleData,
    NewShowPerformersData,
} from "../../newShowTypes";
import {
    getPresetMarchers,
    getEnsemblePresetKey,
    DEFAULT_ENSEMBLE_SIZE,
} from "@/global/classes/EnsembleTemplates";

type WizardMarcher = Marcher & { tempId: string };

interface PerformersStepProps {
    ensemble: NewShowEnsembleData | null;
    performers: NewShowPerformersData | null;
    onChange: (performers: NewShowPerformersData) => void;
}

export default function PerformersStep({
    ensemble,
    performers,
    onChange,
}: PerformersStepProps) {
    const [openSections, setOpenSections] = useState<Set<string>>(new Set());
    const { t } = useTolgee();
    const marchersList = performers?.marchers ?? [];

    const activity = ensemble?.activity;
    const size = ensemble?.size ?? DEFAULT_ENSEMBLE_SIZE;
    const presetKey = getEnsemblePresetKey(activity, size);

    // Fill the roster from the activity/size preset, regenerating when the pair changes
    useEffect(() => {
        if (performers?.presetKey === presetKey) return;
        onChange({
            method: "add",
            marchers: getPresetMarchers(activity, size).map((m) => ({
                ...m,
                tempId: crypto.randomUUID(),
            })),
            presetKey,
        });
    }, [presetKey, activity, size, performers?.presetKey, onChange]);

    const marchers = useMemo<WizardMarcher[]>(() => {
        return marchersList.map((m, index) => {
            const tempId =
                m.tempId ?? `${m.drill_prefix}-${m.drill_order}-${index}`;
            return {
                id: index,
                tempId,
                section: m.section,
                drill_prefix: m.drill_prefix,
                drill_order: m.drill_order,
                drill_number: `${m.drill_prefix}${m.drill_order}`,
                name: null,
                year: null,
                notes: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
        });
    }, [marchersList]);

    const marchersBySection = useMemo(() => {
        const grouped = new Map<string, WizardMarcher[]>();
        for (const marcher of marchers) {
            if (!grouped.has(marcher.section)) {
                grouped.set(marcher.section, []);
            }
            grouped.get(marcher.section)!.push(marcher);
        }
        for (const [, sectionMarchers] of grouped.entries()) {
            sectionMarchers.sort((a, b) => a.drill_order - b.drill_order);
        }
        return grouped;
    }, [marchers]);

    const sortedSections = useMemo(() => {
        return Array.from(marchersBySection.keys())
            .map((sectionName) => getSectionObjectByName(sectionName))
            .filter((section) => section !== undefined)
            .sort((a, b) => a.compareTo(b));
    }, [marchersBySection]);

    const handleAddMarchers = (newMarchers: NewMarcherArgs[]) => {
        const marchersWithIds = newMarchers.map((m) => ({
            ...m,
            tempId: crypto.randomUUID(),
        }));
        onChange({
            method: "add",
            marchers: [...marchersList, ...marchersWithIds],
            presetKey,
        });
    };

    const handleDeleteMarcher = (marcherId: string) => {
        onChange({
            method: "add",
            marchers: marchersList.filter((m) => m.tempId !== marcherId),
            presetKey,
        });
    };

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-24">
            <div className="grid grid-cols-1 gap-16 lg:grid-cols-2">
                <div className="flex flex-col gap-12">
                    <h5 className="text-body font-medium">
                        <T keyName="launchpage.newShow.steps.performers.addNew" />
                    </h5>
                    <MarcherForm
                        hideInfoNote
                        skipSidebarContent
                        onMarchersCreate={handleAddMarchers}
                        existingMarchers={marchers}
                        wizardMode
                    />
                </div>
                <div className="flex flex-col gap-12">
                    <h5 className="text-body font-medium">
                        {t("launchpage.newShow.steps.performers.added", {
                            count: marchers.length,
                        })}
                    </h5>
                    {marchers.length === 0 ? (
                        <div className="rounded-12 bg-fg-1 border-stroke border p-16">
                            <p className="text-body text-text/60">
                                <T keyName="launchpage.newShow.steps.performers.noneAdded" />
                            </p>
                        </div>
                    ) : (
                        <div className="flex max-h-[320px] flex-col gap-8 overflow-y-auto">
                            {sortedSections.map((section) => {
                                if (!section) return null;
                                const sectionMarchers =
                                    marchersBySection.get(section.name) || [];
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
                                            setOpenSections((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(section.name)) {
                                                    next.delete(section.name);
                                                } else {
                                                    next.add(section.name);
                                                }
                                                return next;
                                            })
                                        }
                                    >
                                        <RadixCollapsible.Trigger className="border-stroke rounded-8 bg-fg-1 hover:bg-fg-2 flex w-full items-center justify-between border px-12 py-8">
                                            <span className="text-body font-medium">
                                                {sectionLabel} (
                                                {sectionMarchers.length})
                                            </span>
                                            {isOpen ? (
                                                <CaretUpIcon size={18} />
                                            ) : (
                                                <CaretDownIcon size={18} />
                                            )}
                                        </RadixCollapsible.Trigger>
                                        <RadixCollapsible.Content className="mt-4 flex flex-col gap-4">
                                            {sectionMarchers.map((marcher) => (
                                                <div
                                                    key={marcher.tempId}
                                                    className="rounded-6 bg-fg-2 flex items-center justify-between px-12 py-8"
                                                >
                                                    <span className="text-body">
                                                        {marcher.drill_number}
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
                                                    >
                                                        <TrashIcon size={18} />
                                                    </Button>
                                                </div>
                                            ))}
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
