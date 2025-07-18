import { useAudioStore } from "@/stores/AudioStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { ClockIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useSelectedPage } from "@/context/SelectedPageContext";

interface ClockProps {
    milliseconds: number;
    className?: string;
}

export function Clock({ milliseconds, className = "" }: ClockProps) {
    const formatTime = (ms: number): string => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const remainingMs = ms % 1000;

        return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${remainingMs.toString().padStart(3, "0")}`;
    };

    return (
        <div className={`text-text flex items-center gap-8 ${className}`}>
            <ClockIcon size={16} />
            <span className="font-mono text-sm">
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
    const wasPlaying = useRef(false);

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
    }, [selectedPage]);

    useEffect(() => {
        let animationFrame: number;

        const updateClock = () => {
            if (spanRef.current) {
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
            }

            animationFrame = requestAnimationFrame(updateClock);
        };

        if (isPlaying) {
            wasPlaying.current = true;
            animationFrame = requestAnimationFrame(updateClock);
        } else if (wasPlaying.current) {
            wasPlaying.current = false;
            animationFrame = requestAnimationFrame(updateClock);
        }

        return () => cancelAnimationFrame(animationFrame);
    }, [audio, isPlaying]);

    return (
        <div className="text-text flex items-center gap-8">
            <ClockIcon size={16} />
            <span className="font-mono text-sm" ref={spanRef}>
                00:00.000
            </span>
        </div>
    );
}
