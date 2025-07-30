import { useIsPlaying } from "@/context/IsPlayingContext";
import { ClockIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { getLivePlaybackPosition } from "@/components/timeline/audio/AudioPlayer";
import { useSelectedPage } from "@/context/SelectedPageContext";

/**
 * Live clock component that displays the current playback position
 */
export function AudioClock() {
    const { isPlaying } = useIsPlaying()!;
    const { selectedPage } = useSelectedPage()!;
    const [displayTime, setDisplayTime] = useState<number>(0);

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
            setDisplayTime(
                (selectedPage?.timestamp ?? 0) + (selectedPage?.duration ?? 0),
            );
        }

        return () => {
            cancelAnimationFrame(rafId);
        };
    }, [isPlaying, selectedPage]);

    // Helper function to format time in MM:SS.mmm format
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
