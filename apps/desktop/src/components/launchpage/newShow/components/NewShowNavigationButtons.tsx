import { Button } from "@openmarch/ui";
import { T } from "@tolgee/react";

interface NewShowNavigationButtonsProps {
    isFirstStep: boolean;
    isLastStep: boolean;
    canGoNext: boolean;
    canGoBack: boolean;
    canSkip?: boolean;
    isCompleting?: boolean;
    onBack: () => void;
    onNext: () => void;
    onComplete: () => void;
    onSkip?: () => void;
}

export default function NewShowNavigationButtons({
    isFirstStep,
    isLastStep,
    canGoNext,
    canGoBack,
    canSkip = false,
    isCompleting = false,
    onBack,
    onNext,
    onComplete,
    onSkip,
}: NewShowNavigationButtonsProps) {
    return (
        <div className="flex w-full justify-between gap-8 pt-8">
            <div>
                {!isFirstStep && (
                    <Button
                        variant="secondary"
                        onClick={onBack}
                        disabled={!canGoBack || isCompleting}
                    >
                        <T keyName="launchpage.newShow.back" />
                    </Button>
                )}
            </div>
            <div className="flex gap-8">
                {canSkip && onSkip && (
                    <Button
                        variant="secondary"
                        onClick={onSkip}
                        disabled={isCompleting}
                    >
                        <T keyName="launchpage.newShow.skip" />
                    </Button>
                )}
                {isLastStep ? (
                    <Button
                        onClick={onComplete}
                        disabled={!canGoNext || isCompleting}
                    >
                        <T keyName="launchpage.newShow.create" />
                    </Button>
                ) : (
                    <Button
                        onClick={onNext}
                        disabled={!canGoNext || isCompleting}
                    >
                        <T keyName="launchpage.newShow.next" />
                    </Button>
                )}
            </div>
        </div>
    );
}
