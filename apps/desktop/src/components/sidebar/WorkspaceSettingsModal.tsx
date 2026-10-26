import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    workspaceSettingsQueryOptions,
    updateWorkspaceSettingsMutationOptions,
} from "@/hooks/queries/useWorkspaceSettings";
import { MIN_TEMPO_BPM } from "@/global/classes/Beat";
import {
    WorkspaceSettings,
    defaultWorkspaceSettings,
} from "@/settings/workspaceSettings";
import { Button, UnitInput } from "@openmarch/ui";
import * as Form from "@radix-ui/react-form";
import { SidebarModalLauncher } from "./SidebarModal";
import FormField from "../ui/FormField";
import { XIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import clsx from "clsx";
import { T, useTolgee } from "@tolgee/react";
import { toast } from "sonner";

const inputClassname = clsx("col-span-6 self-center");

const blurOnEnterFunc = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
        e.currentTarget.blur();
    }
};

/**
 * Workspace Settings Modal Component
 */
export default function WorkspaceSettingsModal({
    label = <SlidersHorizontalIcon size={24} />,
    buttonClassName,
}: {
    label?: string | React.ReactNode;
    buttonClassName?: string;
}) {
    const { t } = useTolgee();
    return (
        <SidebarModalLauncher
            name={t("sidebar.settings")}
            contents={<WorkspaceSettingsModalContents />}
            newContentId="workspace-settings"
            buttonLabel={label}
            className={buttonClassName}
        />
    );
}

