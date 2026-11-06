import {
    MetronomeIcon,
    SpeakerSimpleHighIcon,
    SpeakerSimpleLowIcon,
    SpeakerSimpleXIcon,
    RowsIcon,
    RepeatIcon,
} from "@phosphor-icons/react";
import Shortcut from "@/components/ui/Shortcut";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { clsx } from "clsx";
import { T, useTranslate } from "@tolgee/react";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import * as Popover from "@radix-ui/react-popover";
import { Slider } from "@openmarch/ui";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { toggleTimelineLoop } from "@/timeline/timelineTransport";
import { ShortcutTooltip } from "./ShortcutTooltip";
import { PlaybackSpeedButton } from "./PlaybackSpeedButton";
import { TRANSPORT_SHORTCUTS } from "./TimelinePrimitives";
import { START_INK } from "./startFlagInk";
import {
    effectivePlaybackSpeed,
    usePlaybackSpeedStore,
} from "@/stores/PlaybackSpeedStore";

/**
 * Loop (UI-17, C): turns looping on over the page being edited, or off. Lit while on; the loop is
 * then a bar on the ruler whose ends drag.
 */
export function TimelineLoopButton() {
    const { t } = useTranslate();
    const isolated = useTimelineSelectionStore((s) => s.isolation !== null);
    // An isolated move always loops (UI-17): lit, and it can't be turned off
    const looping = useTimelineSelectionStore(
        (s) => s.loop !== null || s.isolation !== null,
    );
    const shortcut = TRANSPORT_SHORTCUTS.loop;
    return (
        <ShortcutTooltip
            label={t(looping ? "timeline.loop.on" : "timeline.loop.off")}
            shortcut={isolated ? undefined : shortcut}
            hint={
                isolated ? (
                    t("timeline.loop.hintIsolated")
                ) : looping ? (
                    <span className="text-text-subtitle text-sub flex items-center gap-4">
                        <T
                            keyName="timeline.loop.hintOn"
                            params={{
                                keys: () => (
                                    <Shortcut
                                        binding={TRANSPORT_SHORTCUTS.play}
                                    />
                                ),
                            }}
                        />
                    </span>
                ) : (
                    t("timeline.loop.hintOff")
                )
            }
        >
            <button
                type="button"
                data-testid="timeline-loop"
                aria-label={t("timeline.loop.label")}
                aria-pressed={looping}
                // Not `disabled` in isolation, so the tooltip still says why it can't turn off
                aria-disabled={isolated || undefined}
                // Keeps keyboard focus off, so Space after a click is still Play
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                    if (!isolated) toggleTimelineLoop();
                }}
                className={clsx(
                    "rounded-4 focus-visible:ring-accent flex size-24 items-center justify-center outline-hidden duration-150 focus-visible:ring-2",
                    // In isolation: on (lit) but disabled (dimmed), and still takes the pointer for the
                    // tooltip that says why
                    isolated ? "cursor-default opacity-50" : "hover:bg-fg-2",
                    // Lit in the loop bar's color, so the button reads as the bar's (UI-17)
                    looping ? START_INK.text : "text-text hover:text-accent",
                )}
            >
                <RepeatIcon size={16} weight={looping ? "bold" : "regular"} />
            </button>
        </ShortcutTooltip>
    );
}

/** The playback speed button (`PlaybackSpeedButton`) on the playback speed store */
export function TimelineSpeedButton() {
    const speed = usePlaybackSpeedStore((s) => s.speed);
    const playing = usePlaybackSpeedStore(effectivePlaybackSpeed);
    const held = usePlaybackSpeedStore((s) => s.held.length > 0);
    const setSpeed = usePlaybackSpeedStore((s) => s.setSpeed);
    const stepSpeed = usePlaybackSpeedStore((s) => s.stepSpeed);
    return (
        <PlaybackSpeedButton
            speed={speed}
            playing={playing}
            held={held}
            onStep={stepSpeed}
            onSetSpeed={setSpeed}
            className="h-24"
            testId="timeline-speed"
        />
    );
}

/**
 * Sound (UI-12): one button for what was Volume and Metronome. Its popover mutes the music (the
 * metronome keeps counting, a rehearsal habit), sets the volume of both, and turns the metronome
 * on (Ctrl+M still does). The icon shows the music muted, and a dot shows the metronome is on.
 */
export function TimelineSoundButton() {
    const { t } = useTranslate();
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
    const state = t(
        silent
            ? isMetronomeOn
                ? "timeline.sound.stateMutedMetronomeOn"
                : "timeline.sound.stateMutedMetronomeOff"
            : isMetronomeOn
              ? "timeline.sound.stateMetronomeOn"
              : "timeline.sound.stateMetronomeOff",
        { volume: audioVolume },
    );
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
                    aria-label={state}
                    title={state}
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
                    className="border-stroke bg-modal text-text shadow-modal rounded-6 backdrop-blur-32 z-50 flex w-232 flex-col gap-10 border px-16 py-12"
                >
                    <div className="flex items-center gap-8">
                        <button
                            type="button"
                            aria-label={t("timeline.sound.mute")}
                            aria-pressed={audioMuted}
                            title={
                                audioMuted
                                    ? t("timeline.sound.unmuteTooltip")
                                    : t("timeline.sound.muteTooltip")
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
                            aria-label={t("timeline.sound.volume")}
                        />
                        <span className="text-sub w-36 shrink-0 text-right font-mono">
                            {audioMuted
                                ? t("timeline.sound.muted")
                                : t("timeline.percent", {
                                      percent: audioVolume,
                                  })}
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
                            {t(
                                isMetronomeOn
                                    ? "timeline.sound.metronomeOn"
                                    : "timeline.sound.metronomeOff",
                            )}
                        </span>
                        <span className="ml-auto">
                            <Shortcut action="toggleMetronome" />
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
    const { t } = useTranslate();
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
            aria-label={t("timeline.compact.label")}
            aria-pressed={compact}
            title={
                compact
                    ? t("timeline.compact.onTooltip")
                    : t("timeline.compact.label")
            }
            onClick={() => setCompact()}
        >
            <RowsIcon size={16} weight={compact ? "fill" : "regular"} />
        </button>
    );
}
