import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useEffect, useRef } from "react";
import {
    XIcon,
    PencilSimpleIcon,
    PlusIcon,
    MinusIcon,
} from "@phosphor-icons/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjects } from "@/hooks";
import AudioPlayer from "./audio/AudioPlayer";
import ActionButton from "@/shortcuts/ActionButton";
import EditableAudioPlayer from "./audio/EditableAudioPlayer";
import TimelineControls from "./TimelineControls";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import PerspectiveSlider from "./PerspectiveSlider";
import PageTimeline from "./PageTimeline";
import { T } from "@tolgee/react";
import clsx from "clsx";
import { usePinchZoom } from "./usePinchZoom";
import { TOUCH_TARGET_CLASS } from "./touchTargets";
import {
    TIMELINE_BASE_PX_PER_SEC,
    TIMELINE_MAX_PX_PER_SEC,
    TIMELINE_MIN_PX_PER_SEC,
} from "./pinchZoom";

export default function TimelineContainer() {
    const { isPlaying } = useIsPlaying()!;
    const { measures } = useTimingObjects()!;
    const { selectedPage } = useSelectedPage()!;
    const { uiSettings } = useUiSettingsStore();
    const { isFullscreen } = useFullscreenStore();
    const timelineRef = useRef<HTMLDivElement>(null);
    usePinchZoom(timelineRef);

    useEffect(() => {
        if (!selectedPage) return;

        const container = timelineRef.current;
        const selectedPageElement = document.querySelector(
            `[timeline-page-id="${selectedPage.id}"]`,
        );

        if (!container || !selectedPageElement) return;

        if (isPlaying) {
            // During playback: Linear scroll animation
            container.style.scrollBehavior = "auto";
            const containerRect = container.getBoundingClientRect();
            const elementRect = selectedPageElement.getBoundingClientRect();

            const targetScroll =
                elementRect.left +
                container.scrollLeft -
                containerRect.left -
                (containerRect.width - elementRect.width) / 2;

            // Set the scroll directly without transition (animation handled by CSS)
            container.scrollLeft = targetScroll;
        } else {
            // Manual selection: Smooth scroll
            container.style.scrollBehavior = "smooth";
            selectedPageElement.scrollIntoView({
                block: "nearest",
                inline: "center",
            });
        }

        return () => {
            container.style.scrollBehavior = "smooth";
            container.style.transition = "";
        };
    }, [selectedPage, isPlaying]);

    // Rerender the timeline when the measures or pages change
    useEffect(() => {
        // do nothing, just re-render
    }, [measures]);

    return (
        <div className="flex gap-8">
            {uiSettings.focussedComponent !== "timeline" && (
                <TimelineControls />
            )}
            {isFullscreen && <PerspectiveSlider />}
            <div
                ref={timelineRef}
                id="timeline"
                className="rounded-6 border-stroke bg-fg-1 relative flex h-full w-full min-w-0 touch-pan-x overflow-x-auto overflow-y-hidden border p-8 transition-all duration-200"
            >
                <div className="flex h-full min-h-0 w-fit flex-col justify-center gap-8">
                    <div className="flex h-fit items-center">
                        <div>
                            <p className="text-sub touch:w-[6.5rem] w-[4rem]">
                                <T keyName="timeline.pages" />
                            </p>
                        </div>
                        <PageTimeline />
                    </div>

                    <div className={"flex items-center"}>
                        {!isFullscreen && (
                            <div className="touch:w-[6.5rem] touch:items-center flex w-[4rem] gap-6">
                                <p className="text-sub">
                                    <T keyName="timeline.audio" />
                                </p>
                                {uiSettings.focussedComponent !== "timeline" ? (
                                    <ActionButton
                                        action="focusTimeline"
                                        className={clsx(
                                            "w-fit",
                                            TOUCH_TARGET_CLASS,
                                        )}
                                    >
                                        <PencilSimpleIcon />
                                    </ActionButton>
                                ) : (
                                    <ActionButton
                                        action="focusCanvas"
                                        className={clsx(
                                            "w-fit",
                                            TOUCH_TARGET_CLASS,
                                        )}
                                    >
                                        <XIcon />
                                    </ActionButton>
                                )}
                            </div>
                        )}

                        {uiSettings.focussedComponent === "timeline" ? (
                            <EditableAudioPlayer />
                        ) : (
                            <div
                                style={{
                                    display: isFullscreen ? "none" : "flex",
                                }}
                            >
                                <AudioPlayer />
                            </div>
                        )}
                    </div>
                </div>
                <TimelineZoomControls />
            </div>
        </div>
    );
}

function TimelineZoomControls() {
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
                { "right-290": !isFullscreen },
                "border-stroke bg-modal touch:h-44 touch:w-160 fixed right-16 bottom-16 z-50 flex w-96 items-stretch justify-between overflow-hidden rounded-lg border shadow-lg",
            )}
        >
            <button
                onClick={handleZoomOut}
                className="border-stroke text-text flex w-full items-center justify-center border-l p-2 transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPixels <= TIMELINE_MIN_PX_PER_SEC}
                title="Zoom out"
            >
                <MinusIcon size={14} weight="bold" className="touch:size-20" />
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
                <PlusIcon size={14} weight="bold" className="touch:size-20" />
            </button>
        </div>
    );
}
