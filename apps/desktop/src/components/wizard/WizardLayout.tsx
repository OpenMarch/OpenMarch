import { ReactNode, useEffect, useRef, memo } from "react";
import WizardProgressIndicator from "./components/WizardProgressIndicator";
import WizardNavigationButtons from "./components/WizardNavigationButtons";
import { useWizardKeyboard } from "./hooks/useWizardKeyboard";

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
    completedSteps?: ReadonlySet<number>;
}

function WizardLayout({
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
    completedSteps = new Set(),
}: WizardLayoutProps) {
    const stepContentRef = useRef<HTMLDivElement>(null);
    const nextButtonRef = useRef<HTMLButtonElement>(null);

    const isNavigatingRef = useRef(false);

    const { handleKeyDown } = useWizardKeyboard({
        isCompleting,
        isLastStep,
        canGoNext,
        canGoBack,
        onNext,
        onBack,
        onComplete,
        onExit: onExitWizard,
        isNavigating: () => isNavigatingRef.current,
    });

    // Focus management on step change
    useEffect(() => {
        stepContentRef.current?.focus({ preventScroll: true });
    }, [currentStepIndex]);

    return (
        <div
            className="flex h-full min-h-0 w-full flex-col"
            onKeyDown={handleKeyDown}
        >
            <WizardProgressIndicator
                currentStepIndex={currentStepIndex}
                completedSteps={completedSteps}
            />

            <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-24 flex-shrink-0 text-center">
                    <h2 className="text-h3 mb-8 font-medium">{stepTitle}</h2>
                    {stepDescription && (
                        <p className="text-body text-text/70">
                            {stepDescription}
                        </p>
                    )}
                </div>

                <div
                    ref={stepContentRef}
                    className="min-h-0 flex-1 overflow-y-auto pb-8 focus:outline-none"
                    tabIndex={-1}
                    aria-live="polite"
                    aria-atomic="true"
                >
                    {children}
                </div>

                <WizardNavigationButtons
                    ref={nextButtonRef}
                    canGoBack={canGoBack}
                    canGoNext={canGoNext}
                    isLastStep={isLastStep}
                    isCompleting={isCompleting}
                    canSkip={canSkip}
                    onBack={onBack}
                    onNext={onNext}
                    onComplete={onComplete}
                    onSkip={onSkip}
                    onExit={onExitWizard}
                />
            </div>
        </div>
    );
}

export default memo(WizardLayout);
