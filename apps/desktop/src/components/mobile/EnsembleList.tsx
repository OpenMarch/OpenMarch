import { useState, type FormEvent, type MouseEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    workspaceSettingsQueryOptions,
    updateWorkspaceSettingsMutationOptions,
} from "@/hooks/queries/useWorkspaceSettings";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTolgee } from "@tolgee/react";
import { useGetApiEditorV1Ensembles } from "@/api/generated/ensembles/ensembles";
import { usePostApiEditorV1Productions } from "@/api/generated/productions/productions";
import type { ProductionPreview } from "@/api/generated/model";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogCancel,
    AlertDialogAction,
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    Input,
} from "@openmarch/ui";
import { CircleNotchIcon, PlusIcon } from "@phosphor-icons/react";
import ViewEnsembleDetailsLink from "./ViewEnsembleDetailsLink";

type CreateProductionTarget = {
    id: number;
    name: string;
};

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
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [createProductionTarget, setCreateProductionTarget] =
        useState<CreateProductionTarget | null>(null);
    const [createProductionName, setCreateProductionName] = useState("");
    const [createProductionError, setCreateProductionError] = useState("");
    const createProduction = usePostApiEditorV1Productions({
        mutation: {
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: [`/api/editor/v1/ensembles`],
                });
                void queryClient.invalidateQueries({
                    queryKey: [`/api/editor/v1/productions`],
                });
                resetCreateDialog();
            },
            onError: (error) => {
                console.error("Failed to create production", error);
                setCreateProductionError(
                    error instanceof Error
                        ? error.message
                        : "Failed to create production",
                );
            },
        },
    });

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
        e: MouseEvent,
        production: ProductionPreview,
    ) => {
        e.stopPropagation();
        setSelectedProduction(production);
        setDialogOpen(true);
    };

    const resetCreateDialog = () => {
        setCreateDialogOpen(false);
        setCreateProductionTarget(null);
        setCreateProductionName("");
        setCreateProductionError("");
    };

    const handleCreateProductionClick = (ensemble: CreateProductionTarget) => {
        setCreateProductionTarget(ensemble);
        setCreateProductionName("");
        setCreateProductionError("");
        setCreateDialogOpen(true);
    };

    const handleCreateDialogOpenChange = (open: boolean) => {
        if (open) {
            setCreateDialogOpen(true);
            return;
        }

        if (!createProduction.isPending) resetCreateDialog();
    };

    const handleCreateProductionSubmit = (e: FormEvent) => {
        e.preventDefault();
        const name = createProductionName.trim();
        if (!createProductionTarget) return;
        if (!name) {
            setCreateProductionError("Enter a production name.");
            return;
        }

        setCreateProductionError("");
        createProduction.mutate({
            data: {
                ensemble_id: createProductionTarget.id,
                name,
            },
        });
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
                                        <div className="flex flex-col gap-8">
                                            {ensemble.productions?.map(
                                                (production) => (
                                                    <div
                                                        key={production.id}
                                                        onClick={(e) =>
                                                            handleProductionClick(
                                                                e,
                                                                production,
                                                            )
                                                        }
                                                        className={`group hover hover:border-accent hover:text-accent border-stroke bg-fg-2 flex cursor-pointer items-center justify-between gap-4 rounded border px-16 py-12 transition-colors`}
                                                    >
                                                        <div>
                                                            {production.name}
                                                        </div>
                                                        <div className="text-text-subtitle text-sub transition-colors duration-150 ease-out group-hover:text-inherit">
                                                            Attach to production
                                                        </div>
                                                    </div>
                                                ),
                                            )}
                                            <div className="flex w-full justify-between">
                                                <ViewEnsembleDetailsLink
                                                    ensembleId={ensemble.id}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="compact"
                                                    onClick={() =>
                                                        handleCreateProductionClick(
                                                            {
                                                                id: ensemble.id,
                                                                name: ensemble.name,
                                                            },
                                                        )
                                                    }
                                                    className="gap-8"
                                                >
                                                    <PlusIcon size={16} />
                                                    Create production
                                                </Button>
                                            </div>
                                        </div>
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

            <Dialog
                open={createDialogOpen}
                onOpenChange={handleCreateDialogOpenChange}
            >
                <DialogContent className="flex h-fit max-w-sm flex-col gap-16">
                    <DialogTitle>Create Production</DialogTitle>
                    <form
                        onSubmit={handleCreateProductionSubmit}
                        className="flex flex-col gap-16"
                    >
                        <p className="text-body text-text-subtitle">
                            Add a production to {createProductionTarget?.name}.
                        </p>
                        <div className="flex flex-col gap-4">
                            <label
                                htmlFor="create-production-name"
                                className="text-text-subtitle text-sub"
                            >
                                Production name
                            </label>
                            <Input
                                id="create-production-name"
                                value={createProductionName}
                                onChange={(e) => {
                                    setCreateProductionName(e.target.value);
                                    if (createProductionError) {
                                        setCreateProductionError("");
                                    }
                                }}
                                disabled={createProduction.isPending}
                                placeholder="Production name"
                                autoFocus
                            />
                        </div>
                        {createProductionError && (
                            <p className="text-body text-red">
                                {createProductionError}
                            </p>
                        )}
                        <div className="flex justify-end gap-8">
                            <Button
                                type="button"
                                variant="secondary"
                                size="compact"
                                onClick={resetCreateDialog}
                                disabled={createProduction.isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                size="compact"
                                disabled={createProduction.isPending}
                            >
                                {createProduction.isPending ? (
                                    <span className="flex items-center gap-8">
                                        <CircleNotchIcon
                                            size={16}
                                            className="animate-spin"
                                        />
                                        Creating...
                                    </span>
                                ) : (
                                    "Create"
                                )}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
