import { Button, Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { Description as DialogDescription } from "@radix-ui/react-dialog";
import { useTolgee } from "@tolgee/react";
import { toast } from "sonner";
import { useWebLibraryStore } from "@/stores/WebLibraryStore";
import { formatAgo, type VersionReason } from "@/utilities/webLibrary";
import { restoreVersion } from "./webLibraryActions";

const REASON_KEYS: Record<VersionReason, string> = {
    edit: "web.versionReason.edit",
    opened: "web.versionReason.opened",
    "before-restore": "web.versionReason.beforeRestore",
};

/**
 * The versions the library keeps of one show, newest first, each with
 * Restore. Opened from the show list or the title bar's save status.
 */
export default function WebVersionsDialog() {
    const { t, getLanguage } = useTolgee(["language"]);
    const versionsFor = useWebLibraryStore((state) => state.versionsFor);
    const show = useWebLibraryStore((state) =>
        state.library?.shows.find((entry) => entry.id === state.versionsFor),
    );
    const set = useWebLibraryStore((state) => state.set);
    const close = () => set({ versionsFor: null });
    const locale = getLanguage() ?? "en";
    const now = Date.now();
    const versions = [...(show?.versions ?? [])].reverse();
    const when = (at: number) =>
        `${new Date(at).toLocaleString(locale, {
            dateStyle: "medium",
            timeStyle: "short",
        })} (${formatAgo(at, now, locale)})`;

    return (
        <Dialog
            open={versionsFor !== null && !!show}
            onOpenChange={(open) => !open && close()}
        >
            <DialogContent className="w-[34rem]">
                <DialogTitle>
                    {t("web.versionsTitle", { name: show?.name ?? "" })}
                </DialogTitle>
                <DialogDescription className="text-sub text-text-subtitle">
                    {t("web.versionsDescription")}
                </DialogDescription>
                {versions.length === 0 ? (
                    <p className="text-body text-text-subtitle">
                        {t("web.versionsEmpty")}
                    </p>
                ) : (
                    <ul
                        className="flex flex-col gap-4"
                        data-testid="web-versions"
                    >
                        {versions.map((version) => (
                            <li
                                key={version.id}
                                className="rounded-6 border-stroke flex items-center justify-between gap-12 border px-12 py-6"
                            >
                                <span className="flex min-w-0 flex-col">
                                    <span className="text-body">
                                        {when(version.at)}
                                    </span>
                                    <span className="text-sub text-text-subtitle">
                                        {t(REASON_KEYS[version.reason])}
                                    </span>
                                </span>
                                <Button
                                    variant="secondary"
                                    size="compact"
                                    className="touch:h-44 shrink-0 px-12"
                                    onClick={async () => {
                                        if (!show) return;
                                        close();
                                        const wasOpen = await restoreVersion(
                                            show.id,
                                            version.id,
                                        );
                                        // The page reloads into an open show.
                                        if (!wasOpen)
                                            toast.success(
                                                t("web.restored", {
                                                    when: when(version.at),
                                                }),
                                            );
                                    }}
                                >
                                    {t("web.restore")}
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="flex justify-end">
                    <Button variant="secondary" onClick={close}>
                        {t("web.close")}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
