import { useCallback, useEffect, useMemo, useRef } from "react";
import Beat from "@/global/classes/Beat";
import Measure from "@/global/classes/Measure";
import { useAudioStore } from "@/stores/AudioStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useMetronomeStore } from "@/stores/MetronomeStore";

const BEAT_TOLERANCE = 0.02; // How far past the beat timestamp we can be to still consider it the current beat

interface UseMetronomeProps {
    beats: Beat[];
    measures: Measure[];
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
 * Standard beat click sound
 */
function beatClick(ctx: AudioContext) {
    playClick(ctx, "sawtooth", 0.1, 2600, 0.04);
    playClick(ctx, "triangle", 0.3, 2600, 0.04);
    playClick(ctx, "sine", 0.8, 2600, 0.07);
}

/**
 * Standard measure start click sound
 */
function measureClick(ctx: AudioContext) {
    playClick(ctx, "sawtooth", 0.1, 3000, 0.04);
    playClick(ctx, "triangle", 0.3, 3000, 0.04);
    playClick(ctx, "sine", 0.8, 3000, 0.07);
}

/**
 * useMetronome hook
 * Plays a click sound whenever a new beat is reached in the audio playback.
 */
export const useMetronome = ({ beats, measures }: UseMetronomeProps) => {
    const { audio } = useAudioStore();
    const { isPlaying } = useIsPlaying()!;
    const isMetronomeOn = useMetronomeStore((state) => state.isMetronomeOn);
    const lastBeatIndexRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    // Sort list of beats and measures by timestamp
    const sortedBeats = useMemo(() => {
        return [...beats].sort((a, b) => a.timestamp - b.timestamp);
    }, [beats]);

    // Get list of beat_ids that are the start of measures
    const measureStartBeatIds = useMemo(() => {
        return measures.map((m) => m.startBeat.id);
    }, [measures]);

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
            if (!isPlaying || !audio || !isMetronomeOn) return;

            const currentTime = audio.currentTime; // seconds
            const currentBeatIndex = getCurrentBeatIndex(currentTime);

            // Play click when a new beat is reached
            if (
                currentBeatIndex !== -1 &&
                currentBeatIndex !== lastBeatIndexRef.current &&
                audioContextRef.current !== null &&
                currentTime - sortedBeats[currentBeatIndex].timestamp <=
                    BEAT_TOLERANCE
            ) {
                // check if the current beat is a measure start and play click
                if (
                    measureStartBeatIds.includes(
                        sortedBeats[currentBeatIndex].id,
                    )
                ) {
                    measureClick(audioContextRef.current);
                } else {
                    beatClick(audioContextRef.current);
                }

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
    }, [
        isPlaying,
        audio,
        sortedBeats,
        getCurrentBeatIndex,
        measureStartBeatIds,
        isMetronomeOn,
    ]);

    return {};
};
