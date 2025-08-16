import WaveSurfer from "wavesurfer.js";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useEffect, useRef, useState } from "react";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
// @ts-ignore
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import { TimingMarkersPlugin } from "./TimingMarkersPlugin";
import { useTheme } from "@/context/ThemeContext";
import { toast } from "sonner";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import { useTolgee } from "@tolgee/react";
import { createMetronomeWav, SAMPLE_RATE } from "@openmarch/metronome";

export const waveColor = "rgb(180, 180, 180)";
export const lightProgressColor = "rgb(100, 66, 255)";
export const darkProgressColor = "rgb(150, 126, 255)";
const PLAYBACK_DELAY = 0.1; // Delay in seconds to start playback

// Helper function to adjust volume based on percentage
function volumeAdjustment(volume: number): number {
    return (volume * 2.0) / 100.0;
}

// Playback start info interface
interface PlaybackStartInfo {
    playStartTime: number;
    startTimestamp: number;
    pageDuration: number;
}

// Global reference to store playback start info, used for calculating live playback position
export const playbackStartInfoRef = {
    current: null as PlaybackStartInfo | null,
};

// Global reference to store the AudioContext, used for getting timestamp
export let audioContextRef: AudioContext | null = null;

// Function to get the current live playback position in seconds
export const getLivePlaybackPosition = (): number => {
    if (!audioContextRef || !playbackStartInfoRef.current) {
        return 0;
    }

    const { playStartTime, startTimestamp, pageDuration } =
        playbackStartInfoRef.current;
    return (
        startTimestamp +
        pageDuration +
        (audioContextRef.currentTime - playStartTime) +
        PLAYBACK_DELAY +
        0.01
    );
};

/**
 * The audio player handles playback via Web Audio API.
 * Metronome controls are managed by MetronomeModal.
 */
