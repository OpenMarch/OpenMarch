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
    SpeakerSimpleHighIcon,
    SpeakerSimpleLowIcon,
    SpeakerSimpleXIcon,
    RepeatIcon,
    FlagIcon,
    RowsIcon,
} from "@phosphor-icons/react";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { clsx } from "clsx";
import { START_INK } from "./startFlagInk";
import { AudioClock } from "./Clock";
import { T, useTolgee } from "@tolgee/react";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import * as Popover from "@radix-ui/react-popover";
import { Slider } from "@openmarch/ui";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";

export default function TimelineControls() {
    const { isFullscreen, toggleFullscreen } = useFullscreenStore();
    const focussedComponent = useUiSettingsStore(
        (s) => s.uiSettings.focussedComponent,
    );
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
                        disabled={focussedComponent === "timeline"}
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

export function TimelineMuteButton() {
    const audioVolume = useUiSettingsStore((s) => s.uiSettings.audioVolume);
    const setAudioVolume = useUiSettingsStore((s) => s.setAudioVolume);

    const handleSliderChange = (values: number[]) => {
        const nextVolume = values[0] ?? 0;
        setAudioVolume(nextVolume);
    };

    const sliderValue = audioVolume;
    const VolumeIcon =
        sliderValue === 0
            ? SpeakerSimpleXIcon
            : sliderValue < 50
              ? SpeakerSimpleLowIcon
              : SpeakerSimpleHighIcon;

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    className={clsx(
                        { "text-red": sliderValue === 0 },
                        { "text-text": sliderValue > 0 },
                        "enabled:hover:text-accent outline-hidden duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                    aria-label="Timeline volume"
                >
                    <VolumeIcon size={24} />
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content className="border-stroke bg-modal text-text shadow-modal rounded-8 z-50 flex flex-col gap-6 border px-16 py-12 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-6">
                        <p className="text-body">
                            <T keyName="timeline.masterVolume" />
                        </p>
                        <span className="text-body font-mono">{`${sliderValue}%`}</span>
                    </div>
                    <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[sliderValue]}
                        onValueChange={handleSliderChange}
                        aria-label="Timeline volume slider"
                    />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

export function TimelineMetronomeButton() {
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

/**
 * **From start** (UI-11): while on (lit), Play previews the move from the start flag; while off,
 * Play plays on from where you are. Shortcut C; Esc, or clicking the range bar, turns it off.
 */
export function TimelineFromStartButton() {
    const on = useTimelineSelectionStore((s) => s.playFromStart);
    const set = useTimelineSelectionStore((s) => s.setPlayFromStart);
    const label = on
        ? "From start: on. Play replays from the start flag (C, or Esc to turn off)"
        : "From start: off. Play plays on from the playhead (C to turn on)";
    return (
        <>
            <button
                type="button"
                data-testid="timeline-from-start"
                className={clsx(
                    "rounded-4 focus-visible:ring-accent flex h-24 min-w-24 items-center justify-center px-3 outline-hidden duration-150 ease-out focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
                    {
                        // The start flag's ink, so the button reads as the flag's (TimelinePrimitives)
                        [`${START_INK.bg} dark:text-text-invert text-white`]:
                            on,
                        "text-text enabled:hover:text-accent": !on,
                    },
                )}
                aria-label="From start (C)"
                aria-pressed={on}
                title={label}
                onClick={() => set()}
            >
                <FlagIcon size={18} weight={on ? "fill" : "regular"} />
            </button>
            {/* Announced however the mode changed: C, Esc, the bar or a dragged range */}
            <span className="sr-only" aria-live="polite">
                {on ? "From start on" : "From start off"}
            </span>
        </>
    );
}

/**
 * The preview loop (UI-11): with From start on, Play repeats the move until stopped. Off while
 * From start is off, since playing on doesn't loop.
 */
export function TimelineLoopButton() {
    const loop = useTimelineSelectionStore((s) => s.loopPreview);
    const fromStart = useTimelineSelectionStore((s) => s.playFromStart);
    const toggle = useTimelineSelectionStore((s) => s.toggleLoopPreview);
    const label = !fromStart
        ? "Loop the move (turn on Play from the start flag first)"
        : loop
          ? "Loop the move: on"
          : "Loop the move: off";
    return (
        <button
            type="button"
            className={clsx(
                "rounded-4 focus-visible:ring-accent flex size-24 items-center justify-center outline-hidden duration-150 ease-out focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
                {
                    "text-accent": loop && fromStart,
                    "text-text enabled:hover:text-accent": !(loop && fromStart),
                },
            )}
            aria-label="Loop the move"
            aria-pressed={loop && fromStart}
            title={label}
            disabled={!fromStart}
            onClick={() => toggle()}
        >
            <RepeatIcon size={18} />
        </button>
    );
}

/**
 * From start and its Loop as one pair (UI-12): Loop only does anything while From start is on,
 * so it sits beside it, always drawn (disabled while off) so the transport doesn't shift.
 */
export function TimelinePreviewButtons() {
    return (
        <div
            data-testid="timeline-preview-buttons"
            className="border-stroke rounded-6 flex h-28 items-center gap-2 border px-1"
        >
            <TimelineFromStartButton />
            <TimelineLoopButton />
        </div>
    );
}

/**
 * Sound (UI-12): one button for what was Volume and Metronome. Its popover mutes the music (the
 * metronome keeps counting, a rehearsal habit), sets the volume of both, and turns the metronome
 * on (Ctrl+M still does). The icon shows the music muted, and a dot shows the metronome is on.
 */
export function TimelineSoundButton() {
    const audioVolume = useUiSettingsStore((s) => s.uiSettings.audioVolume);
    const audioMuted = useUiSettingsStore((s) => s.uiSettings.audioMuted);
    const setAudioVolume = useUiSettingsStore((s) => s.setAudioVolume);
    const toggleAudioMute = useUiSettingsStore((s) => s.toggleAudioMute);
    const isMetronomeOn = useMetronomeStore((s) => s.isMetronomeOn);
    const toggleMetronome = useMetronomeStore((s) => s.toggleMetronome);
    const silent = audioMuted || audioVolume === 0;
    const VolumeIcon = silent
        ? SpeakerSimpleXIcon
        : audioVolume < 50
          ? SpeakerSimpleLowIcon
          : SpeakerSimpleHighIcon;
    const state = `${silent ? "music muted" : `volume ${audioVolume}%`}, metronome ${isMetronomeOn ? "on" : "off"}`;
    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    data-testid="timeline-sound"
                    className={clsx(
                        "rounded-4 enabled:hover:bg-fg-2 focus-visible:ring-accent relative flex size-24 items-center justify-center outline-hidden duration-150 ease-out focus-visible:ring-2",
                        silent
                            ? "text-red"
                            : "text-text enabled:hover:text-accent",
                    )}
                    aria-label={`Sound: ${state}`}
                    title={`Sound: ${state}`}
                >
                    <VolumeIcon size={18} />
                    {isMetronomeOn && (
                        <span className="bg-accent absolute top-1 right-1 size-5 rounded-full" />
                    )}
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    side="top"
                    className="border-stroke bg-modal text-text shadow-modal rounded-8 z-50 flex w-232 flex-col gap-10 border px-16 py-12 backdrop-blur-sm"
                >
                    <div className="flex items-center gap-8">
                        <button
                            type="button"
                            aria-label="Mute the music"
                            aria-pressed={audioMuted}
                            title={
                                audioMuted
                                    ? "Unmute the music"
                                    : "Mute the music (the metronome keeps counting)"
                            }
                            onClick={toggleAudioMute}
                            className={clsx(
                                "rounded-4 hover:bg-fg-2 focus-visible:ring-accent flex size-24 shrink-0 items-center justify-center outline-hidden focus-visible:ring-2",
                                silent ? "text-red" : "hover:text-accent",
                            )}
                        >
                            <VolumeIcon size={18} />
                        </button>
                        <Slider
                            min={0}
                            max={100}
                            step={1}
                            value={[audioVolume]}
                            onValueChange={(values) =>
                                setAudioVolume(values[0] ?? 0)
                            }
                            aria-label="Volume"
                        />
                        <span className="text-sub w-36 shrink-0 text-right font-mono">
                            {audioMuted ? "Muted" : `${audioVolume}%`}
                        </span>
                    </div>
                    <button
                        type="button"
                        aria-pressed={isMetronomeOn}
                        onClick={toggleMetronome}
                        className={clsx(
                            "border-stroke focus-visible:ring-accent flex items-center gap-6 border-t pt-8 outline-hidden focus-visible:ring-2",
                            isMetronomeOn ? "text-accent" : "hover:text-accent",
                        )}
                    >
                        <MetronomeIcon size={18} />
                        <span className="text-body">
                            Metronome {isMetronomeOn ? "on" : "off"}
                        </span>
                        <span className="text-sub text-text-subtitle ml-auto font-mono">
                            Ctrl+M
                        </span>
                    </button>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

/**
 * Compact (UI-12): the timeline as a thin strip, or full. Only this button switches it, and the
 * choice is remembered for every show. Lit while compact, like the other toggles.
 */
export function TimelineCompactButton() {
    const compact = useUiSettingsStore((s) => s.uiSettings.timelineCompact);
    const setCompact = useUiSettingsStore((s) => s.setTimelineCompact);
    return (
        <button
            type="button"
            data-testid="timeline-compact"
            className={clsx(
                "rounded-4 enabled:hover:bg-fg-2 focus-visible:ring-accent flex size-24 items-center justify-center outline-hidden duration-150 ease-out focus-visible:ring-2",
                compact
                    ? "text-accent bg-accent/10"
                    : "text-text enabled:hover:text-accent",
            )}
            aria-label="Compact timeline"
            aria-pressed={compact}
            title={
                compact
                    ? "Compact timeline: on. Click to show the full timeline"
                    : "Compact timeline"
            }
            onClick={() => setCompact()}
        >
            <RowsIcon size={16} weight={compact ? "fill" : "regular"} />
        </button>
    );
}

function PlaybackControls() {
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;
    const focussedComponent = useUiSettingsStore(
        (s) => s.uiSettings.focussedComponent,
    );
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
                    focussedComponent === "timeline"
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
                    focussedComponent === "timeline"
                }
            >
                <SkipBackIcon size={24} />
            </RegisteredActionButton>

            <RegisteredActionButton
                registeredAction={RegisteredActionsObjects.playPause}
                className="focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2"
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
                    focussedComponent === "timeline"
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
                    focussedComponent === "timeline"
                }
            >
                <FastForwardIcon size={24} />
            </RegisteredActionButton>
        </div>
    );
}
