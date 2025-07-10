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
import { T, useTolgee } from "@tolgee/react";

export default function TimelineControls() {
    const { isFullscreen, toggleFullscreen } = useFullscreenStore();
    const { uiSettings } = useUiSettingsStore();

    return (
        <div
            className={clsx(
                "bg-fg-1 border-stroke rounded-6 flex flex-col gap-12 border px-16 py-12",
                { "justify-center": isFullscreen },
            )}
        >
            {!isFullscreen && (
                <p className="text-body text-text/60">
                    <T keyName="timeline.label" />
                </p>
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
                    <button
                        className="text-text enabled:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={toggleFullscreen}
                        disabled={uiSettings.focussedComponent === "timeline"}
                    >
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
                className="text-text enabled:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() =>
                    setPixelsPerSecond(uiSettings.timelinePixelsPerSecond * 0.8)
                }
                disabled={uiSettings.timelinePixelsPerSecond <= 10}
            >
                <MagnifyingGlassMinusIcon size={24} />
            </button>
            <button
                className="text-text enabled:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50"
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
    const { uiSettings } = useUiSettingsStore();
    const { t } = useTolgee();

    return (
        <div
            className={clsx("flex gap-12")}
            aria-label={t("timeline.controls.label")}
        >
            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.firstPage}
                disabled={
                    !selectedPage ||
                    selectedPage.previousPageId === null ||
                    isPlaying ||
                    uiSettings.focussedComponent === "timeline"
                }
            >
                <RewindIcon size={24} />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.previousPage}
                disabled={
                    !selectedPage ||
                    selectedPage.previousPageId === null ||
                    isPlaying ||
                    uiSettings.focussedComponent === "timeline"
                }
            >
                <SkipBackIcon size={24} />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.playPause}
                disabled={
                    !selectedPage ||
                    selectedPage.nextPageId === null ||
                    uiSettings.focussedComponent === "timeline"
                }
            >
                {isPlaying ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.nextPage}
                disabled={
                    !selectedPage ||
                    selectedPage.nextPageId === null ||
                    isPlaying ||
                    uiSettings.focussedComponent === "timeline"
                }
            >
                <SkipForwardIcon size={24} />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.lastPage}
                disabled={
                    !selectedPage ||
                    selectedPage.nextPageId === null ||
                    isPlaying ||
                    uiSettings.focussedComponent === "timeline"
                }
            >
                <FastForwardIcon size={24} />
            </RegisteredActionButton>
        </div>
    );
}
