import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
} from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import NewShowModalLayout from "./newShow/NewShowModalLayout";
import StartStep from "./newShow/steps/StartStep";
import ProjectStep from "./newShow/steps/ProjectStep";
import {
    useImportDrillPackage,
    type DrillImportResult,
    type DrillImportStep,
} from "@/components/import/DrillImport";
import { createAllUndoTriggers } from "@/db-functions/history";
import {
    getWorkspaceSettingsParsed,
    updateWorkspaceSettingsParsed,
} from "@/db-functions/workspaceSettings";
import { db } from "@/global/database/db";
import EnsembleStep from "./newShow/steps/EnsembleStep";
import FieldStep from "./newShow/steps/FieldStep";
import PerformersStep from "./newShow/steps/PerformersStep";
import AudioStep from "./newShow/steps/AudioStep";
import TempoStep from "./newShow/steps/TempoStep";
import { useNewShowValidation } from "./newShow/hooks/useNewShowValidation";
import {
    DEFAULT_NEW_SHOW_WIZARD_STATE,
    hasNewShowProgress,
    NEW_SHOW_STEPS,
    type NewShowAudioData,
    type NewShowEnsembleData,
    type NewShowFieldData,
    type NewShowPerformersData,
    type NewShowProjectData,
    type NewShowStepId,
    type NewShowTempoData,
    type NewShowWizardState,
    wizardStateToFormState,
} from "./newShowTypes";
import {
    databaseReadyQueryOptions,
    invalidateDatabaseReadyQueries,
} from "@/hooks/useDatabaseReady";
import { completeNewShow, resolveNewShowFilePath } from "./newShowCompletion";
import { conToastError } from "@/utilities/utils";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { DEFAULT_ACTIVITY } from "@/global/classes/Activities";
import { FieldProperties } from "@openmarch/core";
import { appearanceModelRawToParsed } from "@/entity-components/appearance";
import type { NewSectionAppearanceArgs } from "@/db-functions";
import type { PreviousDotsSectionAppearanceImport } from "@om-electron/main/services/previous-dots-import-service";

function toNewSectionAppearanceArgs(
    appearance: PreviousDotsSectionAppearanceImport,
): NewSectionAppearanceArgs {
    const parsed = appearanceModelRawToParsed({
        fill_color: appearance.fill_color,
        outline_color: appearance.outline_color,
        shape_type: appearance.shape_type,
        visible: appearance.visible,
        label_visible: appearance.label_visible,
        equipment_name: appearance.equipment_name,
        equipment_state: appearance.equipment_state,
    });
    return {
        section: appearance.section,
        ...parsed,
    };
}

interface NewShowDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}

const STEP_COPY: Record<
    NewShowStepId,
    { titleKey: string; descriptionKey?: string }
> = {
    start: {
        titleKey: "launchpage.newShow.steps.start.title",
        descriptionKey: "launchpage.newShow.steps.start.description",
    },
    project: {
        titleKey: "launchpage.newShow.steps.project.title",
        descriptionKey: "launchpage.newShow.steps.project.description",
    },
    ensemble: {
        titleKey: "launchpage.newShow.steps.ensemble.title",
        descriptionKey: "launchpage.newShow.steps.ensemble.description",
    },
    field: {
        titleKey: "launchpage.newShow.steps.field.title",
        descriptionKey: "launchpage.newShow.steps.field.description",
    },
    performers: {
        titleKey: "launchpage.newShow.steps.performers.title",
        descriptionKey: "launchpage.newShow.steps.performers.description",
    },
    audio: {
        titleKey: "launchpage.newShow.steps.audio.title",
        descriptionKey: "launchpage.newShow.steps.audio.description",
    },
    tempo: {
        titleKey: "launchpage.newShow.steps.tempo.title",
        descriptionKey: "launchpage.newShow.steps.tempo.description",
    },
};

function getWizardSteps(state: NewShowWizardState): NewShowStepId[] {
    if (state.start?.mode === "importDrill") {
        // The drill-file import is entirely self-contained within the start
        // step (choose file -> import -> review & save), so it's the only
        // step in the wizard.
        return ["start"];
    }
    if (state.start?.mode === "importPrevious") {
        return ["start", "project", "ensemble", "audio", "tempo"];
    }
    return NEW_SHOW_STEPS;
}