function WorkspaceSettingsModalContents() {
    const { toggleOpen } = useSidebarModalStore();
    const queryClient = useQueryClient();
    const { t } = useTolgee();
    const { data: settings, isLoading } = useQuery(
        workspaceSettingsQueryOptions(),
    );
    const { mutate: updateSettings, isPending } = useMutation(
        updateWorkspaceSettingsMutationOptions(queryClient),
    );

    const [localSettings, setLocalSettings] =
        useState<WorkspaceSettings | null>(null);
    const [inputValues, setInputValues] = useState<{
        defaultTempo: string;
        defaultBeatsPerMeasure: string;
        defaultNewPageCounts: string;
        audioOffsetSeconds: string;
        pageNumberOffset: string;
        measurementOffset: string;
    }>({
        defaultTempo: "",
        defaultBeatsPerMeasure: "",
        defaultNewPageCounts: "",
        audioOffsetSeconds: "",
        pageNumberOffset: "",
        measurementOffset: "",
    });

    const blurOnEnter = useCallback(blurOnEnterFunc, []);

    // Update local state when settings change
    React.useEffect(() => {
        if (settings) {
            setLocalSettings(settings);
            setInputValues({
                defaultTempo: settings.defaultTempo.toString(),
                defaultBeatsPerMeasure:
                    settings.defaultBeatsPerMeasure.toString(),
                defaultNewPageCounts: settings.defaultNewPageCounts.toString(),
                audioOffsetSeconds: settings.audioOffsetSeconds.toString(),
                pageNumberOffset: settings.pageNumberOffset.toString(),
                measurementOffset: settings.measurementOffset.toString(),
            });
        }
    }, [settings]);

    const handleFieldChange = useCallback(
        (field: keyof WorkspaceSettings, value: number) => {
            if (!localSettings) return;

            setLocalSettings({
                ...localSettings,
                [field]: value,
            });
        },
        [localSettings],
    );

    const handleSave = useCallback(() => {
        if (!localSettings) return;
        updateSettings(localSettings, {
            onSuccess: () => {
                toast.success(t("workspaceSettings.saved"));
                toggleOpen();
            },
        });
    }, [localSettings, updateSettings, t, toggleOpen]);

    const handleReset = useCallback(() => {
        setLocalSettings(defaultWorkspaceSettings);
        setInputValues({
            defaultTempo: defaultWorkspaceSettings.defaultTempo.toString(),
            defaultBeatsPerMeasure:
                defaultWorkspaceSettings.defaultBeatsPerMeasure.toString(),
            defaultNewPageCounts:
                defaultWorkspaceSettings.defaultNewPageCounts.toString(),
            audioOffsetSeconds:
                defaultWorkspaceSettings.audioOffsetSeconds.toString(),
            pageNumberOffset:
                defaultWorkspaceSettings.pageNumberOffset.toString(),
            measurementOffset:
                defaultWorkspaceSettings.measurementOffset.toString(),
        });
        updateSettings(defaultWorkspaceSettings);
    }, [updateSettings]);

    const handleCancel = useCallback(() => {
        if (settings) {
            setLocalSettings(settings);
            setInputValues({
                defaultTempo: settings.defaultTempo.toString(),
                defaultBeatsPerMeasure:
                    settings.defaultBeatsPerMeasure.toString(),
                defaultNewPageCounts: settings.defaultNewPageCounts.toString(),
                audioOffsetSeconds: settings.audioOffsetSeconds.toString(),
                pageNumberOffset: settings.pageNumberOffset.toString(),
                measurementOffset: settings.measurementOffset.toString(),
            });
        }
        // Cancel always works: drop any edits and close
        toggleOpen();
    }, [settings, toggleOpen]);

    if (isLoading) {
        return (
            <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
                <div className="text-center">
                    <T keyName="workspaceSettings.loadingSettings" />
                </div>
            </div>
        );
    }

    if (!settings || !localSettings) {
        return (
            <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
                <div className="text-center">
                    <T keyName="workspaceSettings.noSettingsFound" />
                </div>
            </div>
        );
    }

    // Generate form fields dynamically from the schema
    const fieldConfigs: Array<{
        key: keyof WorkspaceSettings;
        label: string;
        value: string;
        min?: number;
        pattern?: string;
        unit?: string;
        float?: boolean;
        canBeNegative?: boolean;
    }> = [
        {
            key: "defaultTempo",
            label: t("workspaceSettings.defaultTempo"),
            value: inputValues.defaultTempo || "",
            min: MIN_TEMPO_BPM,
            unit: t("workspaceSettings.units.bpm"),
        },
        {
            key: "defaultBeatsPerMeasure",
            label: t("workspaceSettings.defaultBeatsPerMeasure"),
            value: inputValues.defaultBeatsPerMeasure || "",
            min: 1,
            unit: t("workspaceSettings.units.beats"),
        },
        {
            key: "defaultNewPageCounts",
            label: t("workspaceSettings.defaultNewPageCounts"),
            value: inputValues.defaultNewPageCounts || "",
            min: 1,
            unit: t("workspaceSettings.units.counts"),
        },
        {
            key: "audioOffsetSeconds",
            label: t("workspaceSettings.audioOffsetSeconds"),
            value: inputValues.audioOffsetSeconds || "",
            unit: t("workspaceSettings.units.seconds"),
            float: true,
            canBeNegative: true,
        },
        {
            key: "pageNumberOffset",
            label: t("workspaceSettings.pageNumberOffset"),
            value: inputValues.pageNumberOffset || "",
            canBeNegative: true,
        },
        {
            key: "measurementOffset",
            label: t("workspaceSettings.measurementOffset"),
            value: inputValues.measurementOffset || "",
            canBeNegative: true,
        },
    ];

    const hasChanges =
        JSON.stringify(localSettings) !== JSON.stringify(settings);

    return (
        <div className="animate-scale-in text-text flex h-full min-h-0 w-fit flex-col gap-16">
            <header className="flex shrink-0 items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">
                    <T keyName="workspaceSettings.title" />
                </h4>
                <button
                    onClick={toggleOpen}
                    aria-label={t("workspaceSettings.close")}
                    className="hover:text-red touch:size-44 flex items-center justify-center duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            {/* The fields scroll; the buttons below stay visible on a short screen */}
            <div className="flex min-h-0 w-[30rem] max-w-full grow flex-col gap-16 overflow-y-auto">
                <Form.Root
                    onSubmit={(e) => e.preventDefault()}
                    className="flex flex-col gap-12"
                >
                    {fieldConfigs.map(
                        ({
                            key,
                            label,
                            value,
                            min,
                            pattern,
                            unit,
                            float,
                            canBeNegative,
                        }) => {
                            // Generate pattern based on float and canBeNegative flags
                            const inputPattern =
                                pattern ??
                                (float || canBeNegative
                                    ? `${canBeNegative ? "-?" : ""}[0-9]*${float ? ".?[0-9]*" : ""}`
                                    : "[0-9]*");

                            // Generate regex for filtering input
                            const filterRegex = new RegExp(
                                `[^${canBeNegative ? "-" : ""}0-9${float ? "." : ""}]`,
                                "g",
                            );

                            return (
                                <FormField key={key} label={label}>
                                    <UnitInput
                                        type="text"
                                        inputMode="numeric"
                                        pattern={inputPattern}
                                        containerClassName={inputClassname}
                                        unit={unit ?? ""}
                                        onBlur={(e) => {
                                            e.preventDefault();
                                            // Use parseFloat for float fields, parseInt for integers
                                            const parsedValue = float
                                                ? parseFloat(e.target.value)
                                                : parseInt(e.target.value, 10);

                                            if (
                                                !isNaN(parsedValue) &&
                                                (min === undefined ||
                                                    parsedValue >= min)
                                            ) {
                                                handleFieldChange(
                                                    key,
                                                    parsedValue,
                                                );
                                            } else if (e.target.value === "") {
                                                // If empty, set to minimum value
                                                handleFieldChange(
                                                    key,
                                                    min ?? 0,
                                                );
                                            }
                                        }}
                                        onChange={(e) => {
                                            // Filter input based on float and canBeNegative flags
                                            const filtered =
                                                e.target.value.replace(
                                                    filterRegex,
                                                    "",
                                                );
                                            setInputValues((prev) => ({
                                                ...prev,
                                                [key]: filtered,
                                            }));
                                            // Take a valid value right away, so Save is ready
                                            // without leaving the field first (a tap on a
                                            // disabled Save would otherwise be lost)
                                            const parsed = float
                                                ? parseFloat(filtered)
                                                : parseInt(filtered, 10);
                                            if (
                                                !isNaN(parsed) &&
                                                (min === undefined ||
                                                    parsed >= min)
                                            )
                                                handleFieldChange(key, parsed);
                                        }}
                                        onKeyDown={blurOnEnter}
                                        value={value}
                                        required
                                    />
                                </FormField>
                            );
                        },
                    )}
                </Form.Root>
            </div>

            <div className="flex w-[30rem] max-w-full shrink-0 flex-col gap-8">
                <div className="touch:gap-8 flex flex-wrap gap-2">
                    <Button
                        onClick={handleSave}
                        disabled={isPending || !hasChanges}
                        size="compact"
                    >
                        <T keyName="workspaceSettings.saveChanges" />
                    </Button>

                    <Button
                        onClick={handleCancel}
                        disabled={isPending}
                        variant="secondary"
                        size="compact"
                    >
                        <T keyName="workspaceSettings.cancel" />
                    </Button>

                    <Button
                        onClick={handleReset}
                        disabled={isPending}
                        variant="secondary"
                        size="compact"
                    >
                        <T keyName="workspaceSettings.resetToDefaults" />
                    </Button>
                </div>

                {hasChanges && (
                    <div className="text-sm text-amber-600">
                        <T keyName="workspaceSettings.unsavedChanges" />
                    </div>
                )}
            </div>
        </div>
    );
}
