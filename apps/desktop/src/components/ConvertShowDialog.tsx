import { useCallback, useEffect, useRef, useState } from "react";
import { Title as RadixAlertDialogTitle } from "@radix-ui/react-alert-dialog";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
} from "@openmarch/ui";
import { T } from "@tolgee/react";
import type { PendingConversion } from "@om-electron/database/convertOnOpenGate";
import type { ConvertProgress } from "@om-electron/database/convertOnOpenProtocol";

/** What the conversion has done so far, as a status line and a bar fraction (undefined: busy). */
function ProgressLine({ progress }: { progress: ConvertProgress | null }) {
    const fraction =
        progress?.phase === "convert" && progress.pagesTotal > 0
            ? progress.pagesDone / progress.pagesTotal
            : undefined;
    return (
        <div
            className="flex flex-col gap-8"
            data-testid="convert-show-progress"
        >
            <span className="text-sub text-text/75">
                {progress?.phase === "convert" ? (
                    <T
                        keyName="convertShow.progress.converting"
                        params={{
                            done: progress.pagesDone,
                            total: progress.pagesTotal,
                        }}
                    />
                ) : (
                    <T keyName="convertShow.progress.backingUp" />
                )}
            </span>
            <div className="bg-fg-2 relative h-8 w-full overflow-hidden rounded-full">
                <div
                    className={
                        fraction === undefined
                            ? "bg-accent absolute top-0 left-0 h-full w-1/3 animate-pulse rounded-full"
                            : "bg-accent absolute top-0 left-0 h-full rounded-full transition-all duration-200 ease-out"
                    }
                    style={
                        fraction === undefined
                            ? undefined
                            : { width: `${Math.round(fraction * 100)}%` }
                    }
                />
            </div>
        </div>
    );
}

/**
 * Asks the person before a page-era show is converted to timelines (ADR 0001 §6). The main
 * process holds the file as the pending conversion and opens nothing until the person confirms;
 * this dialog reads it when the window loads and follows its changes, so it asks over the show
 * that is open (or the launch page). Confirm closes that show, backs the file up as
 * `<name>.pre-conversion.dots` next to it, converts it and opens it; the window reloads when the
 * open ends. Cancel forgets the file without writing to it and leaves the open show as it was.
 * Opening another file or closing the show forgets the question, and the dialog closes.
 */
export default function ConvertShowDialog() {
    const [pending, setPending] = useState<PendingConversion | null>(null);
    const [converting, setConverting] = useState(false);
    const [progress, setProgress] = useState<ConvertProgress | null>(null);
    const convertingRef = useRef(false);
    convertingRef.current = converting;

    useEffect(() => {
        let cancelled = false;
        // Asked (or forgotten) while the window is up. The dialog's own Confirm sends no notice;
        // while it converts, it stays to show the progress.
        const unsubscribe = window.electron.onPendingConversion((next) => {
            // Newer than the first read, which must not overwrite it.
            cancelled = true;
            if (!convertingRef.current) setPending(next);
        });
        window.electron
            .getPendingConversion()
            .then((next) => {
                if (!cancelled) setPending(next);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!converting) return;
        return window.electron.onConversionProgress(setProgress);
    }, [converting]);

    const cancel = useCallback(() => {
        if (converting) return;
        setPending(null);
        void window.electron.cancelConversion();
    }, [converting]);

    const confirm = useCallback(() => {
        setConverting(true);
        setProgress(null);
        // The main process reloads the window when the open ends, opened or not; failures get a
        // dialog there. Close this one in case the window stays.
        void window.electron.confirmConversion().finally(() => {
            setConverting(false);
            setPending(null);
        });
    }, []);

    if (!pending) return null;

    return (
        <AlertDialog
            open
            onOpenChange={(open) => {
                if (!open) cancel();
            }}
        >
            <AlertDialogContent
                className="max-w-[32rem]"
                data-testid="convert-show-dialog"
                onEscapeKeyDown={(event) => {
                    if (converting) event.preventDefault();
                }}
            >
                {converting ? (
                    <>
                        <RadixAlertDialogTitle className="text-h4 text-text leading-none">
                            <T
                                keyName="convertShow.convertingTitle"
                                params={{ fileName: pending.fileName }}
                            />
                        </RadixAlertDialogTitle>
                        <AlertDialogDescription>
                            <ProgressLine progress={progress} />
                        </AlertDialogDescription>
                    </>
                ) : (
                    <>
                        <AlertDialogTitle>
                            <T keyName="convertShow.title" />
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            <div className="flex flex-col gap-12">
                                <p>
                                    <T
                                        keyName="convertShow.description"
                                        params={{ fileName: pending.fileName }}
                                    />
                                </p>
                                <p>
                                    <T keyName="convertShow.backupIntro" />
                                </p>
                                <div className="rounded-6 border-stroke bg-fg-1 flex flex-col gap-4 border px-12 py-8">
                                    <span
                                        className="text-body font-mono break-all"
                                        data-testid="convert-show-backup-name"
                                    >
                                        {pending.backupFileName}
                                    </span>
                                    <span className="text-sub text-text/60 break-all">
                                        <T
                                            keyName="convertShow.backupFolder"
                                            params={{ folder: pending.folder }}
                                        />
                                    </span>
                                </div>
                                <p>
                                    <T keyName="convertShow.backupUse" />
                                </p>
                            </div>
                        </AlertDialogDescription>
                        <div className="flex justify-end gap-8">
                            <Button
                                variant="secondary"
                                size="compact"
                                onClick={cancel}
                                data-testid="convert-show-cancel"
                            >
                                <T keyName="convertShow.cancel" />
                            </Button>
                            <Button
                                variant="primary"
                                size="compact"
                                onClick={confirm}
                                data-testid="convert-show-confirm"
                            >
                                <T keyName="convertShow.confirm" />
                            </Button>
                        </div>
                    </>
                )}
            </AlertDialogContent>
        </AlertDialog>
    );
}
