import { ClockIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { subscribeToFrameClock } from "@/services/clock/frame-clock";

// Helper function to format time in MM:SS.mmm format
const formatTime = (seconds: number) => {
    const ms = Math.floor((seconds % 1) * 1000);
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
};
/**
 * Live clock component that displays the current playback position
 */
export function AudioClock() {
    const clockDisplayRef = useRef<HTMLElement>(null);

    // Animation frame loop to update the displayed time
    useEffect(() => {
        const unsubscribe = subscribeToFrameClock((timeMs) => {
            if (clockDisplayRef.current)
                clockDisplayRef.current.textContent = formatTime(timeMs / 1000);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    return (
        <div className="text-text flex items-center gap-6">
            <ClockIcon size={14} />
            <span className="font-mono text-xs" ref={clockDisplayRef}>
                {formatTime(0)}
            </span>
        </div>
    );
}