export default function AudioPlayer() {
    const { t } = useTolgee();
    const { theme } = useTheme();
    const { uiSettings } = useUiSettingsStore();
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;
    const { beats, measures } = useTimingObjectsStore();
    const { selectedAudioFile } = useSelectedAudioFile()!;

    // Metronome state management
    const { isMetronomeOn, accentFirstBeat, firstBeatOnly, volume, beatStyle } =
        useMetronomeStore();

    // Audio playback state management
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const audioNode = useRef<AudioBufferSourceNode | null>(null);
    const [audioDuration, setAudioDuration] = useState<number>(0);

    // Metronome playback state management
    const [metronomeBuffer, setMetronomeBuffer] = useState<AudioBuffer | null>(
        null,
    );
    const metroNode = useRef<AudioBufferSourceNode | null>(null);
    const metroGainNode = useRef<GainNode | null>(null);

    // Refs for WaveSurfer and timing markers
    const waveformRef = useRef<HTMLDivElement>(null);
    const timingMarkersPlugin = useRef<TimingMarkersPlugin | null>(null);
    const [waveSurfer, setWaveSurfer] = useState<WaveSurfer | null>(null);
    const [waveformBuffer, setWaveformBuffer] = useState<ArrayBuffer | null>(
        null,
    );

    // AudioContext state management
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [playbackTimestamp, setPlaybackTimestamp] = useState<number>(0);

    // Set up AudioContext on the first mount
    useEffect(() => {
        if (!audioContext) {
            try {
                const ctx = new window.AudioContext({
                    sampleRate: SAMPLE_RATE,
                });
                setAudioContext(ctx);
                audioContextRef = ctx;
            } catch (e) {
                toast.error(t("audio.context.error"));
            }
        } else {
            audioContextRef = audioContext;
        }
    }, [audioContext, setAudioContext, t]);

    // Populate metronome audio track when beats or measures change
    useEffect(() => {
        if (!audioContext || !beats.length || !measures.length) return;

        const float32Array = createMetronomeWav(
            measures,
            accentFirstBeat,
            firstBeatOnly,
            beatStyle,
        );

        const newBuffer = audioContext.createBuffer(
            1,
            float32Array.length,
            audioContext.sampleRate,
        );
        newBuffer.copyToChannel(float32Array, 0);

        // Set the metronome buffer in state
        setMetronomeBuffer(newBuffer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        audioContext,
        beats,
        measures,
        firstBeatOnly,
        beatStyle,
        accentFirstBeat,
    ]);

    // Populate audio data when selectedAudioFile changes
    useEffect(() => {
        if (!audioContext || !selectedAudioFile) return;
        let isCancelled = false;

        AudioFile.getSelectedAudioFile().then((audioFile) => {
            if (!audioFile || !audioFile.data) return;

            setWaveformBuffer(audioFile.data.slice(0));

            audioContext.decodeAudioData(
                audioFile.data.slice(0),
                (buffer) => {
                    if (!isCancelled) {
                        setAudioBuffer(buffer);
                        setAudioDuration(buffer.duration);
                    }
                },

                (error) => {
                    toast.error(t("audio.decode.error"));
                    console.error("Audio decode error", error);
                },
            );
        });

        // Cleanup
        return () => {
            isCancelled = true;
        };
    }, [audioContext, selectedAudioFile, t]);

    // Sync audio and store playback position with the selected page
    useEffect(() => {
        if (!selectedPage || isPlaying) return;

        setPlaybackTimestamp(selectedPage.timestamp + selectedPage.duration);
    }, [selectedPage, isPlaying, setPlaybackTimestamp]);

    // Play/pause audio when isPlaying changes
    useEffect(() => {
        if (!audioContext || !audioBuffer || !metronomeBuffer) return;

        // Helper to stop playback
        const stopPlayback = () => {
            if (audioNode.current) {
                try {
                    audioNode.current.stop();
                } catch (e) {
                    // Audio already stopped or not playing, ignore
                }
                audioNode.current.disconnect();
                audioNode.current = null;
            }
            if (metroNode.current) {
                try {
                    metroNode.current.stop();
                } catch (e) {
                    // Metronome already stopped or not playing, ignore
                }
                metroNode.current.disconnect();
                metroNode.current = null;
            }
        };

        // If started playback, create a new source node
        if (isPlaying) {
            stopPlayback();

            const startAt = audioContext.currentTime + PLAYBACK_DELAY;

            const audioSource = audioContext.createBufferSource();
            audioSource.buffer = audioBuffer;
            audioSource.connect(audioContext.destination);

            const metroSource = audioContext.createBufferSource();
            metroGainNode.current = audioContext.createGain();
            metroGainNode.current.gain.value = isMetronomeOn
                ? volumeAdjustment(volume)
                : 0;
            metroSource.buffer = metronomeBuffer;
            metroSource
                .connect(metroGainNode.current)
                .connect(audioContext.destination);

            audioSource.start(startAt, playbackTimestamp);
            metroSource.start(startAt, playbackTimestamp);

            audioSource.onended = () => {
                audioNode.current = null;
            };
            metroSource.onended = () => {
                metroNode.current = null;
            };

            audioNode.current = audioSource;
            metroNode.current = metroSource;

            // Store playback tracking info for live position
            playbackStartInfoRef.current = {
                playStartTime: startAt,
                startTimestamp: selectedPage?.timestamp ?? 0,
                pageDuration: selectedPage?.duration ?? 0,
            };
        } else {
            // If not playing, stop any existing playback
            stopPlayback();

            // Clear playback tracking info
            playbackStartInfoRef.current = null;
        }

        return () => {
            stopPlayback();
            playbackStartInfoRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, audioBuffer, audioContext]);

    // Initialize WaveSurfer and load waveform data
    useEffect(() => {
        if (!waveformRef.current || !waveformBuffer) return;

        // Clean up previous instance
        if (waveSurfer) {
            waveSurfer.destroy();
            setWaveSurfer(null);
        }

        // Create WaveSurfer instance
        const ws = WaveSurfer.create({
            container: waveformRef.current,
            height: 60,
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            waveColor: waveColor,
            progressColor:
                theme === "dark" ? darkProgressColor : lightProgressColor,
            interact: false,
            hideScrollbar: true,
            autoScroll: false,
        });

        // Load the audio data for visualization
        const blob = new Blob([waveformBuffer], { type: "audio/wav" });
        ws.loadBlob(blob);

        // Initialize regions plugin
        const regions = ws.registerPlugin(RegionsPlugin.create());
        const timelineMarkersPlugin = new TimingMarkersPlugin(
            regions,
            beats,
            measures,
        );
        timingMarkersPlugin.current = timelineMarkersPlugin;

        // Create regions when the audio is decoded
        ws.on("decode", () => {
            timelineMarkersPlugin.createTimingMarkers();
        });

        setWaveSurfer(ws);

        return () => {
            if (timingMarkersPlugin.current) {
                timingMarkersPlugin.current.clearTimingMarkers();
                timingMarkersPlugin.current = null;
            }
            ws.destroy();
            setWaveSurfer(null);
            timingMarkersPlugin.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [waveformRef, waveformBuffer, theme]);

    // Update metronome on/off state and volume
    useEffect(() => {
        if (metroGainNode.current) {
            metroGainNode.current.gain.value = isMetronomeOn
                ? volumeAdjustment(volume)
                : 0;
        }
    }, [isMetronomeOn, volume]);

    // Update markers if beats/measures change
    useEffect(() => {
        if (timingMarkersPlugin.current) {
            timingMarkersPlugin.current.updateTimingMarkers(beats, measures);
        }
    }, [beats, measures, audioDuration]);

    // Snap WaveSurfer to correct position when paused
    useEffect(() => {
        if (!waveSurfer || !audioBuffer || isPlaying) return;

        const livePlayback =
            (selectedPage?.timestamp ?? 0) + (selectedPage?.duration ?? 0);
        const progress = Math.max(0, Math.min(1, livePlayback / audioDuration));
        waveSurfer.seekTo(progress);
    }, [waveSurfer, audioBuffer, audioDuration, selectedPage, isPlaying]);

    // Animate WaveSurfer progress bar when playing
    useEffect(() => {
        if (!waveSurfer || !audioBuffer || !isPlaying) return;

        let isActive = true;
        let rafId: number;

        const update = () => {
            if (!isActive) return;
            const livePlayback = getLivePlaybackPosition();
            const progress = Math.max(
                0,
                Math.min(1, livePlayback / audioDuration),
            );
            waveSurfer.seekTo(progress);
            rafId = requestAnimationFrame(update);
        };

        update();

        return () => {
            isActive = false;
            cancelAnimationFrame(rafId);
        };
    }, [waveSurfer, audioBuffer, audioDuration, isPlaying]);

    // Update WaveSurfer style if duration or zoom changes
    useEffect(() => {
        if (waveSurfer) {
            waveSurfer.setOptions({
                minPxPerSec: uiSettings.timelinePixelsPerSecond,
                width: audioDuration * uiSettings.timelinePixelsPerSecond,
            });
        }
    }, [waveSurfer, audioDuration, uiSettings.timelinePixelsPerSecond]);

    return (
        <div className="w-fit pl-[40px]">
            <div id="waveform" ref={waveformRef}></div>
        </div>
    );
}
