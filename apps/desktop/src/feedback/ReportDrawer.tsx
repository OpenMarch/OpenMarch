import { useEffect, useRef, useState, type PointerEvent } from "react";
import { T, useTranslate } from "@tolgee/react";
import { BugBeetleIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@openmarch/ui";
import clsx from "clsx";
import { ReportBody } from "./ReportBody";
import { formatSeconds, type RecordingInProgress } from "./ReportForm";
import { clampDrawerWidth, useReportDrawerStore } from "./openReport";

/**
 * Where the drawer sits:
 * - `"overlay"`: floating over the right side of the app, which keeps its layout.
 * - `"sheet"`: the whole screen (touch on a narrow or portrait screen, where the Inspector is a drawer too).
 */
export type ReportDrawerPlacement = "overlay" | "sheet";

const ICON_BUTTON =
    "text-text-subtitle hover:text-text hover:bg-fg-1 rounded-6 focus-visible:ring-accent touch:size-44 flex size-32 items-center justify-center focus-visible:ring-1";

/**
 * "Report a bug or send feedback" (fork #801): a drawer over the app, on
 * desktop and on the web. It slides off to the right into a tab and back with
 * what's typed kept; the X closes it. While recording it slides away on its
 * own, so the editor can be used and recorded, and `ReportRecordingBar`
 * keeps the time and Stop.
 */
export default function ReportDrawer({
    placement,
}: {
    placement: ReportDrawerPlacement;
}) {
    const { t } = useTranslate();
    const panel = useRef<HTMLDivElement>(null);
    const { open, collapsed, width, recording } = useReportDrawerStore();
    const { close, setCollapsed, setRecording } = useReportDrawerStore();

    // The form stays mounted while tucked away or recording, so what's typed is kept
    const mounted = open || recording !== null;
    const showing = open && !collapsed && recording === null;

    useEffect(() => {
        if (showing) panel.current?.focus();
    }, [showing]);

    if (!mounted) return null;

    const tab = open && collapsed && recording === null && (
        <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label={t("feedback.drawer.show")}
            title={t("feedback.drawer.show")}
            className="border-stroke bg-bg-1 text-text hover:text-accent focus-visible:outline-accent touch:w-44 touch:h-88 rounded-l-8 fixed top-1/2 right-0 z-50 flex h-56 w-24 -translate-y-1/2 items-center justify-center border border-r-0 shadow-sm transition-colors"
        >
            <BugBeetleIcon size={16} />
        </button>
    );

    return (
        <>
            {tab}
            <aside
                ref={panel}
                role="dialog"
                aria-modal={placement === "sheet"}
                aria-label={t("feedback.window.title")}
                tabIndex={-1}
                // Slides off to the right when tucked away or recording
                inert={!showing}
                aria-hidden={!showing}
                // Keys typed here are for the form, not the app's shortcuts behind it
                onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape" && !event.defaultPrevented)
                        setCollapsed(true);
                }}
                style={placement === "sheet" ? undefined : { width }}
                className={clsx(
                    "text-text bg-bg-1 fixed z-50 flex min-h-0 flex-col overflow-hidden font-sans outline-hidden transition-[translate,visibility] duration-200 ease-out motion-reduce:transition-none",
                    !showing && "invisible translate-x-[calc(100%+2rem)]",
                    placement === "overlay" &&
                        // Below the title bar, so its window controls stay usable
                        "rounded-6 border-stroke top-48 right-16 bottom-16 max-w-[calc(100vw-2rem)] border shadow-xl",
                    placement === "sheet" && "app-frame inset-0",
                )}
            >
                {placement !== "sheet" && <ResizeHandle />}
                {/* The form names itself; these only tuck it away or close it */}
                <div className="absolute top-8 right-8 z-10 flex gap-4">
                    <button
                        type="button"
                        aria-label={t("feedback.drawer.hide")}
                        title={t("feedback.drawer.hide")}
                        onClick={() => setCollapsed(true)}
                        className={ICON_BUTTON}
                    >
                        <CaretRightIcon size={18} />
                    </button>
                    <button
                        type="button"
                        aria-label={t("feedback.close")}
                        title={t("feedback.close")}
                        onClick={close}
                        className={ICON_BUTTON}
                    >
                        <XIcon size={20} />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <ReportBody onRecordingChange={setRecording} />
                </div>
            </aside>
        </>
    );
}

/** The drawer's left edge: drag to make it wider or narrower. */
function ResizeHandle() {
    const { t } = useTranslate();
    const { width, setWidth } = useReportDrawerStore();
    const [drag, setDrag] = useState<{ x: number; width: number } | null>(null);
    const live = useRef(width);

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ x: event.clientX, width });
    };
    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!drag) return;
        live.current = clampDrawerWidth(
            drag.width + drag.x - event.clientX,
            window.innerWidth,
        );
        useReportDrawerStore.setState({ width: live.current });
    };
    const onPointerUp = () => {
        if (!drag) return;
        setDrag(null);
        setWidth(live.current);
    };

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("feedback.drawer.resize")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={clsx(
                "hover:bg-accent/40 absolute inset-y-0 left-0 z-20 w-6 cursor-col-resize touch-none transition-colors",
                drag && "bg-accent/40",
            )}
        />
    );
}

/** While recording: the time, and Stop, which brings the report back. */
export function ReportRecordingBar() {
    const recording = useReportDrawerStore((s) => s.recording);
    return recording ? <RecordingBar recording={recording} /> : null;
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
