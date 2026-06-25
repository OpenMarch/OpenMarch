import { ReactNode } from "react";
import { Button } from "@openmarch/ui";
import { T } from "@tolgee/react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

interface WizardStepProps {
    title: string;
    description?: string;
    children: ReactNode;
    onNext?: () => void;
    onBack?: () => void;
    canGoNext?: boolean;
    canGoBack?: boolean;
    isLastStep?: boolean;
    onComplete?: () => void;
    onSkip?: () => void;
    canSkip?: boolean;
}

export default function WizardStep({
    title,
    description,
    children,
    onNext,
    onBack,
    canGoNext = true,
    canGoBack = true,
    isLastStep = false,
    onComplete,
    onSkip,
    canSkip = false,
}: WizardStepProps) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="mb-16 flex-shrink-0">
                <h2 className="text-h3 mb-4">{title}</h2>
                {description && (
                    <p className="text-body text-text/80">{description}</p>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

            <div className="border-stroke mt-16 flex flex-shrink-0 items-center justify-between border-t pt-16">
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
                </div>
                <div className="flex gap-8">
                    {isLastStep ? (
                        <Button
                            onClick={onComplete}
                            disabled={!canGoNext}
                            className="flex items-center gap-8"
                        >
                            <T keyName="wizard.complete" />
                            <CaretRightIcon size={20} />
                        </Button>
                    ) : (
                        <Button
                            onClick={onNext}
                            disabled={!canGoNext}
                            className="flex items-center gap-8"
                        >
                            <T keyName="wizard.next" />
                            <CaretRightIcon size={20} />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
