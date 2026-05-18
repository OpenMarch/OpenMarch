import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    workspaceSettingsQueryOptions,
    updateWorkspaceSettingsMutationOptions,
} from "@/hooks/queries/useWorkspaceSettings";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTolgee } from "@tolgee/react";
import { useGetApiEditorV1Ensembles } from "@/api/generated/ensembles/ensembles";
import type { ProductionPreview } from "@/api/generated/model";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogCancel,
    AlertDialogAction,
    Button,
} from "@openmarch/ui";

/**
 * Component that displays a list of ensembles and provides a form to create new ones.
 */
export default function EnsembleList() {
    const queryClient = useQueryClient();
    // Mutation to update workspace settings
    const updateWorkspaceSettings = useMutation(
        updateWorkspaceSettingsMutationOptions(queryClient),
    );
    const {
        data: ensemblesResponse,
        isLoading,
        error,
    } = useGetApiEditorV1Ensembles();
    const { t } = useTolgee();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedProduction, setSelectedProduction] =
        useState<ProductionPreview | null>(null);

    // Fetch workspace settings to get current otmProductionId
    const { data: workspaceSettings } = useQuery(
        workspaceSettingsQueryOptions(),
    );

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    const handleProductionClick = (
        e: React.MouseEvent,
        production: ProductionPreview,
    ) => {
        e.stopPropagation();
        setSelectedProduction(production);
        setDialogOpen(true);
    };

    const handleAttachProduction = () => {
        if (!selectedProduction || !workspaceSettings) return;

        updateWorkspaceSettings.mutate({
            ...workspaceSettings,
            otmProductionId: selectedProduction.id,
        });

        setDialogOpen(false);
        setSelectedProduction(null);
    };

    const handleDialogClose = (open: boolean) => {
        if (!open) {
            setDialogOpen(false);
            setSelectedProduction(null);
        }
    };

    return (
        <div className="flex h-full flex-col gap-16">
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
                    ensemblesResponse?.ensembles &&
                    ensemblesResponse.ensembles.length === 0 && (
                        <div className="text-body text-text/80">
                            {t("ensembles.empty", {
                                defaultValue:
                                    "No ensembles found. Create one above!",
                            })}
                        </div>
                    )}

                {!isLoading &&
                    !error &&
                    ensemblesResponse?.ensembles &&
                    ensemblesResponse.ensembles.length > 0 && (
                        <div className="flex min-h-0 flex-col gap-16 overflow-y-auto">
                            {/* Ensemble items */}
                            {ensemblesResponse.ensembles.map((ensemble) => {
                                return (
                                    <div
                                        key={ensemble.id}
                                        className="space-y-2"
                                    >
                                        <div className="text-sub text-text-subtitle flex w-full justify-between">
                                            <div>{ensemble.name}</div>
                                            <div>
                                                {formatDate(
                                                    ensemble.created_at,
                                                )}
                                            </div>
                                        </div>
                                        {/* Productions list */}
                                        {ensemble.productions &&
                                            ensemble.productions.length > 0 && (
                                                <div className="flex flex-col gap-8">
                                                    {ensemble.productions.map(
                                                        (production) => (
                                                            <div
                                                                key={
                                                                    production.id
                                                                }
                                                                onClick={(e) =>
                                                                    handleProductionClick(
                                                                        e,
                                                                        production,
                                                                    )
                                                                }
                                                                className={`hover hover:border-accent hover:text-accent border-stroke bg-fg-2 flex cursor-pointer items-center gap-4 rounded border px-16 py-12 transition-colors`}
                                                            >
                                                                {
                                                                    production.name
                                                                }
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
            </div>

            {/* Attach Production Dialog */}
            <AlertDialog open={dialogOpen} onOpenChange={handleDialogClose}>
                <AlertDialogContent>
                    <AlertDialogTitle>
                        {t("ensembles.attachDialog.title", {
                            defaultValue: "Attach to Production",
                        })}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {t("ensembles.attachDialog.description", {
                            defaultValue:
                                "Attach this .dots file to this production? This will allow you to upload from this file into the the OpenMarch - On the Move mobile app.",
                        })}
                    </AlertDialogDescription>
                    <div className="flex items-center justify-end gap-8 align-middle">
                        <AlertDialogCancel asChild>
                            <Button variant="secondary" className="w-full">
                                {t("ensembles.attachDialog.cancel", {
                                    defaultValue: "Cancel",
                                })}
                            </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction>
                            <Button
                                variant="primary"
                                onClick={handleAttachProduction}
                                className="w-full"
                            >
                                {t("ensembles.attachDialog.attach", {
                                    defaultValue: "Attach",
                                })}
                            </Button>
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
