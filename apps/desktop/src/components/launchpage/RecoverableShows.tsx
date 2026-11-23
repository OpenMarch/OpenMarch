import { useCallback, useEffect, useState } from "react";
import { T, useTolgee } from "@tolgee/react";
import { toast } from "sonner";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { Button } from "@openmarch/ui";
import type { RecoverableShow } from "@om-electron/database/workingCopy/WorkingCopySession";
import { fileNameOf } from "@/hooks/useWorkingCopyStatus";

/** The folder part of a path, on any platform. */
function folderOf(filePath: string): string {
    const parts = filePath.split(/[/\\]/);
    return parts.length > 1 ? parts.slice(0, -1).join("/") || "/" : "";
}

/**
 * Lists unsaved changes a crash left in working copies (ADR 0018) and
 * lets the user recover or discard each one.
 */
export default function RecoverableShows({
    onRecovered,
}: {
    onRecovered: () => void;
}) {
    const { t } = useTolgee(["language"]);
    const [shows, setShows] = useState<RecoverableShow[]>([]);
    const [busyId, setBusyId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            setShows(await window.electron.workingCopy.listRecoverable());
        } catch {
            setShows([]);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    if (shows.length === 0) return null;

    const recover = async (id: string) => {
        setBusyId(id);
        try {
            const resCode = await window.electron.workingCopy.recover(id);
            if (resCode === 200) onRecovered();
            else
                toast.error(
                    t("workingCopy.recovery.error", { error: String(resCode) }),
                );
        } catch (error) {
            toast.error(
                t("workingCopy.recovery.error", { error: String(error) }),
            );
        } finally {
            setBusyId(null);
            void refresh();
        }
    };

    const discard = async (id: string) => {
        setBusyId(id);
        try {
            await window.electron.workingCopy.discard(id);
        } finally {
            setBusyId(null);
            void refresh();
        }
    };

    return (
        <section
            className="bg-fg-1 border-yellow rounded-6 mx-8 flex flex-col gap-8 border p-12"
            data-testid="recoverable-shows"
        >
            <div className="flex items-center gap-8">
                <ClockCounterClockwiseIcon size={20} className="text-yellow" />
                <p className="text-body">
                    <T keyName="workingCopy.recovery.title" />
                </p>
            </div>
            <p className="text-sub text-text-subtitle">
                <T keyName="workingCopy.recovery.description" />
            </p>
            {shows.map((show) => (
                <div
                    key={show.id}
                    className="flex items-center justify-between gap-12"
                >
                    <div className="flex min-w-0 flex-col">
                        <p className="text-body truncate" title={show.showPath}>
                            {fileNameOf(show.showPath)}
                        </p>
                        <p
                            className="text-sub text-text-subtitle truncate"
                            title={show.showPath}
                        >
                            {[
                                show.lastEditAt
                                    ? t("workingCopy.recovery.lastEdited", {
                                          time: new Date(
                                              show.lastEditAt,
                                          ).toLocaleString(),
                                      })
                                    : null,
                                // The folder tells apart two shows with the same name.
                                folderOf(show.showPath),
                                show.showExists
                                    ? null
                                    : t("workingCopy.recovery.missing"),
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                    </div>
                    <div className="flex gap-8">
                        <Button
                            size="compact"
                            variant="secondary"
                            disabled={busyId !== null}
                            onClick={() => void discard(show.id)}
                        >
                            <T keyName="workingCopy.recovery.discard" />
                        </Button>
                        <Button
                            size="compact"
                            disabled={busyId !== null}
                            onClick={() => void recover(show.id)}
                        >
                            <T keyName="workingCopy.recovery.recover" />
                        </Button>
                    </div>
                </div>
            ))}
        </section>
    );
}
