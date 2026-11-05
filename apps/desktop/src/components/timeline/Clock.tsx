import { useIsPlaying } from "@/context/IsPlayingContext";
import { ClockIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useTolgee } from "@tolgee/react";
import { getLivePlaybackPosition } from "@/components/timeline/audio/AudioPlayer";
import { useSelectedPage } from "@/context/SelectedPageContext";
import tolgee from "@/global/singletons/Tolgee";

/** The language's decimal separator ("." in English, "," in French) */
export const decimalSeparator = (language: string | undefined): string =>
    new Intl.NumberFormat(language ?? "en")
        .formatToParts(1.5)
        .find((part) => part.type === "decimal")?.value ?? ".";

/** A time in MM:SS.mmm, with `decimal` before the milliseconds; "-" before a negative one */
export const formatTime = (time: number, decimal = "."): string => {
    // Rounded to the millisecond first, so -0.0004 is not "-00:00.000"
    const rounded = Math.round(time * 1000) / 1000;
    if (rounded < 0) return `-${formatTime(-rounded, decimal)}`;
    const seconds = rounded + 1e-9;
    const ms = Math.floor((seconds % 1) * 1000);
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}${decimal}${ms.toString().padStart(3, "0")}`;
};

/**
 * Live clock component that displays the current playback position. While paused it shows
 * `pausedSeconds` when given (timeline mode passes the time at the playhead, UI-12), else the
 * selected page's end.
 *
 * With `musicOffset` (Edit music) it shows the time in the music file instead: the show's time
 * less the offset, negative before the music starts. "Count 1 in the music…" takes that number
 * (owner, 2026-11-04: read it off the clock rather than a "Start the music here" command).
 */
export function AudioClock({
    pausedSeconds,
    musicOffset,
}: {
    pausedSeconds?: number;
    musicOffset?: number;
}) {
    const { isPlaying } = useIsPlaying()!;
    const { selectedPage } = useSelectedPage()!;
    const pausedTime =
        pausedSeconds ??
        (selectedPage?.timestamp ?? 0) + (selectedPage?.duration ?? 0);
    const textRef = useRef<HTMLSpanElement>(null);
    const language = useTolgee(["language"]).getLanguage();
    const decimal = useMemo(() => decimalSeparator(language), [language]);
    const shift = musicOffset ?? 0;

    // The text is written here, before paint: while playing, every animation frame, without
    // re-rendering the clock or the transport around it
    useLayoutEffect(() => {
        const text = textRef.current;
        if (!text) return;
        if (!isPlaying) {
            text.textContent = formatTime(pausedTime - shift, decimal);
            return;
        }
        let rafId = 0;
        const update = () => {
            const next = formatTime(getLivePlaybackPosition() - shift, decimal);
            if (text.textContent !== next) text.textContent = next;
            rafId = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(rafId);
    }, [isPlaying, pausedTime, decimal, shift]);

    return (
        <div
            className="text-text flex items-center gap-6"
            data-testid="audio-clock"
            title={
                musicOffset === undefined
                    ? undefined
                    : tolgee.t("tempoMode.clock.musicTime", "Time in the music")
            }
        >
            {musicOffset === undefined ? (
                <ClockIcon size={14} />
            ) : (
                <MusicNotesIcon size={14} aria-hidden />
            )}
            <span ref={textRef} className="font-mono text-xs" />
        </div>
    );
}
