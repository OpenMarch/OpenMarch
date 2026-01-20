import { memo } from "react";
import { CheckIcon } from "@phosphor-icons/react";
import type { WizardStepId } from "../types";
import { WIZARD_STEPS } from "../types";

const STEP_LABELS: Record<WizardStepId, string> = {
    project: "Project",
    ensemble: "Ensemble",
    field: "Field",
    performers: "Performers",
    music: "Music",
};

interface WizardProgressIndicatorProps {
    currentStepIndex: number;
    completedSteps: ReadonlySet<number>;
}

const STEP_CLASSES = {
    current: "border-accent bg-accent text-bg-1 ring-2 ring-accent/20",
    completed: "border-accent bg-accent text-bg-1",
    upcoming: "border-stroke text-text/60",
} as const;

function WizardProgressIndicator({
    currentStepIndex,
    completedSteps,
}: WizardProgressIndicatorProps) {
    return (
        <nav
            className="mb-24 flex flex-shrink-0 items-center gap-10"
            aria-label="Wizard progress"
            role="navigation"
        >
            <ol className="flex flex-1 items-center gap-10" role="list">
                {WIZARD_STEPS.map((step, index) => {
                    const isCompleted = completedSteps.has(index);
                    const isCurrent = index === currentStepIndex;
                    const isPast = index < currentStepIndex;
                    const stepState = isCurrent
                        ? "current"
                        : isPast || isCompleted
                          ? "completed"
                          : "upcoming";

                    return (
                        <li
                            key={step}
                            className="flex flex-1 items-center gap-10"
                            role="listitem"
                        >
                            <div
                                className={`relative flex h-32 w-32 items-center justify-center rounded-full border-2 transition-all duration-200 ${STEP_CLASSES[stepState]}`}
                                aria-label={`${STEP_LABELS[step]} step ${index + 1} of ${WIZARD_STEPS.length}`}
                                aria-current={isCurrent ? "step" : undefined}
                                title={STEP_LABELS[step]}
                            >
                                {isCompleted && !isCurrent ? (
                                    <CheckIcon
                                        size={16}
                                        className="text-bg-1"
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <span aria-hidden="true">{index + 1}</span>
                                )}
                            </div>
                            {index < WIZARD_STEPS.length - 1 && (
                                <div
                                    className={`h-1 flex-1 transition-all duration-200 ${
                                        isPast || isCompleted
                                            ? "bg-accent"
                                            : "bg-stroke"
                                    }`}
                                    aria-hidden="true"
                                />
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

export default memo(WizardProgressIndicator);
