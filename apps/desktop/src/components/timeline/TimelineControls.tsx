import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import {
    RewindIcon,
    SkipBackIcon,
    PlayIcon,
    PauseIcon,
    SkipForwardIcon,
    FastForwardIcon,
    MagnifyingGlassPlusIcon,
    MagnifyingGlassMinusIcon,
    CornersOutIcon,
    CornersInIcon,
} from "@phosphor-icons/react";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { clsx } from "clsx";

export default function TimelineControls() {
    const { isFullscreen, toggleFullscreen } = useFullscreenStore();

    return (
        <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-12 border px-16 py-12">
            {!isFullscreen && (
                <p className="text-body text-text/60">Timeline</p>
            )}
            <div
                className={clsx("flex gap-12", {
                    "flex-col": !isFullscreen,
                })}
            >
                <PlaybackControls />
                <div
                    className={clsx("flex gap-12", {
                        "justify-between": !isFullscreen,
                    })}
                >
                    <ZoomControls />
                    <button onClick={toggleFullscreen}>
                        {isFullscreen ? (
                            <CornersInIcon size={24} />
                        ) : (
                            <CornersOutIcon size={24} />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ZoomControls() {
    const { uiSettings, setPixelsPerSecond } = useUiSettingsStore();

    return (
        <div className="flex gap-10" id="zoomIcons">
            <button
                className="text-text active:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() =>
                    setPixelsPerSecond(uiSettings.timelinePixelsPerSecond * 0.8)
                }
                disabled={uiSettings.timelinePixelsPerSecond <= 10}
            >
                <MagnifyingGlassMinusIcon size={24} />
            </button>
            <button
                className="text-text active:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() =>
                    setPixelsPerSecond(uiSettings.timelinePixelsPerSecond * 1.2)
                }
                disabled={uiSettings.timelinePixelsPerSecond >= 200}
            >
                <MagnifyingGlassPlusIcon size={24} />
            </button>
        </div>
    );
}

function PlaybackControls() {
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;

    return (
        <div className="flex gap-12" aria-label="Playback Controls">
            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.firstPage}
                disabled={
                    !selectedPage ||
                    selectedPage.previousPageId === null ||
                    isPlaying
                }
            >
                <RewindIcon size={24} />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.previousPage}
                disabled={
                    !selectedPage ||
                    selectedPage.previousPageId === null ||
                    isPlaying
                }
            >
                <SkipBackIcon size={24} />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.playPause}
                disabled={!selectedPage || selectedPage.nextPageId === null}
            >
                {isPlaying ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.nextPage}
                disabled={
                    !selectedPage ||
                    selectedPage.nextPageId === null ||
                    isPlaying
                }
            >
                <SkipForwardIcon size={24} />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.lastPage}
                disabled={
                    !selectedPage ||
                    selectedPage.nextPageId === null ||
                    isPlaying
                }
            >
                <FastForwardIcon size={24} />
            </RegisteredActionButton>
        </div>
    );
}
