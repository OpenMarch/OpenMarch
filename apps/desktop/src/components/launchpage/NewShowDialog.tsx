import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
} from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import NewShowModalLayout from "./newShow/NewShowModalLayout";
import ProjectStep from "./newShow/steps/ProjectStep";
import EnsembleStep from "./newShow/steps/EnsembleStep";
import FieldStep from "./newShow/steps/FieldStep";
import PerformersStep from "./newShow/steps/PerformersStep";
import MusicStep from "./newShow/steps/MusicStep";
import { useNewShowValidation } from "./newShow/hooks/useNewShowValidation";
import {
    DEFAULT_NEW_SHOW_WIZARD_STATE,
    hasNewShowProgress,
    NEW_SHOW_STEPS,
    type NewShowEnsembleData,
    type NewShowFieldData,
    type NewShowMusicData,
    type NewShowPerformersData,
    type NewShowProjectData,
    type NewShowStepId,
    type NewShowWizardState,
    wizardStateToFormState,
} from "./newShowTypes";
import { completeNewShow } from "./newShowCompletion";
import { conToastError } from "@/utilities/utils";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

interface NewShowDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}

const STEP_COPY: Record<
    NewShowStepId,
    { titleKey: string; descriptionKey?: string }
> = {
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
    music: {
        titleKey: "launchpage.newShow.steps.music.title",
        descriptionKey: "launchpage.newShow.steps.music.description",
    },
};

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

    const currentStep = NEW_SHOW_STEPS[currentStepIndex];
    const canGoNext = useNewShowValidation(wizardState, currentStep);
    const isLastStep = currentStepIndex === NEW_SHOW_STEPS.length - 1;
    const isFirstStep = currentStepIndex === 0;
    const canSkip = currentStep === "performers" || currentStep === "music";

    const resetWizard = useCallback(() => {
        setWizardState(DEFAULT_NEW_SHOW_WIZARD_STATE);
        setCurrentStepIndex(0);
        setCompletedSteps(new Set());
    }, []);

    useEffect(() => {
        if (open) {
            resetWizard();
        }
    }, [open, resetWizard]);

    const closeAndReset = useCallback(async () => {
        if (wizardState.draftFilePath) {
            await window.electron.discardNewShowDraft();
        }
        resetWizard();
        onOpenChange(false);
    }, [wizardState.draftFilePath, resetWizard, onOpenChange]);

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

    const ensureDraftCreated = useCallback(async (): Promise<boolean> => {
        if (wizardState.draftFilePath) return true;
        setIsCreatingDraft(true);
        try {
            const result = await window.electron.createNewShowDraft();
            if (typeof result === "number" || !result.path) {
                throw new Error("Failed to create draft file");
            }
            setWizardState((prev) => ({
                ...prev,
                draftFilePath: result.path,
            }));
            return true;
        } catch (error) {
            conToastError(t("launchpage.newShow.errors.createFailed"), error);
            return false;
        } finally {
            setIsCreatingDraft(false);
        }
    }, [wizardState.draftFilePath, t]);

    const handleNext = useCallback(async () => {
        if (!canGoNext || isCompleting || isCreatingDraft) return;

        if (currentStep === "project") {
            const ok = await ensureDraftCreated();
            if (!ok) return;
        }

        markStepComplete();
        if (currentStepIndex < NEW_SHOW_STEPS.length - 1) {
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
        } else if (currentStep === "music") {
            setWizardState((prev) => ({
                ...prev,
                music: { method: "skip" },
            }));
        }
        if (!isLastStep) {
            setCurrentStepIndex((i) => i + 1);
        }
    }, [currentStep, isLastStep, markStepComplete]);

    const handleComplete = useCallback(async () => {
        if (isCompleting) return;
        setIsCompleting(true);
        try {
            const withDefaults: NewShowWizardState = {
                ...wizardState,
                ensemble: wizardState.ensemble ?? {
                    environment: "outdoor",
                    ensemble_type: "Marching Band",
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
                music: wizardState.music ?? { method: "skip" },
            };

            if (!withDefaults.draftFilePath) {
                const ok = await ensureDraftCreated();
                if (!ok) return;
            }

            const form = wizardStateToFormState({
                ...withDefaults,
                draftFilePath:
                    withDefaults.draftFilePath ?? wizardState.draftFilePath,
            });

            await completeNewShow(form, queryClient);
            toast.success(t("launchpage.newShow.success"));
            resetWizard();
            onCreated();
            onOpenChange(false);
        } catch (error) {
            conToastError(t("launchpage.newShow.errors.createFailed"), error);
        } finally {
            setIsCompleting(false);
        }
    }, [
        isCompleting,
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

    const handleMusicChange = useCallback((music: NewShowMusicData) => {
        setWizardState((prev) => ({ ...prev, music }));
    }, []);

    const stepContent = useMemo(() => {
        switch (currentStep) {
            case "project":
                return (
                    <ProjectStep
                        project={wizardState.project}
                        onChange={handleProjectChange}
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
            case "music":
                return (
                    <MusicStep
                        music={wizardState.music}
                        onChange={handleMusicChange}
                    />
                );
            default:
                return null;
        }
    }, [
        currentStep,
        wizardState.project,
        wizardState.ensemble,
        wizardState.field,
        wizardState.performers,
        wizardState.music,
        handleProjectChange,
        handleEnsembleChange,
        handleFieldChange,
        handlePerformersChange,
        handleMusicChange,
    ]);

    const stepCopy = STEP_COPY[currentStep];

    return (
        <>
            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent
                    className="flex max-h-[85vh] w-[40rem] max-w-[95vw] flex-col overflow-hidden"
                    onPointerDownOutside={(e) => {
                        if (isCompleting || isCreatingDraft) {
                            e.preventDefault();
                        }
                    }}
                    onEscapeKeyDown={(e) => {
                        e.preventDefault();
                        requestClose();
                    }}
                >
                    <DialogTitle>
                        <T keyName="launchpage.newShow.title" />
                    </DialogTitle>
                    <NewShowModalLayout
                        currentStepIndex={currentStepIndex}
                        stepTitle={t(stepCopy.titleKey)}
                        stepDescription={
                            stepCopy.descriptionKey
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
                        isCompleting={isCompleting || isCreatingDraft}
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
