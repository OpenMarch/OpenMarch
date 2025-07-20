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
    const { audio } = useAudioStore();
    const { isPlaying } = useIsPlaying()!;
    const { selectedPage } = useSelectedPage()!;
    const spanRef = useRef<HTMLSpanElement>(null);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        if (spanRef.current && selectedPage) {
            const ms = (selectedPage.timestamp + selectedPage.duration) * 1000;
            const totalSeconds = Math.floor(ms / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            const remainingMs = Math.floor(ms % 1000);
            spanRef.current.textContent = `${minutes.toString().padStart(2, "0")}:${seconds
                .toString()
                .padStart(2, "0")}.${remainingMs.toString().padStart(3, "0")}`;
        }
    }, [selectedPage, isPlaying]);

    useEffect(() => {
        const updateClock = () => {
            if (spanRef.current && isPlaying) {
                const ms = audio.currentTime * 1000;
                const totalSeconds = Math.floor(ms / 1000);
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;
                const remainingMs = Math.floor(ms % 1000);
                spanRef.current.textContent = `${minutes.toString().padStart(2, "0")}:${seconds
                    .toString()
                    .padStart(
                        2,
                        "0",
                    )}.${remainingMs.toString().padStart(3, "0")}`;

                // Only continue the animation loop if still playing
                animationFrameRef.current = requestAnimationFrame(updateClock);
            }
        };

        if (isPlaying) {
            // Start the animation loop
            animationFrameRef.current = requestAnimationFrame(updateClock);
        } else {
            // Cancel any ongoing animation when not playing
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        }

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [audio, isPlaying]);

    return (
        <div className="text-text flex items-center gap-6">
            <ClockIcon size={14} />
            <span className="font-mono text-xs" ref={spanRef}>
                00:00.000
            </span>
        </div>
    );
}
