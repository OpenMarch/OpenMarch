import { useCallback, useEffect, useMemo, useRef } from "react";
import Beat from "@/global/classes/Beat";
import Measure from "@/global/classes/Measure";
import { useAudioStore } from "@/stores/AudioStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useMetronomeStore } from "@/stores/MetronomeStore";

// How far past the beat timestamp we can be to still consider it the current beat
const BEAT_TOLERANCE = 0.02;

/**
 * Available beat styles for the metronome.
 * Currently includes:
 * - default: Standard click sound
 * - sharp: Sharp click sound
 * - smooth: Smooth click sound
 */
export const BEAT_STYLES: Record<
    string,
    {
        beat: (ctx: AudioContext, volume: number) => void;
        measure: (ctx: AudioContext, volume: number) => void;
        labelKey: string;
    }
> = {
    default: {
        beat: beatClickDefault,
        measure: measureClickDefault,
        labelKey: "music.standard",
    },
    sharp: {
        beat: sharpBeatClick,
        measure: sharpMeasureClick,
        labelKey: "music.sharp",
    },
    smooth: {
        beat: smoothBeatClick,
        measure: smoothMeasureClick,
        labelKey: "music.smooth",
    },
};

/**
 * Standard beat and measure click sound
 */
function beatClickDefault(ctx: AudioContext, volume: number) {
    playClick(ctx, "sawtooth", 0.1 * volume, 2600, 0.04);
    playClick(ctx, "triangle", 0.3 * volume, 2600, 0.04);
    playClick(ctx, "sine", 0.8 * volume, 2600, 0.07);
}
function measureClickDefault(ctx: AudioContext, volume: number) {
    playClick(ctx, "sawtooth", 0.1 * volume, 3000, 0.04);
    playClick(ctx, "triangle", 0.3 * volume, 3000, 0.04);
    playClick(ctx, "sine", 0.8 * volume, 3000, 0.07);
}

/**
 * Sharp beat and measure click sound
 */
function sharpBeatClick(ctx: AudioContext, volume: number) {
    playClick(ctx, "sawtooth", 0.15 * volume, 3200, 0.02);
    playClick(ctx, "triangle", 0.4 * volume, 3200, 0.05);
}
function sharpMeasureClick(ctx: AudioContext, volume: number) {
    playClick(ctx, "sawtooth", 0.15 * volume, 3500, 0.02);
    playClick(ctx, "triangle", 0.4 * volume, 3500, 0.05);
}

/**
 * Smooth beat and measure click sound
 */
function smoothBeatClick(ctx: AudioContext, volume: number) {
    playClick(ctx, "sine", volume, 2000, 0.1);
}
function smoothMeasureClick(ctx: AudioContext, volume: number) {
    playClick(ctx, "sine", volume, 2400, 0.1);
}

// Adjust volume to a range suitable for audio context
function volumeAdjust(volume: number): number {
    return (volume * 2) / 100;
}

/**
 * Plays a short click sound
 * @param ctx Reference to the AudioContext
 * @param type Type of oscillator to use (default "triangle")
 * @param volume Volume of the click (default 1)
 * @param freq Frequency of the click (default 2715hz)
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
 * Props for the useMetronome hook
 */
interface UseMetronomeProps {
    beats: Beat[];
    measures: Measure[];
}

/**
 * useMetronome hook
 * Plays a click sound whenever a new beat is reached in the audio playback.
 */
export const useMetronome = ({ beats, measures }: UseMetronomeProps) => {
    const { audio } = useAudioStore();
    const { isPlaying } = useIsPlaying()!;

    const isMetronomeOn = useMetronomeStore((state) => state.isMetronomeOn);
    const accentFirstBeat = useMetronomeStore((state) => state.accentFirstBeat);
    const firstBeatOnly = useMetronomeStore((state) => state.firstBeatOnly);
    const beatStyle = useMetronomeStore((state) => state.beatStyle);
    const volume = volumeAdjust(useMetronomeStore((state) => state.volume));

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
                    if (accentFirstBeat) {
                        BEAT_STYLES[beatStyle].measure(
                            audioContextRef.current,
                            volume,
                        );
                    } else {
                        BEAT_STYLES[beatStyle].beat(
                            audioContextRef.current,
                            volume,
                        );
                    }
                } else if (!firstBeatOnly) {
                    BEAT_STYLES[beatStyle].beat(
                        audioContextRef.current,
                        volume,
                    );
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
        accentFirstBeat,
        firstBeatOnly,
        volume,
        beatStyle,
    ]);

    return {};
};
