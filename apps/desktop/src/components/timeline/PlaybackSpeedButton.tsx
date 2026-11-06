import { useState } from "react";
import { T, useTranslate } from "@tolgee/react";
import { clsx } from "clsx";
import * as Popover from "@radix-ui/react-popover";
import { Slider } from "@openmarch/ui";
import {
    MAX_PLAYBACK_SPEED,
    MIN_PLAYBACK_SPEED,
    clampPlaybackSpeed,
    formatPlaybackSpeed,
} from "@/stores/PlaybackSpeedStore";
import { ShortcutTooltip } from "./ShortcutTooltip";
import Shortcut from "@/components/ui/Shortcut";

// The popover's chips: the click cycle's speeds and the ones between
const SPEED_CHIPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4] as const;
// The slider is logarithmic, so 0.5× and 2× sit as far either side of 1×: hundredths of an octave
const SLIDER_MIN = Math.round(Math.log2(MIN_PLAYBACK_SPEED) * 100);
const SLIDER_MAX = Math.round(Math.log2(MAX_PLAYBACK_SPEED) * 100);
const speedToSlider = (speed: number) => Math.round(Math.log2(speed) * 100);
function sliderToSpeed(value: number): number {
    const raw = 2 ** (value / 100);
    // Catches on the chips' speeds, otherwise twentieths
    const chip = SPEED_CHIPS.find((s) => Math.abs(Math.log2(raw / s)) < 0.03);
    return clampPlaybackSpeed(chip ?? Math.round(raw * 20) / 20);
}

// The tooltip's second part: what a click does, then each hold key on its own line
function SpeedHint() {
    return (
        <span className="text-text-subtitle text-sub flex flex-col gap-4">
            <span>
                <T keyName="timeline.playbackSpeed.hintClick" />
            </span>
            <span className="flex items-center gap-6">
                <T
                    keyName="timeline.playbackSpeed.hintFaster"
                    params={{
                        keys: () => <Shortcut action="holdFasterPlayback" />,
                    }}
                />
            </span>
            <span className="flex items-center gap-6">
                <T
                    keyName="timeline.playbackSpeed.hintSlower"
                    params={{
                        keys: () => <Shortcut action="holdSlowerPlayback" />,
                    }}
                />
            </span>
        </span>
    );
}

/**
 * Playback speed, as a video player has it. A click steps through 0.25×, 0.5×, 1×, 1.5×, 2× and
 * 4× (Shift+click steps back); a right-click opens a slider from 0.1× to 8× with the common
 * speeds as chips. Held, `]` plays at double the speed and `[` at half. Lit off 1×; while a key
 * is held it shows the held speed. The music keeps its pitch (`timeStretch.ts`).
 *
 * The editor's transport and the 3D View window's both show it, each on its own speed source;
 * it needs a `TransportTooltipProvider` above it.
 */
export function PlaybackSpeedButton({
    speed,
    playing,
    held,
    onStep,
    onSetSpeed,
    className,
    testId,
}: {
    /** The chosen speed */
    speed: number;
    /** The speed playing now, a held key included */
    playing: number;
    /** A speed key is held */
    held: boolean;
    /** To the next speed, or the one before with `back` */
    onStep: (back: boolean) => void;
    onSetSpeed: (speed: number) => void;
    /** Its height, to sit in its row */
    className?: string;
    testId: string;
}) {
    const { t } = useTranslate();
    const [open, setOpen] = useState(false);
    const shown = formatPlaybackSpeed(playing, t);
    const label = t("timeline.playbackSpeed.current", { speed: shown });
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <ShortcutTooltip
                label={open ? undefined : label}
                hint={<SpeedHint />}
            >
                <Popover.Anchor asChild>
                    <button
                        type="button"
                        data-testid={testId}
                        aria-label={label}
                        aria-haspopup="dialog"
                        aria-keyshortcuts="BracketRight BracketLeft"
                        // Keeps keyboard focus off, so Space after a click is still Play
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => onStep(event.shiftKey)}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            setOpen(true);
                        }}
                        className={clsx(
                            "rounded-4 hover:bg-fg-2 focus-visible:ring-accent text-sub flex min-w-36 items-center justify-center px-4 font-mono tabular-nums outline-hidden duration-150 focus-visible:ring-2",
                            playing !== 1 || held
                                ? "text-accent bg-accent/10"
                                : "text-text hover:text-accent",
                            className,
                        )}
                    >
                        {shown}
                    </button>
                </Popover.Anchor>
            </ShortcutTooltip>
            <Popover.Portal>
                <Popover.Content
                    side="top"
                    sideOffset={6}
                    // The button keeps focus off itself; so does the popover, so Space still plays
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    className="border-stroke bg-modal text-text shadow-modal rounded-6 backdrop-blur-32 z-50 flex w-256 flex-col gap-10 border px-16 py-12"
                >
                    <div className="flex items-baseline justify-between">
                        <p className="text-body">
                            {t("timeline.playbackSpeed.title")}
                        </p>
                        <span
                            data-testid={`${testId}-value`}
                            className="text-body font-mono tabular-nums"
                        >
                            {formatPlaybackSpeed(speed, t)}
                        </span>
                    </div>
                    <Slider
                        className="w-full"
                        min={SLIDER_MIN}
                        max={SLIDER_MAX}
                        step={1}
                        value={[speedToSlider(speed)]}
                        onValueChange={(values) =>
                            onSetSpeed(sliderToSpeed(values[0] ?? 0))
                        }
                        aria-label={t("timeline.playbackSpeed.title")}
                    />
                    <div className="grid grid-cols-4 gap-4">
                        {SPEED_CHIPS.map((chip) => (
                            <button
                                key={chip}
                                type="button"
                                aria-pressed={speed === chip}
                                onClick={() => onSetSpeed(chip)}
                                className={clsx(
                                    "rounded-4 focus-visible:ring-accent text-sub h-22 px-4 font-mono tabular-nums outline-hidden focus-visible:ring-2",
                                    speed === chip
                                        ? "bg-accent text-text-invert"
                                        : "bg-fg-2 hover:text-accent",
                                )}
                            >
                                {formatPlaybackSpeed(chip, t)}
                            </button>
                        ))}
                    </div>
                    <p className="text-sub text-text-subtitle border-stroke flex items-center gap-4 border-t pt-8">
                        <T
                            keyName="timeline.playbackSpeed.holdKeys"
                            params={{
                                faster: () => (
                                    <Shortcut action="holdFasterPlayback" />
                                ),
                                slower: () => (
                                    <Shortcut action="holdSlowerPlayback" />
                                ),
                            }}
                        />
                    </p>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
