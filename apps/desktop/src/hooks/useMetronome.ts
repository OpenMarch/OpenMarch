import { useCallback, useEffect, useMemo, useRef } from "react";
import Beat from "@/global/classes/Beat";
import { useAudioStore } from "@/stores/AudioStore";
import { useIsPlaying } from "@/context/IsPlayingContext";

interface UseMetronomeProps {
    beats: Beat[];
}

/**
 * Plays a short click sound using the Web Audio API.
 * @param volume Volume of the click (default 1)
 * @param freq Frequency of the click (default 2600hz)
 * @param duration Duration of the click in seconds (default 0.07s)
 */
function playClick(volume = 1, freq = 2715, duration = 0.07) {
    try {
        const ctx = new (window.AudioContext ||
            (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.value = volume;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
            ctx.close();
        };
    } catch (err) {
        throw new Error("Failed to play click sound: " + err);
    }
}

/**
 * useMetronome hook
 * Plays a click sound whenever a new beat is reached in the audio playback.
 */
export const useMetronome = ({ beats }: UseMetronomeProps) => {
    const { audio } = useAudioStore();
    const { isPlaying } = useIsPlaying()!;
    const lastBeatIndexRef = useRef<number | null>(null);

    // Sorted list of beats by timestamp for efficient lookup
    const sortedBeats = useMemo(() => {
        return [...beats].sort((a, b) => a.timestamp - b.timestamp);
    }, [beats]);

    /**
     * Find the current beat index given the current audio time.
     * Returns the index of the beat whose timestamp is <= current time.
     */
    const getCurrentBeatIndex = useCallback(
        (currentTime: number) => {
            for (let i = sortedBeats.length - 1; i >= 0; i--) {
                if (currentTime >= sortedBeats[i].timestamp) {
                    return i;
                }
            }
            return -1;
        },
        [sortedBeats],
    );

    useEffect(() => {
        let animationFrameId: number | null = null;

        const tick = () => {
            if (!isPlaying || !audio) return;

            const currentTime = audio.currentTime; // seconds
            const currentBeatIndex = getCurrentBeatIndex(currentTime);

            // Play click when a new beat is reached
            if (
                currentBeatIndex !== -1 &&
                currentBeatIndex !== lastBeatIndexRef.current
            ) {
                playClick(1, 2600, 0.07);
                lastBeatIndexRef.current = currentBeatIndex;
            }

            animationFrameId = requestAnimationFrame(tick);
        };

        if (isPlaying) {
            animationFrameId = requestAnimationFrame(tick);
        } else {
            lastBeatIndexRef.current = null;
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        }

        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [isPlaying, audio, sortedBeats, getCurrentBeatIndex]);

    return {};
};
