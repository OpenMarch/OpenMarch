import * as Popover from "@radix-ui/react-popover";
import {
    CheckCircleIcon,
    CircleNotchIcon,
    ClockIcon,
    FloppyDiskIcon,
    WarningCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@openmarch/ui";
import { useTolgee } from "@tolgee/react";
import clsx from "clsx";
import type { WorkingCopyStatus } from "@om-electron/database/workingCopy/WorkingCopySession";
import { fileNameOf } from "@/hooks/useWorkingCopyStatus";

type Kind = "saved" | "pending" | "saving" | "problem";

function kindOf(status: WorkingCopyStatus): Kind {
    switch (status.state) {
        case "saved":
            return "saved";
        case "saving":
            return "saving";
        case "unsaved":
            return "pending";
        default:
            return "problem";
    }
}

/**
 * The open show's save state in the title bar while working-copy saves are on (ADR 0018):
 * "Saved", "Saving…", "Edited" (published a few seconds after editing stops) or "Not in your
 * folder yet". Click it for what that means and Save Now, or Save As for a read-only show.
 */
export default function WorkingCopySaveStatus({
    status,
}: {
    status: WorkingCopyStatus;
}) {
    const { t } = useTolgee(["language"]);
    const kind = kindOf(status);
    const name = fileNameOf(status.showPath);
    const Icon = {
        saved: CheckCircleIcon,
        pending: ClockIcon,
        saving: CircleNotchIcon,
        problem: WarningCircleIcon,
    }[kind];
    const short = t(`workingCopy.status.${kind}`);
    const detail =
        status.state === "readOnly"
            ? t("workingCopy.detail.readOnly", { name })
            : status.state === "conflict"
              ? t("workingCopy.detail.conflict", { name })
              : status.state === "deferred"
                ? status.syncService
                    ? t("workingCopy.detail.deferredSync", {
                          name,
                          service: status.syncService,
                      })
                    : t("workingCopy.detail.deferred", { name })
                : kind === "saved"
                  ? t("workingCopy.detail.saved", { name })
                  : t("workingCopy.detail.pending", { name });

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    data-testid="working-copy-state"
                    data-state={status.state}
                    aria-label={short}
                    className={clsx(
                        "titlebar-button hover:bg-fg-1 rounded-6 touch:min-h-44 flex min-w-0 items-center gap-6 px-6 py-2 text-left",
                        kind === "problem" && "text-red",
                    )}
                >
                    <Icon
                        size={18}
                        className={clsx(
                            "shrink-0",
                            kind === "saving" && "animate-spin",
                            kind === "saved" && "text-green",
                            kind === "pending" && "text-text-subtitle",
                        )}
                    />
                    {/* Words where there's room; the icon alone otherwise */}
                    <span className="text-sub hidden truncate md:inline">
                        {short}
                    </span>
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    align="end"
                    sideOffset={8}
                    aria-label={t("workingCopy.detailsLabel")}
                    className="rounded-6 border-stroke bg-bg-1 text-text shadow-modal z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-12 border p-16 font-sans"
                >
                    <p className="text-body flex items-center gap-8 font-medium">
                        <Icon size={18} className="shrink-0" />
                        {short}
                    </p>
                    <p
                        className={clsx(
                            "text-sub",
                            kind === "problem"
                                ? "text-red"
                                : "text-text-subtitle",
                        )}
                    >
                        {detail}
                    </p>
                    <div className="flex flex-wrap gap-8">
                        {status.state === "readOnly" ? (
                            <Popover.Close asChild>
                                <Button
                                    className="touch:h-44 gap-6"
                                    onClick={() =>
                                        void window.electron.workingCopy.saveAs()
                                    }
                                >
                                    <FloppyDiskIcon size={16} />
                                    {t("workingCopy.saveAs")}
                                </Button>
                            </Popover.Close>
                        ) : (
                            status.state !== "conflict" && (
                                <Popover.Close asChild>
                                    <Button
                                        className="touch:h-44 gap-6"
                                        disabled={kind === "saved"}
                                        title={
                                            kind === "saved"
                                                ? t("workingCopy.nothingToSave")
                                                : undefined
                                        }
                                        onClick={() =>
                                            void window.electron.workingCopy.saveNow()
                                        }
                                    >
                                        <FloppyDiskIcon size={16} />
                                        {t("workingCopy.saveNow")}
                                    </Button>
                                </Popover.Close>
                            )
                        )}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
