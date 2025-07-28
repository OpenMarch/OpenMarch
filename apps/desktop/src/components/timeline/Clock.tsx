import { useIsPlaying } from "@/context/IsPlayingContext";
import { ClockIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useAudioStore } from "@/stores/AudioStore";
import { clsx } from "clsx";

interface ClockProps {
    milliseconds: number;
    className?: string;
}

export function Clock({ milliseconds, className = "" }: ClockProps) {
    const formatTime = (ms: number): string => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const remainingMs = Math.floor(ms % 1000);

        return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${remainingMs.toString().padStart(3, "0")}`;
    };

    return (
        <div className={clsx("text-text flex items-center gap-6", className)}>
            <ClockIcon size={14} />
            <span className="font-mono text-xs">
                {formatTime(milliseconds)}
            </span>
        </div>
    );
}

/*
  Live clock display for audio playback.
  Uses the same tracking method as the waveform (live getter based on audio context).
*/
export function AudioClock() {
    const { isPlaying } = useIsPlaying()!;
    const { selectedPage } = useSelectedPage()!;
    const { audioContext } = useAudioStore();
    const [displayTime, setDisplayTime] = useState<number>(0);

    // Ref to store playback tracking info
    const playbackStartInfoRef = useRef<{
        playStartTime: number;
        startTimestamp: number;
        pageDuration: number;
    } | null>(null);

    // Keep this ref in sync with the current selected page and playback state
    useEffect(() => {
        if (!isPlaying) {
            playbackStartInfoRef.current = null;
        } else if (audioContext && selectedPage) {
            playbackStartInfoRef.current = {
                playStartTime: audioContext.currentTime,
                startTimestamp: selectedPage.timestamp,
                pageDuration: selectedPage.duration,
            };
        }
    }, [isPlaying, audioContext, selectedPage]);

    // Live getter for current playback position
    const getLivePlaybackPosition = useCallback(() => {
        if (!isPlaying || !audioContext || !playbackStartInfoRef.current) {
            // If not playing, return last snapped timestamp
            return selectedPage
                ? selectedPage.timestamp + selectedPage.duration
                : 0;
        }
        const { playStartTime, startTimestamp, pageDuration } =
            playbackStartInfoRef.current;
        return (
            startTimestamp +
            (audioContext.currentTime - playStartTime) +
            pageDuration
        );
    }, [isPlaying, audioContext, selectedPage]);

    // Animation frame loop to update the displayed time
    useEffect(() => {
        let rafId: number;

        const update = () => {
            setDisplayTime(getLivePlaybackPosition());
            rafId = requestAnimationFrame(update);
        };

        if (isPlaying) {
            update();
        } else {
            setDisplayTime(getLivePlaybackPosition());
        }

        return () => {
            cancelAnimationFrame(rafId);
        };
    }, [isPlaying, getLivePlaybackPosition]);

    const formatTime = (seconds: number) => {
        const ms = Math.floor((seconds % 1) * 1000);
        const totalSeconds = Math.floor(seconds);
        const minutes = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
    };

    return (
        <div className="text-text flex items-center gap-6">
            <ClockIcon size={14} />
            <span className="font-mono text-xs">{formatTime(displayTime)}</span>
        </div>
    );
}
