import { useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import {
    ClockCounterClockwiseIcon,
    CopyIcon,
    DotsThreeIcon,
    PencilSimpleIcon,
    ShareIcon,
    TrashIcon,
    WarningIcon,
} from "@phosphor-icons/react";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    Input,
} from "@openmarch/ui";
import { useTolgee } from "@tolgee/react";
import { toast } from "sonner";
import clsx from "clsx";
import { useWebLibraryStore } from "@/stores/WebLibraryStore";
import { formatAgo, type ShowSummary } from "@/utilities/webLibrary";
import {
    backUp,
    deleteStoredShow,
    duplicateStoredShow,
    onIpad,
    openStoredShow,
    renameStoredShow,
    reportFailure,
} from "./webLibraryActions";

const menuItemClass =
    "rounded-4 text-body data-[highlighted]:bg-fg-2 touch:min-h-44 flex cursor-pointer items-center gap-8 px-8 py-6 outline-hidden";

/** Re-renders every minute, so "5 minutes ago" stays true. */
function useNow(): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(timer);
    }, []);
    return now;
}

/**
 * The launch page's list of shows kept in this browser (the web editor's
 * stand-in for recent files): open, rename, duplicate, back up, see
 * versions, delete.
 */
export default function WebShowLibrary() {
    const { t, getLanguage } = useTolgee(["language"]);
    const storage = useWebLibraryStore((state) => state.storage);
    const library = useWebLibraryStore((state) => state.library);
    const openVersions = useWebLibraryStore((state) => state.set);
    const now = useNow();
    const [renaming, setRenaming] = useState<ShowSummary | null>(null);
    const [deleting, setDeleting] = useState<ShowSummary | null>(null);
    const locale = getLanguage() ?? "en";
    const failed = reportFailure(t);

    useEffect(() => {
        if (library?.openFailed)
            toast.error(
                t("web.library.openFailed", { name: library.openFailed }),
            );
    }, [library?.openFailed, t]);

    const shows = library?.shows ?? [];
    const ago = (at: number) => formatAgo(at, now, locale);

    return (
        <Tabs.Content
            value="files"
            className="flex w-full min-w-0 flex-col gap-12 overflow-y-auto p-6"
        >
            <header className="flex flex-col gap-4">
                <h2 className="text-h5">
                    {t(
                        onIpad
                            ? "web.library.titleIpad"
                            : "web.library.titleBrowser",
                    )}
                </h2>
                <p className="text-sub text-text-subtitle">
                    {t("web.keptHereNote")}
                </p>
            </header>

            {storage?.kind === "memory" && (
                <p
                    role="alert"
                    className="rounded-6 border-yellow bg-yellow/10 text-body flex items-start gap-8 border p-12"
                >
                    <WarningIcon size={20} className="text-yellow shrink-0" />
                    {t(
                        storage.problem === "other-tab"
                            ? "web.library.otherTab"
                            : storage.problem === "newer-format"
                              ? "web.library.newerFormat"
                              : "web.library.notKept",
                    )}
                </p>
            )}

            {storage?.kind === "opfs" && shows.length === 0 && (
                <p className="text-body text-text-subtitle py-24 text-center">
                    {t("web.library.empty")}
                </p>
            )}

            <ul className="flex flex-col gap-8" data-testid="web-show-library">
                {shows.map((show) => (
                    <li
                        key={show.id}
                        className="rounded-6 border-stroke bg-fg-2 flex min-w-0 items-center gap-8 border p-8 pl-12"
                    >
                        <button
                            type="button"
                            aria-label={t("web.library.open", {
                                name: show.name,
                            })}
                            onClick={() =>
                                openStoredShow(show.id).catch(failed)
                            }
                            className="hover:text-accent flex min-h-44 min-w-0 flex-1 flex-col items-start justify-center gap-2 text-left"
                        >
                            <span className="text-body w-full truncate font-medium">
                                {show.name}
                            </span>
                            <span className="text-sub text-text-subtitle">
                                {t("web.library.edited", {
                                    ago: ago(show.editedAt),
                                })}
                                {" · "}
                                <span
                                    className={clsx(
                                        // Changes that aren't anywhere else
                                        show.changedSinceBackup &&
                                            "text-text font-medium",
                                    )}
                                >
                                    {show.backedUpAt === null
                                        ? t("web.neverBackedUp")
                                        : t("web.library.backedUpAgo", {
                                              ago: ago(show.backedUpAt),
                                          })}
                                </span>
                            </span>
                        </button>
                        <Button
                            variant="secondary"
                            size="compact"
                            className="touch:h-44 shrink-0 gap-6 px-12"
                            onClick={() => void backUp(t, show.name, show.id)}
                        >
                            <ShareIcon size={16} />
                            {t("web.backUp")}
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    aria-label={t("web.library.more", {
                                        name: show.name,
                                    })}
                                    className="hover:text-accent rounded-6 hover:bg-fg-1 touch:size-44 flex size-32 shrink-0 items-center justify-center"
                                >
                                    <DotsThreeIcon size={20} weight="bold" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                sideOffset={4}
                                className="rounded-6 border-stroke bg-bg-1 text-text z-50 flex min-w-[200px] flex-col border p-4 shadow-lg"
                            >
                                <DropdownMenuItem
                                    className={menuItemClass}
                                    onSelect={() => setRenaming(show)}
                                >
                                    <PencilSimpleIcon size={16} />
                                    {t("web.library.rename")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className={menuItemClass}
                                    onSelect={() =>
                                        duplicateStoredShow(
                                            show.id,
                                            t("web.library.copyName", {
                                                name: show.name,
                                            }),
                                        ).catch(failed)
                                    }
                                >
                                    <CopyIcon size={16} />
                                    {t("web.library.duplicate")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className={menuItemClass}
                                    onSelect={() =>
                                        openVersions({ versionsFor: show.id })
                                    }
                                >
                                    <ClockCounterClockwiseIcon size={16} />
                                    {t("web.versionsMenu")}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-stroke my-4 h-px" />
                                <DropdownMenuItem
                                    className={clsx(menuItemClass, "text-red")}
                                    onSelect={() => setDeleting(show)}
                                >
                                    <TrashIcon size={16} />
                                    {t("web.library.delete")}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </li>
                ))}
            </ul>

            <RenameDialog show={renaming} onClose={() => setRenaming(null)} />

            <AlertDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
            >
                <AlertDialogContent>
                    <AlertDialogTitle>
                        {t("web.library.deleteTitle", {
                            name: deleting?.name ?? "",
                        })}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {t("web.library.deleteDescription")}
                    </AlertDialogDescription>
                    <div className="flex justify-end gap-8">
                        <AlertDialogCancel>
                            <Button variant="secondary">
                                {t("web.library.cancel")}
                            </Button>
                        </AlertDialogCancel>
                        <Button
                            variant="red"
                            onClick={() => {
                                if (deleting)
                                    deleteStoredShow(deleting.id).catch(failed);
                                setDeleting(null);
                            }}
                        >
                            {t("web.library.deleteConfirm")}
                        </Button>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </Tabs.Content>
    );
}

function RenameDialog({
    show,
    onClose,
}: {
    show: ShowSummary | null;
    onClose: () => void;
}) {
    const { t } = useTolgee(["language"]);
    const [name, setName] = useState("");
    useEffect(() => {
        if (show) setName(show.name);
    }, [show]);
    const save = () => {
        if (show && name.trim())
            renameStoredShow(show.id, name.trim()).catch(reportFailure(t));
        onClose();
    };
    return (
        <Dialog
            open={show !== null}
            onOpenChange={(open) => !open && onClose()}
        >
            <DialogContent className="w-[26rem]">
                <DialogTitle>{t("web.library.renameTitle")}</DialogTitle>
                <form
                    className="flex flex-col gap-16"
                    onSubmit={(event) => {
                        event.preventDefault();
                        save();
                    }}
                >
                    <label className="text-sub text-text-subtitle flex flex-col gap-4">
                        {t("web.library.nameLabel")}
                        <Input
                            autoFocus
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </label>
                    <div className="flex justify-end gap-8">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                        >
                            {t("web.library.cancel")}
                        </Button>
                        <Button type="submit" disabled={!name.trim()}>
                            {t("web.library.save")}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
