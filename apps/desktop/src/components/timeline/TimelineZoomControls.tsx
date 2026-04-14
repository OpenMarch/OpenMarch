import { useFullscreenStore } from "@/stores/FullscreenStore";
import { defaultSettings, useUiSettingsStore } from "@/stores/UiSettingsStore";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import clsx from "clsx";

const TIMELINE_MIN_PX_PER_SEC = 10;
const TIMELINE_MAX_PX_PER_SEC = 200;
const TIMELINE_BASE_PX_PER_SEC = defaultSettings.timelinePixelsPerSecond;

export default function TimelineZoomControls() {
    const { uiSettings, setPixelsPerSecond } = useUiSettingsStore();
    const { isFullscreen } = useFullscreenStore();
    const currentPixels = uiSettings.timelinePixelsPerSecond;
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
                { "absolute right-340 bottom-16": !isFullscreen },
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
