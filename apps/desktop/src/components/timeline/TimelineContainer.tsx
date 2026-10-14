import { useEffect, useRef } from "react";
import { XIcon, PlusIcon, MinusIcon } from "@phosphor-icons/react";
import { defaultSettings, useUiSettingsStore } from "@/stores/UiSettingsStore";
import AudioPlayer from "./audio/AudioPlayer";
import ActionButton from "@/shortcuts/ActionButton";
import EditableAudioPlayer from "./audio/EditableAudioPlayer";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import TimelineModePanel from "./TimelineModePanel";
import { T } from "@tolgee/react";
import clsx from "clsx";
import { TOAST_BOTTOM_VAR } from "@/components/ui/Toaster";

/**
 * Keeps toasts 8px above `ref`'s top while it is mounted (`TOAST_BOTTOM_VAR`): in their usual
 * corner they would cover the timeline's right end, where **+** is at the show's end, and a toast
 * holds still while the pointer is over it.
 */
function useToastsAbove(ref: React.RefObject<HTMLElement | null>) {
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const root = document.documentElement;
        const place = () =>
            root.style.setProperty(
                TOAST_BOTTOM_VAR,
                `${Math.max(0, window.innerHeight - element.getBoundingClientRect().top) + 8}px`,
            );
        place();
        const observer =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(place);
        observer?.observe(element);
        window.addEventListener("resize", place);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", place);
            root.style.removeProperty(TOAST_BOTTOM_VAR);
        };
    }, [ref]);
}

export default function TimelineContainer() {
    const focussedComponent = useUiSettingsStore(
        (s) => s.uiSettings.focussedComponent,
    );

    // The timeline draws its own waveform lane, so the audio player stays mounted headless: it
    // runs playback and the timeline reads its clock.
    if (focussedComponent !== "timeline") return <TimelineModeContainer />;

    // Editing beats (the focused timeline): the beat and measure editor on the audio waveform
    return (
        <div className="flex gap-8">
            <div
                id="timeline"
                className="rounded-6 border-stroke bg-fg-1 relative flex h-full w-full min-w-0 overflow-x-auto overflow-y-hidden border p-8 transition-all duration-200"
            >
                <div className="flex h-full min-h-0 w-fit flex-col justify-center gap-8">
                    <div className={"flex items-center"}>
                        <div className="flex w-[4rem] gap-6">
                            <p className="text-sub">
                                <T keyName="timeline.audio" />
                            </p>
                            <ActionButton
                                action="focusCanvas"
                                className="w-fit"
                            >
                                <XIcon />
                            </ActionButton>
                        </div>
                        <EditableAudioPlayer />
                    </div>
                </div>
                <TimelineZoomControls />
            </div>
        </div>
    );
}

const TIMELINE_MIN_PX_PER_SEC = 10;
const TIMELINE_MAX_PX_PER_SEC = 200;
const TIMELINE_BASE_PX_PER_SEC = defaultSettings.timelinePixelsPerSecond;

function TimelineZoomControls() {
    const setPixelsPerSecond = useUiSettingsStore((s) => s.setPixelsPerSecond);
    const currentPixels = useUiSettingsStore(
        (s) => s.uiSettings.timelinePixelsPerSecond,
    );
    const { isFullscreen } = useFullscreenStore();
    const zoomPercent = Math.round(
        (currentPixels / TIMELINE_BASE_PX_PER_SEC) * 100,
    );

    const handleZoomOut = () => {
        if (currentPixels <= TIMELINE_MIN_PX_PER_SEC) return;
        const nextValue = Math.max(
            currentPixels * 0.8,
            TIMELINE_MIN_PX_PER_SEC,
        );
        setPixelsPerSecond(nextValue);
    };

    const handleZoomIn = () => {
        if (currentPixels >= TIMELINE_MAX_PX_PER_SEC) return;
        const nextValue = Math.min(
            currentPixels * 1.2,
            TIMELINE_MAX_PX_PER_SEC,
        );
        setPixelsPerSecond(nextValue);
    };

    const handleReset = () => {
        if (currentPixels === TIMELINE_BASE_PX_PER_SEC) return;
        setPixelsPerSecond(TIMELINE_BASE_PX_PER_SEC);
    };

    return (
        <div
            className={clsx(
                { "right-290": !isFullscreen },
                "border-stroke bg-modal fixed right-16 bottom-16 z-50 flex w-96 items-stretch justify-between overflow-hidden rounded-lg border shadow-lg",
            )}
        >
            <button
                onClick={handleZoomOut}
                className="border-stroke text-text flex w-full items-center justify-center border-l p-2 transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPixels <= TIMELINE_MIN_PX_PER_SEC}
                title="Zoom out"
            >
                <MinusIcon size={14} weight="bold" />
            </button>
            <button
                onClick={handleReset}
                className="border-stroke bg-fg-2 text-text text-sub flex h-full w-full items-center justify-center border-r border-l px-3 py-2 font-mono transition-colors duration-150 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPixels === TIMELINE_BASE_PX_PER_SEC}
                title="Reset timeline zoom"
            >
                {zoomPercent}%
            </button>
            <button
                onClick={handleZoomIn}
                className="border-stroke text-text flex w-full items-center justify-center border-l p-2 transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPixels >= TIMELINE_MAX_PX_PER_SEC}
                title="Zoom in"
            >
                <PlusIcon size={14} weight="bold" />
            </button>
        </div>
    );
}

/**
 * The timeline with the audio player beside it, and toasts kept above it (`useToastsAbove`).
 * UI-12: perspective and fullscreen live on the field's zoom widget.
 */
function TimelineModeContainer() {
    const ref = useRef<HTMLDivElement>(null);
    useToastsAbove(ref);
    return (
        <div
            ref={ref}
            className="flex min-h-0 flex-1 gap-8"
            data-testid="timeline-mode-container"
        >
            <TimelineModePanel />
            <AudioPlayer />
        </div>
    );
}
