import { ReactNode } from "react";
import NewShowProgressIndicator from "./components/NewShowProgressIndicator";
import NewShowNavigationButtons from "./components/NewShowNavigationButtons";
import type { NewShowStepId } from "./newShowTypes";

interface NewShowModalLayoutProps {
    currentStepIndex: number;
    steps: NewShowStepId[];
    stepTitle: string;
    stepDescription?: string;
    children: ReactNode;
    onNext: () => void;
    onBack: () => void;
    canGoNext: boolean;
    canGoBack?: boolean;
    isLastStep: boolean;
    isFirstStep: boolean;
    onComplete: () => void;
    onSkip?: () => void;
    canSkip?: boolean;
    isCompleting?: boolean;
    completedSteps: ReadonlySet<number>;
}

export default function NewShowModalLayout({
    currentStepIndex,
    steps,
    stepTitle,
    stepDescription,
    children,
    onNext,
    onBack,
    canGoNext,
    canGoBack = true,
    isLastStep,
    isFirstStep,
    onComplete,
    onSkip,
    canSkip,
    isCompleting,
    completedSteps,
}: NewShowModalLayoutProps) {
    return (
        <div className="flex min-h-0 flex-col gap-16">
            <NewShowProgressIndicator
                currentStepIndex={currentStepIndex}
                steps={steps}
                completedSteps={completedSteps}
            />
            <div className="text-center">
                <h2 className="text-h4 mb-4 font-medium">{stepTitle}</h2>
                {stepDescription && (
                    <p className="text-body text-text/70">{stepDescription}</p>
                )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4">
                {children}
            </div>
            <NewShowNavigationButtons
                isFirstStep={isFirstStep}
                isLastStep={isLastStep}
                canGoNext={canGoNext}
                canGoBack={canGoBack}
                canSkip={canSkip}
                isCompleting={isCompleting}
                onBack={onBack}
                onNext={onNext}
                onComplete={onComplete}
                onSkip={onSkip}
            />
        </div>
    );
}
