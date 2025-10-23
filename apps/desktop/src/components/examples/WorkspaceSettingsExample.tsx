import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    workspaceSettingsQueryOptions,
    updateWorkspaceSettingsMutationOptions,
} from "@/hooks/queries/useWorkspaceSettings";
import {
    WorkspaceSettings,
    defaultWorkspaceSettings,
} from "@/settings/workspaceSettings";
import { Button, UnitInput } from "@openmarch/ui";
import * as Form from "@radix-ui/react-form";
import { SidebarModalLauncher } from "../sidebar/SidebarModal";
import FormField from "../ui/FormField";
import { XIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import clsx from "clsx";

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
    return (
        <SidebarModalLauncher
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
    }>({
        defaultTempo: "",
        defaultBeatsPerMeasure: "",
        defaultNewPageCounts: "",
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
        updateSettings(localSettings);
    }, [localSettings, updateSettings]);

    const handleReset = useCallback(() => {
        setLocalSettings(defaultWorkspaceSettings);
        setInputValues({
            defaultTempo: defaultWorkspaceSettings.defaultTempo.toString(),
            defaultBeatsPerMeasure:
                defaultWorkspaceSettings.defaultBeatsPerMeasure.toString(),
            defaultNewPageCounts:
                defaultWorkspaceSettings.defaultNewPageCounts.toString(),
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
            });
        }
    }, [settings]);

    if (isLoading) {
        return (
            <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
                <div className="text-center">Loading workspace settings...</div>
            </div>
        );
    }

    if (!settings || !localSettings) {
        return (
            <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
                <div className="text-center">No workspace settings found</div>
            </div>
        );
    }

    // Generate form fields dynamically from the schema
    const fieldConfigs: Array<{
        key: keyof WorkspaceSettings;
        label: string;
        value: string;
        min: number;
    }> = [
        {
            key: "defaultTempo",
            label: "Default Tempo",
            value: inputValues.defaultTempo || "",
            min: 1,
        },
        {
            key: "defaultBeatsPerMeasure",
            label: "Default Beats Per Measure",
            value: inputValues.defaultBeatsPerMeasure || "",
            min: 1,
        },
        {
            key: "defaultNewPageCounts",
            label: "Default New Page Counts",
            value: inputValues.defaultNewPageCounts || "",
            min: 1,
        },
    ];

    const hasChanges =
        JSON.stringify(localSettings) !== JSON.stringify(settings);

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">Workspace Settings</h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <div className="flex w-[30rem] grow flex-col gap-16 overflow-y-auto">
                <Form.Root
                    onSubmit={(e) => e.preventDefault()}
                    className="flex flex-col gap-12"
                >
                    {fieldConfigs.map(({ key, label, value, min }) => (
                        <FormField key={key} label={label}>
                            <UnitInput
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                containerClassName={inputClassname}
                                unit={
                                    key === "defaultTempo"
                                        ? "BPM"
                                        : key === "defaultBeatsPerMeasure"
                                          ? "beats"
                                          : "counts"
                                }
                                onBlur={(e) => {
                                    e.preventDefault();
                                    const parsedInt = parseInt(
                                        e.target.value,
                                        10,
                                    );
                                    if (!isNaN(parsedInt) && parsedInt >= min) {
                                        handleFieldChange(key, parsedInt);
                                    } else if (e.target.value === "") {
                                        // If empty, set to minimum value
                                        handleFieldChange(key, min);
                                    }
                                }}
                                onChange={(e) => {
                                    // Allow only numbers and update input value immediately
                                    const filtered = e.target.value.replace(
                                        /[^\d]/g,
                                        "",
                                    );
                                    setInputValues((prev) => ({
                                        ...prev,
                                        [key]: filtered,
                                    }));
                                }}
                                onKeyDown={blurOnEnter}
                                value={value}
                                required
                            />
                        </FormField>
                    ))}
                </Form.Root>

                <div className="flex flex-col gap-8">
                    <div className="flex space-x-2">
                        <Button
                            onClick={handleSave}
                            disabled={isPending || !hasChanges}
                            size="compact"
                        >
                            Save Changes
                        </Button>

                        <Button
                            onClick={handleCancel}
                            disabled={isPending || !hasChanges}
                            variant="secondary"
                            size="compact"
                        >
                            Cancel
                        </Button>

                        <Button
                            onClick={handleReset}
                            disabled={isPending}
                            variant="secondary"
                            size="compact"
                        >
                            Reset to Defaults
                        </Button>
                    </div>

                    {hasChanges && (
                        <div className="text-sm text-amber-600">
                            You have unsaved changes
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
