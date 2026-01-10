import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Form from "@radix-ui/react-form";
import { Button, Input } from "@openmarch/ui";
import { useEnsembles, useCreateEnsemble } from "@/api/queries/useEnsembles";
import {
    workspaceSettingsQueryOptions,
    updateWorkspaceSettingsMutationOptions,
} from "@/hooks/queries/useWorkspaceSettings";
import { useQuery, useMutation } from "@tanstack/react-query";
import FormField from "@/components/ui/FormField";
import { useTolgee } from "@tolgee/react";

/**
 * Component that displays a list of ensembles and provides a form to create new ones.
 */
export default function EnsembleList() {
    const queryClient = useQueryClient();
    const { data: ensembles, isLoading, error } = useEnsembles();
    const createEnsemble = useCreateEnsemble();
    const { t } = useTolgee();
    const [ensembleName, setEnsembleName] = useState("");

    // Fetch workspace settings to get current otmEnsembleId
    const { data: workspaceSettings } = useQuery(
        workspaceSettingsQueryOptions(),
    );

    // Mutation to update workspace settings
    const updateWorkspaceSettings = useMutation(
        updateWorkspaceSettingsMutationOptions(queryClient),
    );

    const handleEnsembleClick = (ensembleId: number) => {
        if (!workspaceSettings) return;

        updateWorkspaceSettings.mutate({
            ...workspaceSettings,
            otmEnsembleId: String(ensembleId),
        });
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!ensembleName.trim()) {
            return;
        }

        createEnsemble.mutate(
            { name: ensembleName.trim() },
            {
                onSuccess: () => {
                    setEnsembleName("");
                },
            },
        );
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    return (
        <div className="flex h-full flex-col gap-16">
            {/* Form to create new ensemble */}
            <div className="border-stroke rounded-6 border p-12">
                <Form.Root
                    onSubmit={handleSubmit}
                    className="flex flex-col gap-12"
                >
                    <FormField
                        label={t("ensembles.name", {
                            defaultValue: "Ensemble Name",
                        })}
                    >
                        <Input
                            type="text"
                            value={ensembleName}
                            onChange={(e) => setEnsembleName(e.target.value)}
                            placeholder={t("ensembles.namePlaceholder", {
                                defaultValue: "Enter ensemble name",
                            })}
                            required
                        />
                    </FormField>
                    <Button
                        type="submit"
                        disabled={
                            createEnsemble.isPending || !ensembleName.trim()
                        }
                        className="w-full"
                    >
                        {createEnsemble.isPending
                            ? t("ensembles.creating", {
                                  defaultValue: "Creating...",
                              })
                            : t("ensembles.create", {
                                  defaultValue: "Create Ensemble",
                              })}
                    </Button>
                </Form.Root>
            </div>

            {/* List of ensembles */}
            <div className="flex min-h-0 flex-1 flex-col gap-8">
                {isLoading && (
                    <div className="text-body text-text/80">
                        {t("ensembles.loading", {
                            defaultValue: "Loading ensembles...",
                        })}
                    </div>
                )}

                {error && (
                    <div className="text-body text-red">
                        {t("ensembles.error", {
                            defaultValue: "Error loading ensembles",
                        })}
                        :{" "}
                        {error instanceof Error ? error.message : String(error)}
                    </div>
                )}

                {!isLoading &&
                    !error &&
                    ensembles &&
                    ensembles.length === 0 && (
                        <div className="text-body text-text/80">
                            {t("ensembles.empty", {
                                defaultValue:
                                    "No ensembles found. Create one above!",
                            })}
                        </div>
                    )}

                {!isLoading && !error && ensembles && ensembles.length > 0 && (
                    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
                        {/* Header */}
                        <div className="border-stroke flex items-center gap-4 border-b px-12 py-8">
                            <div className="w-[30%] min-w-0">
                                <p className="text-sub text-text/90 font-mono">
                                    {t("ensembles.nameHeader", {
                                        defaultValue: "Name",
                                    })}
                                </p>
                            </div>
                            <div className="w-[25%] min-w-0">
                                <p className="text-sub text-text/90 font-mono">
                                    {t("ensembles.createdAtHeader", {
                                        defaultValue: "Created At",
                                    })}
                                </p>
                            </div>
                            <div className="w-[22.5%] min-w-0">
                                <p className="text-sub text-text/90 font-mono">
                                    {t("ensembles.performersHeader", {
                                        defaultValue: "Performers",
                                    })}
                                </p>
                            </div>
                            <div className="w-[22.5%] min-w-0">
                                <p className="text-sub text-text/90 font-mono">
                                    {t("ensembles.productionsHeader", {
                                        defaultValue: "Productions",
                                    })}
                                </p>
                            </div>
                        </div>

                        {/* Ensemble items */}
                        {ensembles.map((ensemble) => {
                            const isSelected =
                                workspaceSettings?.otmEnsembleId ===
                                String(ensemble.id);

                            return (
                                <div
                                    key={ensemble.id}
                                    onClick={() =>
                                        handleEnsembleClick(ensemble.id)
                                    }
                                    className={`border-stroke rounded-6 flex cursor-pointer items-center gap-4 border px-12 py-8 transition-colors ${isSelected ? "bg-fg-2 border-accent" : "hover:bg-fg-2"} `}
                                >
                                    <div className="w-[30%] min-w-0">
                                        <p className="text-body text-text min-w-0 break-words">
                                            {ensemble.name}
                                        </p>
                                    </div>
                                    <div className="w-[25%] min-w-0">
                                        <p className="text-body text-text/80 min-w-0 break-words">
                                            {formatDate(ensemble.created_at)}
                                        </p>
                                    </div>
                                    <div className="w-[22.5%] min-w-0">
                                        <p className="text-body text-text/80 min-w-0">
                                            {ensemble.performers_count}
                                        </p>
                                    </div>
                                    <div className="w-[22.5%] min-w-0">
                                        <p className="text-body text-text/80 min-w-0">
                                            {ensemble.productions_count}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
