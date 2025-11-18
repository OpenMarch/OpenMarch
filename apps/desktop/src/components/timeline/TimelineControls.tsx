import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import {
    RewindIcon,
    SkipBackIcon,
    PlayIcon,
    PauseIcon,
    SkipForwardIcon,
    FastForwardIcon,
    CornersOutIcon,
    CornersInIcon,
    MetronomeIcon,
    SpeakerHighIcon,
    SpeakerSlashIcon,
} from "@phosphor-icons/react";
import RegisteredActionButton from "@/components/RegisteredActionButton";
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
                    className={clsx("flex items-center gap-12", {
                        "justify-between": !isFullscreen,
                    })}
                >
                    <div className="flex items-center gap-12">
                        <TimelineMuteButton />
                        <TimelineMetronomeButton />
                    </div>
                    <button
                        className="text-text enabled:hover:text-accent focus-visible:ring-accent duration-150 ease-out focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={toggleFullscreen}
                        aria-label="Toggle timeline fullscreen"
                        aria-pressed={isFullscreen}
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

function TimelineMuteButton() {
    const audioMuted = useUiSettingsStore((s) => s.uiSettings.audioMuted);
    const toggleAudioMute = useUiSettingsStore((s) => s.toggleAudioMute);

    return (
        <div className="flex gap-10" id="timelineAudioMute">
            <button
                className={clsx(
                    "outline-hidden duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50",
                    {
                        "text-text": audioMuted,
                        "text-accent enabled:hover:text-text": !audioMuted,
                    },
                )}
                onClick={toggleAudioMute}
                aria-label={audioMuted ? "Unmute audio" : "Mute audio"}
            >
                {audioMuted ? (
                    <SpeakerSlashIcon size={24} />
                ) : (
                    <SpeakerHighIcon size={24} />
                )}
            </button>
        </div>
    );
}

function TimelineMetronomeButton() {
    const isMetronomeOn = useMetronomeStore((s) => s.isMetronomeOn);
    const toggleMetronome = useMetronomeStore((s) => s.toggleMetronome);

    return (
        <div className="flex gap-10" id="timelineMetronome">
            <button
                className={clsx(
                    "outline-hidden duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50",
                    {
                        "text-accent": isMetronomeOn,
                        "text-text enabled:hover:text-accent": !isMetronomeOn,
                    },
                )}
                onClick={toggleMetronome}
            >
                <MetronomeIcon size={24} />
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
                className="focus-visible:outline-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                disabled={
                    !selectedPage ||
                    (!isPlaying && selectedPage.nextPageId === null)
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
