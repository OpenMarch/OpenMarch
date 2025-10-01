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
    MetronomeIcon,
} from "@phosphor-icons/react";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import { ActionButton } from "@/ui/components/ActionButton";
import { ActionId } from "@/actions/types";
import { useActionSystem } from "@/context/ActionSystemContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { clsx } from "clsx";
import { AudioClock } from "./Clock";
import { T, useTolgee } from "@tolgee/react";
import { useMetronomeStore } from "@/stores/MetronomeStore";

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
                <div className="flex items-center justify-between gap-6">
                    <T keyName="timeline.label" />
                    <AudioClock />
                </div>
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

                    {!isFullscreen && <div className="flex-1" />}
                    {!isFullscreen && <div className="flex-1" />}
                    {!isFullscreen && <div className="flex-1" />}

                    <TimelineMetronomeButton />

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

function TimelineMetronomeButton() {
    const isMetronomeOn = useMetronomeStore((s) => s.isMetronomeOn);
    const { registry, bus } = useActionSystem();

    return (
        <div className="flex gap-10" id="zoomIcons">
            <ActionButton
                id={ActionId.toggleMetronome}
                bus={bus}
                registry={registry}
                className={clsx(
                    "outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50",
                    {
                        "text-accent": isMetronomeOn,
                        "text-text enabled:hover:text-accent": !isMetronomeOn,
                    },
                )}
            >
                <MetronomeIcon size={24} />
            </ActionButton>
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
    const { registry, bus } = useActionSystem();

    return (
        <div
            className={clsx("flex gap-12")}
            aria-label={t("timeline.controls.label")}
        >
            <ActionButton
                id={ActionId.firstPage}
                bus={bus}
                registry={registry}
                className="text-text enabled:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <RewindIcon size={24} />
            </ActionButton>

            <ActionButton
                id={ActionId.previousPage}
                bus={bus}
                registry={registry}
                className="text-text enabled:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <SkipBackIcon size={24} />
            </ActionButton>

            <ActionButton
                id={ActionId.playPause}
                bus={bus}
                registry={registry}
                className="text-text enabled:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isPlaying ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
            </ActionButton>

            <ActionButton
                id={ActionId.nextPage}
                bus={bus}
                registry={registry}
                className="text-text enabled:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <SkipForwardIcon size={24} />
            </ActionButton>

            <ActionButton
                id={ActionId.lastPage}
                bus={bus}
                registry={registry}
                className="text-text enabled:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <FastForwardIcon size={24} />
            </ActionButton>
        </div>
    );
}
