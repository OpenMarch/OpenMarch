import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    workspaceSettingsQueryOptions,
    updateWorkspaceSettingsMutationOptions,
} from "@/hooks/queries/useWorkspaceSettings";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTolgee } from "@tolgee/react";
import { useAccessToken } from "@/auth/useAuth";
import { allEnsemblesQueryOptions } from "./queries/useEnsembles";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogCancel,
    AlertDialogAction,
    Button,
} from "@openmarch/ui";
import { ProductionPreview } from "./queries/useProductions";

/**
 * Component that displays a list of ensembles and provides a form to create new ones.
 */
export default function EnsembleList() {
    const queryClient = useQueryClient();
    const { getAccessToken } = useAccessToken();
    // Mutation to update workspace settings
    const updateWorkspaceSettings = useMutation(
        updateWorkspaceSettingsMutationOptions(queryClient),
    );
    const {
        data: ensembles,
        isLoading,
        error,
    } = useQuery(allEnsemblesQueryOptions(getAccessToken));
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
                            const isAttachedProduction = (
                                productionId: number,
                            ) =>
                                workspaceSettings?.otmProductionId ===
                                productionId;

                            return (
                                <div
                                    key={ensemble.id}
                                    className="border-stroke rounded-6 border"
                                >
                                    <div className="border-stroke hover:bg-fg-2 flex cursor-pointer items-center gap-4 border-b px-12 py-8 transition-colors last:border-b-0">
                                        <div className="w-[30%] min-w-0">
                                            <p className="text-body text-text min-w-0 break-words">
                                                {ensemble.name}
                                            </p>
                                        </div>
                                        <div className="w-[25%] min-w-0">
                                            <p className="text-body text-text/80 min-w-0 break-words">
                                                {formatDate(
                                                    ensemble.created_at,
                                                )}
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
                                    {/* Productions list */}
                                    {ensemble.productions &&
                                        ensemble.productions.length > 0 && (
                                            <div className="flex flex-col">
                                                {ensemble.productions.map(
                                                    (production) => (
                                                        <div
                                                            key={production.id}
                                                            onClick={(e) =>
                                                                handleProductionClick(
                                                                    e,
                                                                    production,
                                                                )
                                                            }
                                                            className={`border-stroke hover:bg-fg-2 flex cursor-pointer items-center gap-4 border-b px-12 py-8 pl-32 transition-colors last:border-b-0 ${
                                                                isAttachedProduction(
                                                                    production.id,
                                                                )
                                                                    ? "bg-fg-2"
                                                                    : ""
                                                            }`}
                                                        >
                                                            <div className="w-full min-w-0">
                                                                <div className="flex items-center gap-8">
                                                                    <p className="text-body text-text min-w-0 break-words">
                                                                        {
                                                                            production.name
                                                                        }
                                                                    </p>
                                                                    {isAttachedProduction(
                                                                        production.id,
                                                                    ) && (
                                                                        <span className="text-sub text-accent">
                                                                            {t(
                                                                                "ensembles.attached",
                                                                                {
                                                                                    defaultValue:
                                                                                        "(Attached)",
                                                                                },
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
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
