import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import {
    RewindIcon,
    SkipBackIcon,
    PlayIcon,
    PauseIcon,
    SkipForwardIcon,
    FastForwardIcon,
<<<<<<< HEAD
    MagnifyingGlassPlusIcon,
    MagnifyingGlassMinusIcon,
=======
>>>>>>> 7dbba7f (move timeline controls, polishes)
} from "@phosphor-icons/react";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useIsPlaying } from "@/context/IsPlayingContext";
<<<<<<< HEAD
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
=======
>>>>>>> 7dbba7f (move timeline controls, polishes)

export default function TimelineControls() {
    return (
        <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-12 border px-16 py-12">
            <p className="text-body text-text/60">Timeline</p>
            <PlaybackControls />
<<<<<<< HEAD
            <ZoomControls />
        </div>
    );
}

function ZoomControls() {
    const { uiSettings, setPixelsPerSecond } = useUiSettingsStore();

    return (
        <div className="flex" id="zoomIcons">
            <button
                className="text-text active:hover:text-accent m-4 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() =>
                    setPixelsPerSecond(uiSettings.timelinePixelsPerSecond * 0.8)
                }
                disabled={uiSettings.timelinePixelsPerSecond <= 10}
            >
                <MagnifyingGlassMinusIcon size={24} />
            </button>
            <button
                className="text-text active:hover:text-accent m-4 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() =>
                    setPixelsPerSecond(uiSettings.timelinePixelsPerSecond * 1.2)
                }
                disabled={uiSettings.timelinePixelsPerSecond >= 200}
            >
                <MagnifyingGlassPlusIcon size={24} />
            </button>
=======
>>>>>>> 7dbba7f (move timeline controls, polishes)
        </div>
    );
}

function PlaybackControls() {
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;

    return (
        <div className="flex gap-16" aria-label="Playback Controls">
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
