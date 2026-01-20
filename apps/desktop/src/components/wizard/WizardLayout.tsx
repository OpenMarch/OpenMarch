import { ReactNode } from "react";
import { Button } from "@openmarch/ui";
import { T } from "@tolgee/react";
import {
    ArrowLeftIcon,
    CaretLeftIcon,
    CaretRightIcon,
} from "@phosphor-icons/react";
import type { WizardStepId } from "./types";
import { WIZARD_STEPS } from "./types";

interface WizardLayoutProps {
    currentStepIndex: number;
    stepTitle: string;
    stepDescription?: string;
    children: ReactNode;
    onNext?: () => void;
    onBack?: () => void;
    canGoNext?: boolean;
    canGoBack?: boolean;
    isLastStep?: boolean;
    onComplete?: () => void;
    onSkip?: () => void;
    canSkip?: boolean;
    isCompleting?: boolean;
    onExitWizard?: () => void;
}

const STEP_LABELS: Record<WizardStepId, string> = {
    project: "Project",
    ensemble: "Ensemble",
    field: "Field",
    performers: "Performers",
    music: "Music",
};

export default function WizardLayout({
    currentStepIndex,
    stepTitle,
    stepDescription,
    children,
    onNext,
    onBack,
    canGoNext = true,
    canGoBack = true,
    isLastStep = false,
    onComplete,
    onSkip,
    canSkip = false,
    isCompleting = false,
    onExitWizard,
}: WizardLayoutProps) {
    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            {/* Progress indicator */}
            <div className="mb-24 flex flex-shrink-0 items-center gap-10">
                {WIZARD_STEPS.map((step, index) => (
                    <div key={step} className="flex flex-1 items-center gap-10">
                        <div
                            className={`flex h-32 w-32 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                                index <= currentStepIndex
                                    ? "border-accent bg-accent text-bg-1"
                                    : "border-stroke text-text/60"
                            }`}
                            aria-label={`${STEP_LABELS[step]} step ${index + 1} of ${WIZARD_STEPS.length}`}
                            title={STEP_LABELS[step]}
                        >
                            {index + 1}
                        </div>
                        {index < WIZARD_STEPS.length - 1 && (
                            <div
                                className={`h-1 flex-1 transition-all duration-200 ${
                                    index < currentStepIndex
                                        ? "bg-accent"
                                        : "bg-stroke"
                                }`}
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Step content */}
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-24 flex-shrink-0 text-center">
                    <h2 className="text-h3 mb-8 font-medium">{stepTitle}</h2>
                    {stepDescription && (
                        <p className="text-body text-text/70">
                            {stepDescription}
                        </p>
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pb-8">
                    {children}
                </div>

                {/* Navigation buttons */}
                <div className="border-stroke mt-24 flex flex-shrink-0 items-center justify-between border-t pt-20">
                    <div className="flex gap-8">
                        {canGoBack && onBack && (
                            <Button
                                variant="secondary"
                                onClick={onBack}
                                className="flex items-center gap-8"
                            >
                                <CaretLeftIcon size={20} />
                                <T keyName="wizard.back" />
                            </Button>
                        )}
                        {canSkip && onSkip && (
                            <Button variant="secondary" onClick={onSkip}>
                                <T keyName="wizard.skip" />
                            </Button>
                        )}
                        {onExitWizard && (
                            <Button
                                variant="secondary"
                                onClick={onExitWizard}
                                className="flex items-center gap-8"
                            >
                                <ArrowLeftIcon size={20} />
                                <T keyName="wizard.back" />
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-8">
                        {isLastStep ? (
                            <Button
                                onClick={onComplete}
                                disabled={!canGoNext || isCompleting}
                                className="flex items-center gap-8"
                            >
                                <T keyName="wizard.complete" />
                                <CaretRightIcon size={20} />
                            </Button>
                        ) : (
                            <Button
                                onClick={onNext}
                                disabled={!canGoNext || isCompleting}
                                className="flex items-center gap-8"
                            >
                                <T keyName="wizard.next" />
                                <CaretRightIcon size={20} />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
