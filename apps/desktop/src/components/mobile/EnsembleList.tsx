import {
    useId,
    useMemo,
    useState,
    type FormEvent,
    type MouseEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    workspaceSettingsQueryOptions,
    updateWorkspaceSettingsMutationOptions,
} from "@/hooks/queries/useWorkspaceSettings";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import {
    getGetApiEditorV1EnsemblesQueryKey,
    useGetApiEditorV1Ensembles,
} from "@/api/generated/ensembles/ensembles";
import { editorApiStatus } from "@/api/editor-client";
import { usePostApiEditorV1Productions } from "@/api/generated/productions/productions";
import type { Ensemble, ProductionPreview } from "@/api/generated/model";
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
import {
    CaretDownIcon,
    CaretRightIcon,
    CircleNotchIcon,
    PlusIcon,
} from "@phosphor-icons/react";
import ViewEnsembleDetailsLink from "./ViewEnsembleDetailsLink";
import { ExpiredBadge, ExpiryNotice } from "./EnsembleExpiry";
import { partitionByExpiry } from "./utilities/ensembleExpiry";
import { formatLocale } from "@/utilities/formatLocale";

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
    const { t } = useTranslate();
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
                // 403: the ensemble expired since the list loaded. Refetch so
                // it moves to the expired list; the message says why.
                if (editorApiStatus(error) === 403) {
                    void queryClient.invalidateQueries({
                        queryKey: getGetApiEditorV1EnsemblesQueryKey(),
                    });
                }
                setCreateProductionError(
                    error instanceof Error
                        ? error.message
                        : t("ensembles.createDialog.failed"),
                );
            },
        },
    });

    // Fetch workspace settings to get current otmProductionId
    const { data: workspaceSettings } = useQuery(
        workspaceSettingsQueryOptions(),
    );

    const ensembles = useMemo(
        () => ensemblesResponse?.ensembles ?? [],
        [ensemblesResponse],
    );
    const { active: activeEnsembles, expired: expiredEnsembles } = useMemo(
        () => partitionByExpiry(ensembles),
        [ensembles],
    );
    const [showExpired, setShowExpired] = useState(false);
    const expiredListId = useId();

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString(formatLocale(), {
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
            setCreateProductionError(t("ensembles.createDialog.nameRequired"));
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

    const renderEnsemble = (ensemble: Ensemble) => (
        <div
            key={ensemble.id}
            className="space-y-2"
            data-testid="ensemble-item"
            data-expired={ensemble.expired || undefined}
        >
            <div className="text-sub text-text-subtitle flex w-full items-center justify-between gap-8">
                <div className="flex min-w-0 items-center gap-8">
                    <span className="truncate">{ensemble.name}</span>
                    {ensemble.expired && (
                        <ExpiredBadge expiresOn={ensemble.expires_on} />
                    )}
                </div>
                <div className="shrink-0">
                    {formatDate(ensemble.created_at)}
                </div>
            </div>
            <ExpiryNotice ensemble={ensemble} />
            {/* Productions list */}
            <div className="flex flex-col gap-8">
                {ensemble.productions?.map((production) => (
                    <button
                        type="button"
                        key={production.id}
                        onClick={(e) => handleProductionClick(e, production)}
                        className="group hover hover:border-accent hover:text-accent border-stroke bg-fg-2 flex w-full cursor-pointer items-center justify-between gap-4 rounded border px-16 py-12 text-left transition-colors"
                    >
                        <div>{production.name}</div>
                        <div className="text-text-subtitle text-sub transition-colors duration-150 ease-out group-hover:text-inherit">
                            {t("ensembles.attachToProduction")}
                        </div>
                    </button>
                ))}
                <div className="flex w-full justify-between">
                    <ViewEnsembleDetailsLink ensembleId={ensemble.id} />
                    {/* An expired ensemble takes no new productions; the
                        explanation above the expired list says why */}
                    {!ensemble.expired && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="compact"
                            onClick={() =>
                                handleCreateProductionClick({
                                    id: ensemble.id,
                                    name: ensemble.name,
                                })
                            }
                            className="gap-8"
                        >
                            <PlusIcon size={16} />
                            {t("ensembles.createProduction")}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );

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
                        {t("ensembles.loadError", {
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        })}
                    </div>
                )}

                {!isLoading && !error && ensembles.length === 0 && (
                    <div className="text-body text-text/80">
                        {t("ensembles.empty", {
                            defaultValue:
                                "No ensembles found. Create one above!",
                        })}
                    </div>
                )}

                {!isLoading && !error && ensembles.length > 0 && (
                    <div className="flex min-h-0 flex-col gap-16 overflow-y-auto">
                        {activeEnsembles.length === 0 && (
                            <div className="text-body text-text/80">
                                {t("ensembles.expiry.noActive")}
                            </div>
                        )}
                        {activeEnsembles.map((ensemble) =>
                            renderEnsemble(ensemble),
                        )}

                        {expiredEnsembles.length > 0 && (
                            <div className="flex flex-col gap-16">
                                <button
                                    type="button"
                                    aria-expanded={showExpired}
                                    aria-controls={expiredListId}
                                    onClick={() => setShowExpired((v) => !v)}
                                    className="text-sub text-text-subtitle hover:text-accent flex w-fit items-center gap-4 transition-colors duration-150 ease-out"
                                    data-testid="toggle-expired-ensembles"
                                >
                                    {showExpired ? (
                                        <CaretDownIcon size={12} aria-hidden />
                                    ) : (
                                        <CaretRightIcon size={12} aria-hidden />
                                    )}
                                    {showExpired
                                        ? t("ensembles.expiry.hideExpired")
                                        : t("ensembles.expiry.showExpired", {
                                              count: expiredEnsembles.length,
                                          })}
                                </button>
                                {showExpired && (
                                    <div
                                        id={expiredListId}
                                        className="flex flex-col gap-16"
                                        data-testid="expired-ensembles"
                                    >
                                        <p className="text-sub text-text-subtitle">
                                            {t(
                                                "ensembles.expiry.expiredExplanation",
                                            )}
                                        </p>
                                        {expiredEnsembles.map((ensemble) =>
                                            renderEnsemble(ensemble),
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
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
                                "Attach this .dots file to this production? This will allow you to upload from this file into the OpenMarch - On the Move mobile app.",
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
                    <DialogTitle>
                        {t("ensembles.createDialog.title")}
                    </DialogTitle>
                    <form
                        onSubmit={handleCreateProductionSubmit}
                        className="flex flex-col gap-16"
                    >
                        <p className="text-body text-text-subtitle">
                            {t("ensembles.createDialog.description", {
                                ensembleName:
                                    createProductionTarget?.name ?? "",
                            })}
                        </p>
                        <div className="flex flex-col gap-4">
                            <label
                                htmlFor="create-production-name"
                                className="text-text-subtitle text-sub"
                            >
                                {t("ensembles.createDialog.nameLabel")}
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
                                placeholder={t(
                                    "ensembles.createDialog.namePlaceholder",
                                )}
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
                                {t("ensembles.createDialog.cancel")}
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
                                        {t("ensembles.createDialog.creating")}
                                    </span>
                                ) : (
                                    t("ensembles.createDialog.create")
                                )}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
