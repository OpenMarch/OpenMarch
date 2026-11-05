import type { ReactNode } from "react";
import { useTranslate } from "@tolgee/react";
import NewShowProgressIndicator from "@/components/launchpage/newShow/components/NewShowProgressIndicator";
import OpenMarchLogo from "@/components/OpenMarchLogo";
import type { WelcomeStepId } from "./welcomeFlowSteps";
import DevSkipSetupButton from "./DevSkipSetupButton";

/** Where a step sits in the setup: drives the progress bar and "Step 2 of 4". */
export type SetupProgress = {
    steps: readonly WelcomeStepId[];
    index: number;
};

/**
 * The frame every setup step shares: the logo and progress bar, the step
 * count and heading, the step's content, then Back on the left and the step's
 * main buttons on the right, with the developer skip under them.
 */
export default function WelcomeFrame({
    progress,
    title,
    children,
    back,
    actions,
    onDevSkip,
    devSkipDisabled,
    "aria-label": ariaLabel,
    testId = "welcome-flow",
    contentKey,
}: {
    progress: SetupProgress;
    title: ReactNode;
    children: ReactNode;
    /** Back, or nothing on the first step. */
    back?: ReactNode;
    actions: ReactNode;
    onDevSkip: () => void;
    devSkipDisabled?: boolean;
    "aria-label"?: string;
    testId?: string;
    /** Changes fade the content in again. */
    contentKey?: string;
}) {
    const { t } = useTranslate();
    const count = progress.steps.length;
    const completed = new Set(
        Array.from({ length: progress.index }, (_, i) => i),
    );
    return (
        <main
            className="flex min-h-0 flex-1 p-8"
            aria-label={ariaLabel ?? t("welcomeFlow.dialogLabel")}
            data-testid={testId}
        >
            <div className="bg-fg-1 border-stroke rounded-6 flex min-h-0 flex-1 flex-col overflow-y-auto border px-24 py-32">
                <div className="m-auto flex w-full max-w-[46rem] flex-col gap-24">
                    {/* A single question (analytics alone) is one short screen:
                        no progress bar or step count */}
                    <div className="flex items-center gap-24">
                        <OpenMarchLogo
                            height={28}
                            className="text-text shrink-0"
                        />
                        {count > 1 && (
                            <NewShowProgressIndicator
                                currentStepIndex={progress.index}
                                steps={progress.steps}
                                completedSteps={completed}
                            />
                        )}
                    </div>
                    <div className="flex flex-col items-center gap-4">
                        {count > 1 && (
                            <span className="text-sub text-text-subtitle tracking-wide uppercase">
                                {t("welcomeFlow.step", {
                                    current: progress.index + 1,
                                    total: count,
                                })}
                            </span>
                        )}
                        <h1 className="text-h3 text-text text-center font-medium">
                            {title}
                        </h1>
                    </div>

                    <div key={contentKey} className="animate-fade-in">
                        {children}
                    </div>

                    <div className="flex w-full items-center justify-between gap-8 pt-8">
                        {back ?? <span />}
                        <div className="flex items-center gap-8">{actions}</div>
                    </div>
                    <DevSkipSetupButton
                        onSkip={onDevSkip}
                        disabled={devSkipDisabled}
                        className="-mt-16 self-end"
                    />
                </div>
            </div>
        </main>
    );
}
