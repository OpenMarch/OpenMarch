import { memo, forwardRef } from "react";
import { Button } from "@openmarch/ui";
import { T } from "@tolgee/react";
import {
    CaretLeftIcon,
    CaretRightIcon,
    CircleNotchIcon,
} from "@phosphor-icons/react";

interface WizardNavigationButtonsProps {
    canGoBack: boolean;
    canGoNext: boolean;
    isLastStep: boolean;
    isCompleting: boolean;
    canSkip: boolean;
    onBack?: () => void;
    onNext?: () => void;
    onComplete?: () => void;
    onSkip?: () => void;
    onExit?: () => void;
}

const WizardNavigationButtons = memo(
    forwardRef<HTMLButtonElement, WizardNavigationButtonsProps>(
        (
            {
                canGoBack,
                canGoNext,
                isLastStep,
                isCompleting,
                canSkip,
                onBack,
                onNext,
                onComplete,
                onSkip,
                onExit,
            },
            nextButtonRef,
        ) => {
            return (
                <div className="border-stroke mt-24 flex flex-shrink-0 items-center justify-between border-t pt-20">
                    <div className="flex gap-8">
                        {(canGoBack ? onBack : onExit) && (
                            <Button
                                variant="secondary"
                                onClick={canGoBack ? onBack : onExit}
                                disabled={isCompleting}
                                className="flex items-center gap-8"
                            >
                                <CaretLeftIcon size={20} aria-hidden="true" />
                                <T keyName="wizard.back" />
                            </Button>
                        )}
                        {canSkip && onSkip && (
                            <Button
                                variant="secondary"
                                onClick={onSkip}
                                disabled={isCompleting}
                            >
                                <T keyName="wizard.skip" />
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-8">
                        {isLastStep ? (
                            <Button
                                ref={nextButtonRef}
                                onClick={onComplete}
                                disabled={!canGoNext || isCompleting}
                                className="flex items-center gap-8"
                            >
                                {isCompleting ? (
                                    <>
                                        <CircleNotchIcon
                                            size={20}
                                            className="animate-spin"
                                            aria-hidden="true"
                                        />
                                        <T keyName="wizard.completing" />
                                    </>
                                ) : (
                                    <>
                                        <T keyName="wizard.complete" />
                                        <CaretRightIcon
                                            size={20}
                                            aria-hidden="true"
                                        />
                                    </>
                                )}
                            </Button>
                        ) : (
                            <Button
                                ref={nextButtonRef}
                                onClick={onNext}
                                disabled={!canGoNext || isCompleting}
                                className="flex items-center gap-8"
                            >
                                <T keyName="wizard.next" />
                                <CaretRightIcon size={20} aria-hidden="true" />
                            </Button>
                        )}
                    </div>
                </div>
            );
        },
    ),
);

WizardNavigationButtons.displayName = "WizardNavigationButtons";

export default WizardNavigationButtons;