export default function NewShowDialog({
    open,
    onOpenChange,
    onCreated,
}: NewShowDialogProps) {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const [wizardState, setWizardState] = useState<NewShowWizardState>(
        DEFAULT_NEW_SHOW_WIZARD_STATE,
    );
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [completedSteps, setCompletedSteps] = useState<ReadonlySet<number>>(
        () => new Set(),
    );
    const [isCompleting, setIsCompleting] = useState(false);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [isCreatingDraft, setIsCreatingDraft] = useState(false);
    const [drillActiveStep, setDrillActiveStep] =
        useState<DrillImportStep | null>(null);
    const [drillResult, setDrillResult] = useState<DrillImportResult | null>(
        null,
    );
    const [isSavingDrillShow, setIsSavingDrillShow] = useState(false);
    const [newShowDraftsDirectory, setNewShowDraftsDirectory] = useState("");
    const importDrill = useImportDrillPackage();

    const wizardSteps = useMemo(
        () => getWizardSteps(wizardState),
        [wizardState],
    );
    const currentStep = wizardSteps[currentStepIndex] ?? wizardSteps[0];
    const canGoNext = useNewShowValidation(
        wizardState,
        currentStep,
        newShowDraftsDirectory,
    );
    const isLastStep = currentStepIndex === wizardSteps.length - 1;
    const isFirstStep = currentStepIndex === 0;
    const canSkip = currentStep === "performers" || currentStep === "audio";
    const isDrillFlow = wizardState.start?.mode === "importDrill";

    const resetWizard = useCallback(() => {
        setWizardState(DEFAULT_NEW_SHOW_WIZARD_STATE);
        setCurrentStepIndex(0);
        setCompletedSteps(new Set());
        setDrillResult(null);
        setDrillActiveStep(null);
    }, []);

    useEffect(() => {
        if (currentStepIndex >= wizardSteps.length) {
            setCurrentStepIndex(wizardSteps.length - 1);
        }
    }, [currentStepIndex, wizardSteps.length]);

    useEffect(() => {
        if (open) {
            resetWizard();
            void window.electron
                .getNewShowDraftsDirectory()
                .then(setNewShowDraftsDirectory)
                .catch(() => setNewShowDraftsDirectory(""));
        }
    }, [open, resetWizard]);

    const closeAndReset = useCallback(async () => {
        if (wizardState.draftFilePath) {
            await window.electron.discardNewShowDraft();
            await invalidateDatabaseReadyQueries(queryClient);
        }
        resetWizard();
        onOpenChange(false);
    }, [wizardState.draftFilePath, queryClient, resetWizard, onOpenChange]);

    const requestClose = useCallback(() => {
        if (hasNewShowProgress(wizardState)) {
            setShowExitConfirm(true);
        } else {
            void closeAndReset();
        }
    }, [wizardState, closeAndReset]);

    const handleOpenChange = useCallback(
        (nextOpen: boolean) => {
            if (!nextOpen) {
                requestClose();
                return;
            }
            onOpenChange(true);
        },
        [requestClose, onOpenChange],
    );

    const confirmExit = useCallback(() => {
        setShowExitConfirm(false);
        void closeAndReset();
    }, [closeAndReset]);

    const markStepComplete = useCallback(() => {
        setCompletedSteps((prev) => new Set(prev).add(currentStepIndex));
    }, [currentStepIndex]);

    const ensureDraftCreated = useCallback(async (): Promise<string | null> => {
        if (wizardState.draftFilePath) return wizardState.draftFilePath;
        try {
            const result = await window.electron.createNewShowDraft();
            if (typeof result === "number" || !result.path) {
                throw new Error("Failed to create draft file");
            }
            setWizardState((prev) => ({
                ...prev,
                draftFilePath: result.path,
            }));
            return result.path;
        } catch (error) {
            conToastError(t("launchpage.newShow.errors.createFailed"), error);
            return null;
        }
    }, [wizardState.draftFilePath, t]);

    const handleNext = useCallback(async () => {
        if (!canGoNext || isCompleting || isCreatingDraft) return;

        if (currentStep === "project") {
            setIsCreatingDraft(true);
            try {
                const draftFilePath = await ensureDraftCreated();
                if (!draftFilePath) return;
            } finally {
                setIsCreatingDraft(false);
            }
        }

        markStepComplete();
        if (currentStepIndex < wizardSteps.length - 1) {
            setCurrentStepIndex((i) => i + 1);
        }
    }, [
        canGoNext,
        isCompleting,
        isCreatingDraft,
        currentStep,
        ensureDraftCreated,
        markStepComplete,
        currentStepIndex,
        wizardSteps.length,
    ]);

    const handleBack = useCallback(() => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex((i) => i - 1);
        }
    }, [currentStepIndex]);

    const handleSkip = useCallback(() => {
        markStepComplete();
        if (currentStep === "performers") {
            setWizardState((prev) => ({
                ...prev,
                performers: { method: "skip", marchers: [] },
            }));
        } else if (currentStep === "audio") {
            setWizardState((prev) => ({
                ...prev,
                audio: { method: "skip" },
            }));
        }
        if (!isLastStep) {
            setCurrentStepIndex((i) => i + 1);
        }
    }, [currentStep, isLastStep, markStepComplete]);

    const handleStartBlank = useCallback(() => {
        setWizardState((prev) => ({
            ...prev,
            start: { mode: "blank" },
            previousDotsImport: undefined,
            project: prev.project
                ? {
                      projectName: prev.project.projectName,
                      fileLocation: prev.project.fileLocation,
                  }
                : null,
            ensemble: null,
            field: null,
            performers: null,
        }));
        setCompletedSteps((prev) => {
            const next = new Set(prev);
            next.delete(0);
            return next;
        });
        setDrillResult(null);
        setDrillActiveStep(null);
    }, []);

    const handleImportPrevious = useCallback(async () => {
        setDrillResult(null);
        setDrillActiveStep(null);
        setIsCreatingDraft(true);
        try {
            const result = await window.electron.choosePreviousDotsFile();
            if (!result) return;

            const fieldTemplate = new FieldProperties(
                JSON.parse(result.fieldPropertiesJson),
            );
            const performers: NewShowPerformersData = {
                method: result.marchers.length > 0 ? "add" : "skip",
                marchers: result.marchers,
            };
            const fieldImage =
                result.fieldImage != null
                    ? result.fieldImage instanceof Uint8Array
                        ? result.fieldImage
                        : new Uint8Array(result.fieldImage)
                    : null;

            setWizardState((prev) => ({
                ...prev,
                start: { mode: "importPrevious" },
                project: {
                    projectName: prev.project?.projectName ?? "",
                    fileLocation: prev.project?.fileLocation ?? "",
                    designer: result.designer,
                    client: result.client,
                },
                ensemble: result.activity
                    ? { activity: result.activity }
                    : null,
                field: {
                    template: fieldTemplate,
                    isCustom: fieldTemplate.isCustom ?? false,
                },
                performers,
                previousDotsImport: {
                    sourcePath: result.sourcePath,
                    field: {
                        template: fieldTemplate,
                        isCustom: fieldTemplate.isCustom ?? false,
                    },
                    fieldImage,
                    performers,
                    coordinates: result.coordinates,
                    sectionAppearances: result.sectionAppearances.map(
                        toNewSectionAppearanceArgs,
                    ),
                    tags: result.tags,
                    marcherTags: result.marcherTags,
                    pageNumberOffset: result.pageNumberOffset,
                },
            }));
            setCompletedSteps((prev) => {
                const next = new Set(prev);
                next.delete(0);
                return next;
            });
        } catch (error) {
            conToastError(t("launchpage.newShow.errors.importFailed"), error);
        } finally {
            setIsCreatingDraft(false);
        }
    }, [t]);

    const handleImportDrillFile = useCallback(
        async (file: File) => {
            if (isCreatingDraft || isDrillFlow || importDrill.isPending) {
                return;
            }
            setDrillResult(null);
            setDrillActiveStep(null);
            setIsCreatingDraft(true);
            setWizardState((prev) => ({
                ...prev,
                start: { mode: "importDrill" },
            }));
            setCompletedSteps((prev) => {
                const next = new Set(prev);
                next.delete(0);
                return next;
            });
            try {
                const draftFilePath = await ensureDraftCreated();
                if (!draftFilePath) {
                    setDrillActiveStep(null);
                    setWizardState((prev) => ({ ...prev, start: null }));
                    return;
                }
                // The draft db has schema/data-guard triggers from
                // migrations, but not the undo/redo history triggers that
                // _importDrillShow's transactionWithHistory calls require.
                await createAllUndoTriggers(db);

                const imported = await importDrill.mutateAsync({
                    file,
                    onProgress: setDrillActiveStep,
                });
                setDrillResult(imported);
            } catch {
                // useImportDrillPackage's onError already toasts. Back out to
                // the choice cards so the user can retry or pick another
                // mode; the draft file itself is left in place and reused
                // (or discarded on dialog close) rather than recreated.
                setDrillActiveStep(null);
                setWizardState((prev) => ({ ...prev, start: null }));
            } finally {
                setIsCreatingDraft(false);
            }
        },
        [ensureDraftCreated, importDrill, isCreatingDraft, isDrillFlow],
    );

    const handleSaveDrillShow = useCallback(
        async (projectName: string, fileLocation: string) => {
            if (isSavingDrillShow) return;
            setIsSavingDrillShow(true);
            try {
                const targetPath = resolveNewShowFilePath(
                    projectName,
                    fileLocation,
                );
                const settings = await getWorkspaceSettingsParsed({ db });
                await updateWorkspaceSettingsParsed({
                    db,
                    settings: { ...settings, projectName },
                });

                const finalizeResult =
                    await window.electron.finalizeNewShowDraft(
                        targetPath,
                        projectName,
                    );
                if (finalizeResult !== 200) {
                    throw new Error(`Failed to save show at ${targetPath}`);
                }

                await queryClient.invalidateQueries({
                    queryKey: databaseReadyQueryOptions().queryKey,
                });
                toast.success(t("launchpage.newShow.success"));
                resetWizard();
                onCreated();
                onOpenChange(false);
            } catch (error) {
                const message =
                    error instanceof Error && error.message
                        ? error.message
                        : t("launchpage.newShow.errors.createFailed");
                conToastError(message, error);
            } finally {
                setIsSavingDrillShow(false);
            }
        },
        [
            isSavingDrillShow,
            queryClient,
            t,
            resetWizard,
            onCreated,
            onOpenChange,
        ],
    );

    const handleComplete = useCallback(async () => {
        if (isCompleting || isDrillFlow) return;
        setIsCompleting(true);
        try {
            const withDefaults: NewShowWizardState = {
                ...wizardState,
                ensemble: wizardState.ensemble ?? {
                    activity: DEFAULT_ACTIVITY,
                },
                field: wizardState.field ?? {
                    template:
                        FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
                    isCustom: false,
                },
                performers: wizardState.performers ?? {
                    method: "skip",
                    marchers: [],
                },
                audio: wizardState.audio ?? { method: "skip" },
                tempo: wizardState.tempo ?? { method: "skip" },
            };

            const draftFilePath =
                withDefaults.draftFilePath ?? (await ensureDraftCreated());
            if (!draftFilePath) return;

            const form = wizardStateToFormState({
                ...withDefaults,
                draftFilePath,
            });

            await completeNewShow(form, queryClient);
            toast.success(t("launchpage.newShow.success"));
            resetWizard();
            onCreated();
            onOpenChange(false);
        } catch (error) {
            const message =
                error instanceof Error && error.message
                    ? error.message
                    : t("launchpage.newShow.errors.createFailed");
            conToastError(message, error);
        } finally {
            setIsCompleting(false);
        }
    }, [
        isCompleting,
        isDrillFlow,
        wizardState,
        ensureDraftCreated,
        queryClient,
        t,
        resetWizard,
        onCreated,
        onOpenChange,
    ]);

    const handleProjectChange = useCallback((project: NewShowProjectData) => {
        setWizardState((prev) => ({ ...prev, project }));
    }, []);

    const handleEnsembleChange = useCallback(
        (ensemble: NewShowEnsembleData) => {
            setWizardState((prev) => ({ ...prev, ensemble }));
        },
        [],
    );

    const handleFieldChange = useCallback((field: NewShowFieldData) => {
        setWizardState((prev) => ({ ...prev, field }));
    }, []);

    const handlePerformersChange = useCallback(
        (performers: NewShowPerformersData) => {
            setWizardState((prev) => ({ ...prev, performers }));
        },
        [],
    );

    const handleAudioChange = useCallback((audio: NewShowAudioData) => {
        setWizardState((prev) => ({ ...prev, audio }));
    }, []);

    const handleTempoChange = useCallback((tempo: NewShowTempoData) => {
        setWizardState((prev) => ({ ...prev, tempo }));
    }, []);

    const stepContent = useMemo(() => {
        switch (currentStep) {
            case "start":
                return (
                    <StartStep
                        start={wizardState.start}
                        importedSourcePath={
                            wizardState.previousDotsImport?.sourcePath
                        }
                        importedPerformerCount={
                            wizardState.previousDotsImport?.performers.marchers
                                .length
                        }
                        onStartBlank={() => {
                            handleStartBlank();
                        }}
                        onImportPrevious={() => void handleImportPrevious()}
                        onImportDrillFile={(file) =>
                            void handleImportDrillFile(file)
                        }
                        isImporting={isCreatingDraft}
                        newShowDraftsDirectory={newShowDraftsDirectory}
                        drillImport={
                            isDrillFlow
                                ? {
                                      activeStep: drillActiveStep,
                                      result: drillResult,
                                      isSaving: isSavingDrillShow,
                                      onSave: (name, location) =>
                                          void handleSaveDrillShow(
                                              name,
                                              location,
                                          ),
                                  }
                                : null
                        }
                    />
                );
            case "project":
                return (
                    <ProjectStep
                        project={wizardState.project}
                        onChange={handleProjectChange}
                        newShowDraftsDirectory={newShowDraftsDirectory}
                    />
                );
            case "ensemble":
                return (
                    <EnsembleStep
                        ensemble={wizardState.ensemble}
                        onChange={handleEnsembleChange}
                    />
                );
            case "field":
                return (
                    <FieldStep
                        ensemble={wizardState.ensemble}
                        field={wizardState.field}
                        onChange={handleFieldChange}
                    />
                );
            case "performers":
                return (
                    <PerformersStep
                        performers={wizardState.performers}
                        onChange={handlePerformersChange}
                    />
                );
            case "audio":
                return (
                    <AudioStep
                        audio={wizardState.audio}
                        onChange={handleAudioChange}
                    />
                );
            case "tempo":
                return (
                    <TempoStep
                        tempo={wizardState.tempo}
                        onChange={handleTempoChange}
                    />
                );
            default:
                return null;
        }
    }, [
        currentStep,
        wizardState.start,
        wizardState.project,
        wizardState.ensemble,
        wizardState.field,
        wizardState.performers,
        wizardState.audio,
        wizardState.tempo,
        wizardState.previousDotsImport,
        isCreatingDraft,
        isDrillFlow,
        drillActiveStep,
        drillResult,
        isSavingDrillShow,
        handleStartBlank,
        handleImportPrevious,
        handleImportDrillFile,
        handleSaveDrillShow,
        handleProjectChange,
        handleEnsembleChange,
        handleFieldChange,
        handlePerformersChange,
        handleAudioChange,
        handleTempoChange,
    ]);

    const stepCopy = STEP_COPY[currentStep];

    return (
        <>
            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent
                    className="flex max-h-[85vh] w-[40rem] max-w-[95vw] flex-col overflow-hidden"
                    onPointerDownOutside={(e) => {
                        if (
                            isCompleting ||
                            isCreatingDraft ||
                            isSavingDrillShow
                        ) {
                            e.preventDefault();
                        }
                    }}
                    onEscapeKeyDown={(e) => {
                        e.preventDefault();
                        if (
                            isCompleting ||
                            isCreatingDraft ||
                            isSavingDrillShow
                        ) {
                            return;
                        }
                        requestClose();
                    }}
                >
                    <DialogTitle>
                        <T keyName="launchpage.newShow.title" />
                    </DialogTitle>
                    <NewShowModalLayout
                        currentStepIndex={currentStepIndex}
                        steps={wizardSteps}
                        stepTitle={
                            isDrillFlow ? (
                                <>
                                    {t(
                                        "launchpage.newShow.steps.start.importDrillTitle",
                                    )}
                                    <Badge variant="secondary">
                                        <T keyName="launchpage.newShow.steps.start.importDrillBeta" />
                                    </Badge>
                                </>
                            ) : (
                                t(stepCopy.titleKey)
                            )
                        }
                        stepDescription={
                            isDrillFlow
                                ? t(
                                      "launchpage.newShow.steps.start.importDrillSubtitle",
                                  )
                                : stepCopy.descriptionKey
                                  ? t(stepCopy.descriptionKey)
                                  : undefined
                        }
                        onNext={() => void handleNext()}
                        onBack={handleBack}
                        canGoNext={canGoNext && !isCreatingDraft}
                        isLastStep={isLastStep}
                        isFirstStep={isFirstStep}
                        onComplete={() => void handleComplete()}
                        onSkip={canSkip ? handleSkip : undefined}
                        canSkip={canSkip}
                        isCompleting={
                            isCompleting || isCreatingDraft || isDrillFlow
                        }
                        completedSteps={completedSteps}
                    >
                        {stepContent}
                    </NewShowModalLayout>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={showExitConfirm}
                onOpenChange={setShowExitConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogTitle>
                        <T keyName="launchpage.newShow.exitConfirm.title" />
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        <T keyName="launchpage.newShow.exitConfirm.description" />
                    </AlertDialogDescription>
                    <div className="flex justify-end gap-8">
                        <AlertDialogCancel>
                            <Button
                                variant="secondary"
                                size="compact"
                                onClick={() => setShowExitConfirm(false)}
                            >
                                <T keyName="launchpage.newShow.exitConfirm.cancel" />
                            </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction>
                            <Button
                                variant="red"
                                size="compact"
                                onClick={confirmExit}
                            >
                                <T keyName="launchpage.newShow.exitConfirm.confirm" />
                            </Button>
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
