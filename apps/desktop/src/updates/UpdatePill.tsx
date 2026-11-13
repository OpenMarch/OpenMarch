import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import clsx from "clsx";
import { T, useTranslate } from "@tolgee/react";
import { Button } from "@openmarch/ui";
import { ArrowCircleUpIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { UpdateState } from "@/global/updates";
import { POPOVER_CLASS } from "@/components/ui/popupClasses";
import { Tip } from "@/components/ui/Tip";
import {
    megabytes,
    openReleasePage,
    pendingVersion,
    useUpdateState,
} from "./useUpdateState";

/**
 * The update pill beside the version in the title bar (fork #404). It shows only when there is
 * something to do or watch: an update to download, one downloading, one ready to install, or one
 * that failed. A download the person asked for shows its text and progress bar; an automatic
 * one is only a small progress ring, with the percentage in its tooltip. The popover holds the
 * step to take: Download, Update now, Move to Applications (macOS, outside Applications), or
 * Try again and Download installer.
 */
export default function UpdatePill() {
    const { t } = useTranslate();
    const state = useUpdateState();
    const [open, setOpen] = useState(false);
    if (!state) return null;
    const version = pendingVersion(state);
    const { kind } = state.phase;
    const failed =
        (kind === "error" && version !== undefined) ||
        (state.failedInstallVersion !== undefined &&
            kind !== "available" &&
            kind !== "downloading" &&
            kind !== "downloaded");
    const active =
        kind === "available" || kind === "downloading" || kind === "downloaded";
    if (!version || (!failed && !active)) return null;
    // An automatic download: a quiet ring, not text
    const quiet =
        !failed && state.phase.kind === "downloading" && !state.phase.requested;
    const percent =
        state.phase.kind === "downloading"
            ? Math.floor(state.phase.percent)
            : 0;
    const label = t(
        failed
            ? "updates.pill.failed"
            : quiet
              ? "updates.pill.downloadingQuiet"
              : kind === "downloaded"
                ? "updates.pill.ready"
                : kind === "downloading"
                  ? "updates.pill.downloading"
                  : "updates.pill.available",
        { percent },
    );

    const trigger = (
        <Popover.Trigger asChild>
            <button
                type="button"
                data-testid="update-pill"
                data-phase={failed ? "error" : kind}
                data-quiet={quiet || undefined}
                aria-label={label}
                className={clsx(
                    // Touch: the icon alone, a finger's size, to leave the row for the tabs
                    "titlebar-button text-sub touch:size-44 touch:justify-center touch:px-0 flex cursor-pointer items-center gap-6 rounded-full py-2 leading-none outline-hidden duration-150 ease-out focus-visible:ring-2",
                    quiet ? "px-4" : "px-8",
                    failed
                        ? "text-red focus-visible:ring-red"
                        : kind === "downloaded"
                          ? "bg-accent text-text-invert hover:bg-accent/80 focus-visible:ring-accent"
                          : "text-accent focus-visible:ring-accent hover:bg-text/10",
                )}
            >
                {failed ? (
                    <WarningCircleIcon size={14} />
                ) : quiet ? (
                    <ProgressRing percent={percent} />
                ) : (
                    <ArrowCircleUpIcon size={14} />
                )}
                {!quiet && (
                    <span aria-hidden className="touch:hidden">
                        <PillLabel state={state} failed={failed} />
                    </span>
                )}
            </button>
        </Popover.Trigger>
    );

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            {quiet ? (
                <Tip label={label} side="bottom">
                    {trigger}
                </Tip>
            ) : (
                trigger
            )}
            <Popover.Portal>
                <Popover.Content
                    side="bottom"
                    align="start"
                    sideOffset={8}
                    className={clsx(
                        POPOVER_CLASS,
                        "z-50 flex w-[22rem] flex-col gap-12 select-text",
                    )}
                    data-testid="update-popover"
                >
                    <UpdateDetails
                        state={state}
                        version={version}
                        failed={failed}
                        close={() => setOpen(false)}
                    />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

function PillLabel({ state, failed }: { state: UpdateState; failed: boolean }) {
    const { phase } = state;
    if (failed) return <T keyName="updates.pill.failed" />;
    if (phase.kind === "downloading")
        return (
            <span className="flex items-center gap-6">
                <T
                    keyName="updates.pill.downloading"
                    params={{ percent: Math.floor(phase.percent) }}
                />
                <ProgressBar percent={phase.percent} className="w-48" />
            </span>
        );
    if (phase.kind === "downloaded") return <T keyName="updates.pill.ready" />;
    return <T keyName="updates.pill.available" />;
}

/** A download's progress as a small ring, for an automatic download */
function ProgressRing({ percent }: { percent: number }) {
    const radius = 5.5;
    const circumference = 2 * Math.PI * radius;
    const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference;
    return (
        <svg
            width={14}
            height={14}
            viewBox="0 0 14 14"
            aria-hidden
            data-testid="update-progress-ring"
            className="-rotate-90"
        >
            <circle
                cx={7}
                cy={7}
                r={radius}
                fill="none"
                strokeWidth={2}
                className="stroke-text/15"
            />
            <circle
                cx={7}
                cy={7}
                r={radius}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray={`${filled} ${circumference}`}
                className="stroke-accent transition-[stroke-dasharray] duration-300 ease-out"
            />
        </svg>
    );
}

function ProgressBar({
    percent,
    className,
}: {
    percent: number;
    className?: string;
}) {
    return (
        <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.floor(percent)}
            className={clsx(
                "bg-text/15 block h-4 overflow-hidden rounded-full",
                className,
            )}
        >
            <span
                className="bg-accent block h-full rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
        </span>
    );
}

// eslint-disable-next-line max-lines-per-function -- one popover body per phase
function UpdateDetails({
    state,
    version,
    failed,
    close,
}: {
    state: UpdateState;
    version: string;
    failed: boolean;
    close: () => void;
}) {
    const { t } = useTranslate();
    const { phase } = state;
    const updates = window.electron.updates;
    const installerButton = (
        <Button
            size="compact"
            variant={failed ? "primary" : "secondary"}
            onClick={() => openReleasePage(state, version)}
        >
            <T keyName="updates.action.downloadInstaller" />
        </Button>
    );

    let body: React.ReactNode;
    let actions: React.ReactNode;
    if (state.needsMoveToApplications && !failed) {
        body = <T keyName="updates.popover.moveBody" />;
        actions = (
            <Button
                size="compact"
                variant="primary"
                onClick={() => void updates.moveToApplications()}
            >
                <T keyName="updates.action.moveToApplications" />
            </Button>
        );
    } else if (failed) {
        const installFailed =
            phase.kind !== "error" && state.failedInstallVersion !== undefined;
        body = installFailed ? (
            <T
                keyName="updates.popover.installFailedBody"
                params={{ version }}
            />
        ) : (
            <T keyName="updates.popover.errorBody" />
        );
        actions = (
            <>
                {!installFailed && (
                    <Button
                        size="compact"
                        variant="secondary"
                        onClick={() => void updates.download()}
                    >
                        <T keyName="updates.action.retry" />
                    </Button>
                )}
                {installerButton}
            </>
        );
    } else if (phase.kind === "downloading") {
        body = (
            <div className="flex flex-col gap-6">
                <ProgressBar percent={phase.percent} className="w-full" />
                <span className="text-sub text-text-subtitle">
                    {phase.total > 0 ? (
                        <T
                            keyName="updates.popover.downloadingBody"
                            params={{
                                transferred: megabytes(phase.transferred),
                                total: megabytes(phase.total),
                                speed: megabytes(phase.bytesPerSecond),
                            }}
                        />
                    ) : (
                        <T keyName="updates.popover.downloadingStarting" />
                    )}
                </span>
            </div>
        );
        actions = null;
    } else if (phase.kind === "downloaded") {
        body = <T keyName="updates.popover.readyBody" />;
        actions = (
            <>
                <Button size="compact" variant="secondary" onClick={close}>
                    <T keyName="updates.action.later" />
                </Button>
                <Button
                    size="compact"
                    variant="primary"
                    data-testid="update-now"
                    onClick={() => void updates.install()}
                >
                    <T keyName="updates.action.updateNow" />
                </Button>
            </>
        );
    } else {
        body = <T keyName="updates.popover.availableBody" />;
        actions = (
            <Button
                size="compact"
                variant="primary"
                onClick={() => void updates.download()}
            >
                <T keyName="updates.action.download" />
            </Button>
        );
    }

    return (
        <>
            <div className="flex flex-col gap-2">
                <h2 className="text-body text-text font-medium">
                    {/* i18n-ignore: the product name and a version number */}
                    {`OpenMarch ${version}`}
                </h2>
                <p className="text-sub text-text-subtitle">
                    <T
                        keyName="updates.popover.current"
                        params={{ version: state.currentVersion }}
                    />
                </p>
            </div>
            <div className="text-body text-text">{body}</div>
            {phase.kind === "error" && (
                <p className="text-sub text-text-subtitle line-clamp-3 font-mono break-words">
                    {phase.message}
                </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-8">
                {failed ? (
                    <span />
                ) : (
                    <button
                        type="button"
                        className="text-sub text-text-subtitle hover:text-accent cursor-pointer underline-offset-2 hover:underline"
                        onClick={() => openReleasePage(state, version)}
                    >
                        {t("updates.action.whatsNew")}
                    </button>
                )}
                <div className="flex gap-8">{actions}</div>
            </div>
        </>
    );
}
