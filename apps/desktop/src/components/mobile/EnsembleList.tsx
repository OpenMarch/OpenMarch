import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    workspaceSettingsQueryOptions,
    updateWorkspaceSettingsMutationOptions,
} from "@/hooks/queries/useWorkspaceSettings";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTolgee } from "@tolgee/react";
import { useAccessToken } from "@/hooks/queries/useAuth";
import { allEnsemblesQueryOptions } from "./queries/useEnsembles";

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
    const [ensembleName, setEnsembleName] = useState("");

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
                            return (
                                <div
                                    key={ensemble.id}
                                    className={`border-stroke rounded-6 hover:bg-fg-2 flex cursor-pointer items-center gap-4 border px-12 py-8 transition-colors`}
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
