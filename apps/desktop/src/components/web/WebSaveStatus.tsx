import { useEffect, useRef } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
    CheckCircleIcon,
    CircleNotchIcon,
    ClockCounterClockwiseIcon,
    ExportIcon,
    WarningCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@openmarch/ui";
import { useTolgee } from "@tolgee/react";
import { toast } from "sonner";
import clsx from "clsx";
import { useOpenShowEntry, useWebLibraryStore } from "@/stores/WebLibraryStore";
import { backupReminderDue, formatAgo } from "@/utilities/webLibrary";
import { backUp, onIpad } from "./webLibraryActions";

const REMINDER_KEY = "openmarch-web:lastBackupReminder";

/** Also kept here, for a browser that can't keep it in localStorage. */
let remindedAt: number | null = null;

function lastReminderAt(): number | null {
    let stored: number | null = null;
    try {
        const value = Number(localStorage.getItem(REMINDER_KEY));
        stored = Number.isFinite(value) && value > 0 ? value : null;
    } catch {
        // Blocked storage: the page's own memory still counts.
    }
    return Math.max(stored ?? 0, remindedAt ?? 0) || null;
}

function rememberReminder(at: number) {
    remindedAt = at;
    try {
        localStorage.setItem(REMINDER_KEY, String(at));
    } catch {
        // Kept in memory for this visit.
    }
}

/**
 * The web editor's save status in the title bar: "Saved on this iPad",
 * "Saving…" or what went wrong, and when the show was last backed up. Tap
 * it for Back up and Versions. Also reminds, at most once a day, to back up
 * a show with changes from several days of editing.
 */
export default function WebSaveStatus() {
    const { t, getLanguage } = useTolgee(["language"]);
    const locale = getLanguage() ?? "en";
    const storage = useWebLibraryStore((state) => state.storage);
    const saveStatus = useWebLibraryStore((state) => state.saveStatus);
    const persisted = useWebLibraryStore((state) => state.persisted);
    const set = useWebLibraryStore((state) => state.set);
    const show = useOpenShowEntry();

    // Gentle backup reminder: decided from stable values, so a save (which
    // replaces the show's entry) doesn't run it again.
    const due = !!show && backupReminderDue(show, Date.now(), lastReminderAt());
    const showId = show?.id ?? null;
    const latest = useRef(show);
    latest.current = show;
    useEffect(() => {
        const current = latest.current;
        if (!due || !current) return;
        const now = Date.now();
        rememberReminder(now);
        toast.info(t("web.backupReminder", { name: current.name }), {
            duration: 15_000,
            action: {
                label: t("web.backUp"),
                onClick: () => void backUp(t, current.name, current.id),
            },
        });
    }, [showId, due, t]);

    const memoryOnly = storage?.kind === "memory";
    const failed = saveStatus?.state === "error";
    const saving = saveStatus?.state === "saving";
    const Icon =
        memoryOnly || failed
            ? WarningCircleIcon
            : saving
              ? CircleNotchIcon
              : CheckCircleIcon;
    const short = memoryOnly
        ? t("web.notKept")
        : failed
          ? t("web.notSaved")
          : saving
            ? t("web.saving")
            : t(onIpad ? "web.savedOnIpad" : "web.savedInBrowser");
    const detail = memoryOnly
        ? t("web.memoryNote")
        : saveStatus?.state === "error"
          ? saveStatus.reason === "full"
              ? t("web.notSavedFull")
              : t("web.notSavedOther", { message: saveStatus.message })
          : null;
    const backup = !show
        ? null
        : show.backedUpAt === null
          ? t("web.neverBackedUp")
          : t("web.backedUpAgo", {
                ago: formatAgo(show.backedUpAt, Date.now(), locale),
            });

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    data-testid="web-save-status"
                    aria-label={`${short}${backup ? `. ${backup}` : ""}`}
                    className={clsx(
                        "titlebar-button hover:bg-fg-1 rounded-6 touch:min-h-44 flex min-w-0 items-center gap-6 px-6 py-2 text-left",
                        (memoryOnly || failed) && "text-red",
                    )}
                >
                    <Icon
                        size={18}
                        className={clsx(
                            "shrink-0",
                            saving && "animate-spin",
                            !memoryOnly && !failed && !saving && "text-green",
                        )}
                    />
                    {/* Words where there's room; the icon alone otherwise */}
                    <span className="hidden min-w-0 flex-col leading-tight md:flex">
                        <span className="text-sub truncate">{short}</span>
                        {backup && (
                            <span
                                className={clsx(
                                    "text-sub truncate",
                                    show?.changedSinceBackup
                                        ? "text-text"
                                        : "text-text-subtitle",
                                )}
                            >
                                {backup}
                            </span>
                        )}
                    </span>
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    align="end"
                    sideOffset={8}
                    aria-label={t("web.statusDetailsLabel")}
                    className="rounded-6 border-stroke bg-bg-1 text-text shadow-modal z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-12 border p-16 font-sans"
                >
                    <div className="flex flex-col gap-4">
                        <p className="text-body flex items-center gap-8 font-medium">
                            <Icon size={18} className="shrink-0" />
                            {short}
                        </p>
                        {backup && (
                            <p className="text-body text-text-subtitle">
                                {backup}
                            </p>
                        )}
                    </div>
                    {detail && <p className="text-sub text-red">{detail}</p>}
                    {!memoryOnly && (
                        <p className="text-sub text-text-subtitle">
                            {t("web.keptHereNote")}{" "}
                            {persisted
                                ? t("web.persistedNote")
                                : t("web.notPersistedNote")}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-8">
                        <Popover.Close asChild>
                            <Button
                                className="touch:h-44 gap-6"
                                onClick={() =>
                                    void backUp(
                                        t,
                                        show?.name ?? "",
                                        show?.id ?? null,
                                    )
                                }
                            >
                                <ExportIcon size={16} />
                                {t("web.backUpNow")}
                            </Button>
                        </Popover.Close>
                        {show && (
                            <Popover.Close asChild>
                                <Button
                                    variant="secondary"
                                    className="touch:h-44 gap-6"
                                    onClick={() =>
                                        set({ versionsFor: show.id })
                                    }
                                >
                                    <ClockCounterClockwiseIcon size={16} />
                                    {t("web.versionsMenu")}
                                </Button>
                            </Popover.Close>
                        )}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
