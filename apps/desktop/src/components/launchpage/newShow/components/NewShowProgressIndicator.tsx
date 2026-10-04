import type { NewShowStepId } from "../../newShowTypes";
import clsx from "clsx";

interface NewShowProgressIndicatorProps {
    currentStepIndex: number;
    steps: NewShowStepId[];
    completedSteps: ReadonlySet<number>;
}

export default function NewShowProgressIndicator({
    currentStepIndex,
    steps,
    completedSteps,
}: NewShowProgressIndicatorProps) {
    return (
        <div className="flex w-full items-center justify-center gap-8 px-8">
            {steps.map((_, index) => (
                <div
                    key={index}
                    className={clsx(
                        "h-8 flex-1 rounded-full transition-colors duration-150",
                        index === currentStepIndex
                            ? "bg-accent"
                            : completedSteps.has(index)
                              ? "bg-accent/50"
                              : "bg-fg-2",
                    )}
                />
            ))}
        </div>
    );
}
