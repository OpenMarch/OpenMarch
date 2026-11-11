import { useCallback, useEffect, useRef, useState } from "react";
import { T, useTranslate } from "@tolgee/react";
import { XIcon } from "@phosphor-icons/react";
import { Button } from "@openmarch/ui";
import clsx from "clsx";
import { ReportBody } from "./ReportWindow";
import { formatSeconds, type RecordingInProgress } from "./ReportForm";
import { OPEN_REPORT_EVENT } from "./openReport";

/**
 * "Report a bug or send feedback" in the web editor (fork #801): a sheet
 * over the app, where the desktop app opens a window. While recording, the
 * sheet steps aside so the editor can be used and recorded, and a small bar
 * keeps the time and a Stop button; stopping brings the form back as it was.
 *
 * Not a Radix dialog: the form must stay mounted (what's typed is kept)
 * while hidden, and a mounted Radix dialog keeps the page behind it from
 * taking clicks.
 */
export default function WebReportSheet() {
    const { t } = useTranslate();
    const panel = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [recording, setRecording] = useState<RecordingInProgress | null>(
        null,
    );

    useEffect(() => {
        const onOpen = () => setOpen(true);
        window.addEventListener(OPEN_REPORT_EVENT, onOpen);
        return () => window.removeEventListener(OPEN_REPORT_EVENT, onOpen);
    }, []);

    const onRecordingChange = useCallback(
        (next: RecordingInProgress | null) => setRecording(next),
        [],
    );

    // The form stays mounted while recording, so what's typed is kept
    const mounted = open || recording !== null;
    const showing = open && recording === null;

    useEffect(() => {
        if (showing) panel.current?.focus();
    }, [showing]);

    if (!mounted) return null;

    return (
        <>
            {showing && (
                <div
                    aria-hidden
                    className="animate-fade-in fixed inset-0 z-50 bg-black/30"
                    onClick={() => setOpen(false)}
                />
            )}
            <div
                ref={panel}
                role="dialog"
                aria-modal={showing}
                aria-label={t("feedback.window.title")}
                tabIndex={-1}
                hidden={!showing}
                // Keys typed here are for the form, not the app's shortcuts behind it
                onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape" && !event.defaultPrevented)
                        setOpen(false);
                }}
                className={clsx(
                    "bg-bg-1 text-text rounded-6 border-stroke fixed inset-y-16 right-16 z-50 w-[min(40rem,calc(100vw-2rem))] flex-col overflow-hidden border font-sans shadow-xl outline-hidden",
                    showing ? "flex" : "hidden",
                )}
            >
                {/* The form names itself; the sheet only adds a way to close it */}
                <button
                    type="button"
                    aria-label={t("feedback.close")}
                    onClick={() => setOpen(false)}
                    className="text-text-subtitle hover:text-text hover:bg-fg-1 rounded-6 focus-visible:ring-accent touch:size-44 absolute top-8 right-8 z-10 flex size-32 items-center justify-center focus-visible:ring-1"
                >
                    <XIcon size={20} />
                </button>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <ReportBody onRecordingChange={onRecordingChange} />
                </div>
            </div>
            {recording && <RecordingBar recording={recording} />}
        </>
    );
}

function RecordingBar({ recording }: { recording: RecordingInProgress }) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(timer);
    }, []);
    const seconds = Math.max(0, Math.round((now - recording.startedAt) / 1000));
    return (
        <div
            role="status"
            className="bg-bg-1 text-text border-red fixed bottom-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-12 rounded-full border py-6 pr-6 pl-16 font-sans shadow-xl"
        >
            <span className="bg-red size-8 animate-pulse rounded-full" />
            <span className="text-body tabular-nums">
                <T
                    keyName="feedback.record.recording"
                    params={{ time: formatSeconds(seconds) }}
                />
            </span>
            <Button
                type="button"
                variant="red"
                size="compact"
                onClick={recording.stop}
            >
                <T keyName="feedback.record.stopAndReturn" />
            </Button>
        </div>
    );
}
