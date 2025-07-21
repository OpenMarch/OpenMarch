import { useCallback, useEffect, useMemo, useRef } from "react";
import Beat from "@/global/classes/Beat";
import { useAudioStore } from "@/stores/AudioStore";
import { useIsPlaying } from "@/context/IsPlayingContext";

interface UseMetronomeProps {
    beats: Beat[];
}

/**
 * Plays a short click sound
 * @param ctx Reference to the AudioContext
 * @param type Type of oscillator to use (default "triangle")
 * @param volume Volume of the click (default 1)
 * @param freq Frequency of the click (default 2600hz)
 * @param duration Duration of the click in seconds (default 0.07s)
 */
function playClick(
    ctx: AudioContext,
    type = "triangle",
    volume = 1,
    freq = 2715,
    duration = 0.07,
) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type as OscillatorType;
    osc.frequency.value = freq;

    // fade out
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);

    osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
    };
}

/**
 * useMetronome hook
 * Plays a click sound whenever a new beat is reached in the audio playback.
 */
export const useMetronome = ({ beats }: UseMetronomeProps) => {
    const { audio } = useAudioStore();
    const { isPlaying } = useIsPlaying()!;
    const lastBeatIndexRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

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

    // Create the audio context when the hook is mounted
    useEffect(() => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext ||
                (window as any).webkitAudioContext)();
        }
        return () => {
            audioContextRef.current?.close();
            audioContextRef.current = null;
        };
    }, []);

    // Handle playing clicks on beat
    useEffect(() => {
        let animationFrameId: number | null = null;

        const tick = () => {
            if (!isPlaying || !audio) return;

            const currentTime = audio.currentTime; // seconds
            const currentBeatIndex = getCurrentBeatIndex(currentTime);

            // Play click when a new beat is reached
            if (
                currentBeatIndex !== -1 &&
                currentBeatIndex !== lastBeatIndexRef.current &&
                audioContextRef.current !== null
            ) {
                playClick(audioContextRef.current, "sawtooth", 0.1, 2600, 0.04);
                playClick(audioContextRef.current, "triangle", 0.3, 2600, 0.04);
                playClick(audioContextRef.current, "sine", 0.8, 2600, 0.07);
                lastBeatIndexRef.current = currentBeatIndex;
            }

            animationFrameId = requestAnimationFrame(tick);
        };

        // Start the animation loop if playing
        if (isPlaying) {
            animationFrameId = requestAnimationFrame(tick);
        } else {
            lastBeatIndexRef.current = null;
        }

        // Cleanup function to cancel the animation frame
        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [isPlaying, audio, sortedBeats, getCurrentBeatIndex]);

    return {};
};
