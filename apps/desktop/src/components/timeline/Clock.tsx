import { useIsPlaying } from "@/context/IsPlayingContext";
import { ClockIcon } from "@phosphor-icons/react";
import { useLayoutEffect, useRef } from "react";
import { getLivePlaybackPosition } from "@/components/timeline/audio/AudioPlayer";
import { useSelectedPage } from "@/context/SelectedPageContext";

/** A time in MM:SS.mmm */
const formatTime = (seconds: number) => {
    const ms = Math.floor((seconds % 1) * 1000);
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
};

/**
 * Live clock component that displays the current playback position. While paused it shows
 * `pausedSeconds` when given (timeline mode passes the time at the playhead, UI-12), else the
 * selected page's end.
 */
export function AudioClock({ pausedSeconds }: { pausedSeconds?: number }) {
    const { isPlaying } = useIsPlaying()!;
    const { selectedPage } = useSelectedPage()!;
    const pausedTime =
        pausedSeconds ??
        (selectedPage?.timestamp ?? 0) + (selectedPage?.duration ?? 0);
    const textRef = useRef<HTMLSpanElement>(null);

    // The text is written here, before paint: while playing, every animation frame, without
    // re-rendering the clock or the transport around it
    useLayoutEffect(() => {
        const text = textRef.current;
        if (!text) return;
        if (!isPlaying) {
            text.textContent = formatTime(pausedTime);
            return;
        }
        let rafId = 0;
        const update = () => {
            const next = formatTime(getLivePlaybackPosition());
            if (text.textContent !== next) text.textContent = next;
            rafId = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(rafId);
    }, [isPlaying, pausedTime]);

    return (
        <div className="text-text flex items-center gap-6">
            <ClockIcon size={14} />
            <span ref={textRef} className="font-mono text-xs" />
        </div>
    );
}
