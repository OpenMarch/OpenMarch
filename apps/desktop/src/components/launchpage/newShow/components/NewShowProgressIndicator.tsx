import { NEW_SHOW_STEPS } from "../../newShowTypes";
import clsx from "clsx";

interface NewShowProgressIndicatorProps {
    currentStepIndex: number;
    completedSteps: ReadonlySet<number>;
}

export default function NewShowProgressIndicator({
    currentStepIndex,
    completedSteps,
}: NewShowProgressIndicatorProps) {
    return (
        <div className="flex w-full items-center justify-center gap-8 px-8">
            {NEW_SHOW_STEPS.map((_, index) => (
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
