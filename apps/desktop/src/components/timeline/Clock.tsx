import { useAudioStore } from "@/stores/AudioStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { ClockIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useSelectedPage } from "@/context/SelectedPageContext";
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

export function AudioClock() {
    const playbackTimestamp = useAudioStore((state) => state.playbackTimestamp);

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
            <span className="font-mono text-xs">
                {formatTime(playbackTimestamp)}
            </span>
        </div>
    );
}
