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
import { scrollLeftForPage } from "./pageScroll";
import { useInputModeStore } from "@/stores/InputModeStore";
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
            // Manual selection: smooth scroll to show the page with an edge.
            // With fingers, a page already in view stays put, so the next tap
            // at the same spot lands on the same page.
            const containerRect = container.getBoundingClientRect();
            const elementRect = selectedPageElement.getBoundingClientRect();
            const target = scrollLeftForPage({
                pageLeft:
                    elementRect.left -
                    containerRect.left +
                    container.scrollLeft,
                pageWidth: elementRect.width,
                viewWidth: container.clientWidth,
                scrollLeft: container.scrollLeft,
                keepIfVisible: useInputModeStore.getState().mode === "touch",
            });
            if (target !== null) {
                container.style.scrollBehavior = "smooth";
                container.scrollLeft = target;
            }
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
            {/* The panel: the scrolling timeline, then its zoom buttons in their own column */}
            <div className="rounded-6 border-stroke bg-fg-1 @container flex h-full w-full min-w-0 border">
                <div
                    ref={timelineRef}
                    id="timeline"
                    className="relative flex h-full w-full min-w-0 touch-pan-x overflow-x-auto overflow-y-hidden p-8 transition-all duration-200"
                >
                    <div className="flex h-full min-h-0 w-fit flex-col justify-center gap-8">
                        <div className="flex h-fit items-center">
                            <div>
                                <p className={LABEL_COLUMN_CLASS}>
                                    <span className="@max-[360px]:hidden">
                                        <T keyName="timeline.pages" />
                                    </span>
                                </p>
                            </div>
                            <PageTimeline />
                        </div>

                        <div className={"flex items-center"}>
                            {!isFullscreen && (
                                <div
                                    className={clsx(
                                        LABEL_COLUMN_CLASS,
                                        "touch:items-center flex gap-6",
                                    )}
                                >
                                    <p className="text-sub @max-[360px]:hidden">
                                        <T keyName="timeline.audio" />
                                    </p>
                                    {uiSettings.focussedComponent !==
                                    "timeline" ? (
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
                </div>
                <TimelineZoomControls />
            </div>
        </div>
    );
}

/**
 * The "Pages"/"Audio" label column. Both rows use it so page 1 and the
 * waveform start at the same x. In a narrow panel the words go and only
 * room for the edit button stays.
 */
const LABEL_COLUMN_CLASS =
    "text-sub touch:w-[6.5rem] @max-[360px]:touch:w-[2.75rem] @max-[360px]:w-[1.5rem] w-[4rem] shrink-0";

function TimelineZoomControls() {
    const { uiSettings, setPixelsPerSecond } = useUiSettingsStore();
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

    // A column at the panel's right edge: never over the waveform or other
    // panels, and vertical so it doesn't read as the field's zoom bar.
    return (
        <div
            className="border-stroke text-text touch:w-44 flex w-28 shrink-0 flex-col items-stretch border-l @max-[240px]:hidden"
            role="group"
            aria-label="Timeline zoom"
        >
            <button
                onClick={handleZoomIn}
                className="flex flex-1 items-center justify-center transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPixels >= TIMELINE_MAX_PX_PER_SEC}
                title="Zoom timeline in"
                aria-label="Zoom timeline in"
            >
                <PlusIcon size={14} weight="bold" className="touch:size-20" />
            </button>
            <button
                onClick={handleReset}
                className="border-stroke text-text touch:text-sub flex flex-1 items-center justify-center border-y font-mono text-[11px] transition-colors duration-150 hover:bg-white/20 disabled:cursor-not-allowed"
                disabled={currentPixels === TIMELINE_BASE_PX_PER_SEC}
                title="Reset timeline zoom"
            >
                {zoomPercent}%
            </button>
            <button
                onClick={handleZoomOut}
                className="flex flex-1 items-center justify-center transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPixels <= TIMELINE_MIN_PX_PER_SEC}
                title="Zoom timeline out"
                aria-label="Zoom timeline out"
            >
                <MinusIcon size={14} weight="bold" className="touch:size-20" />
            </button>
        </div>
    );
}
