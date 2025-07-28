import WaveSurfer from "wavesurfer.js";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useEffect, useRef, useState, useCallback } from "react";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
// @ts-ignore
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import { TimingMarkersPlugin } from "./TimingMarkersPlugin";
import { useTheme } from "@/context/ThemeContext";
import { toast } from "sonner";
import { useAudioStore } from "@/stores/AudioStore";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import { useTolgee } from "@tolgee/react";
import { createMetronomeWav, SAMPLE_RATE } from "metronome";

export const waveColor = "rgb(180, 180, 180)";
export const lightProgressColor = "rgb(100, 66, 255)";
export const darkProgressColor = "rgb(150, 126, 255)";

// Helper function to adjust volume based on percentage
function volumeAdjustment(volume: number): number {
    return (volume * 2.0) / 100.0;
}

/**
 * The audio player handles playback via Web Audio API.
 * Controls are managed by isPlaying and selectedPage stores/contexts.
 */
export default function AudioPlayer() {
    // Contexts and stores
    const { t } = useTolgee();
    const { theme } = useTheme();
    const { uiSettings } = useUiSettingsStore();
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;
    const { beats, measures } = useTimingObjectsStore();
    const { selectedAudioFile } = useSelectedAudioFile()!;

    // Audio state management
    const {
        audioContext,
        setAudioContext,
        playbackTimestamp,
        setPlaybackTimestamp,
    } = useAudioStore();
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const audioNode = useRef<AudioBufferSourceNode | null>(null);
    const [audioDuration, setAudioDuration] = useState<number>(0);

    // Metronome state management
    const { isMetronomeOn, accentFirstBeat, firstBeatOnly, volume, beatStyle } =
        useMetronomeStore();
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

    // Set up AudioContext on first mount
    useEffect(() => {
        if (!audioContext) {
            try {
                setAudioContext(
                    new window.AudioContext({ sampleRate: SAMPLE_RATE }),
                );
            } catch (e) {
                toast.error(t("audio.context.error"));
            }
        }
    }, [audioContext, setAudioContext, t]);

    // Populate metronome audio track when beats or measures change
    useEffect(() => {
        if (!audioContext || !beats.length || !measures.length) return;

        // Generate metronome .wav data
        const float32Array = createMetronomeWav(
            measures,
            accentFirstBeat,
            firstBeatOnly,
            beatStyle,
        );

        // Convert to AudioBuffer
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

            const startAt = audioContext.currentTime + 0.1;

            const audioSource = audioContext.createBufferSource();
            audioSource.buffer = audioBuffer;
            audioSource.connect(audioContext.destination);

            const metroSource = audioContext.createBufferSource();
            metroGainNode.current = audioContext.createGain();
            metroGainNode.current.gain.value = volumeAdjustment(volume);
            metroSource.buffer = metronomeBuffer;
            metroSource
                .connect(metroGainNode.current)
                .connect(audioContext.destination);

            audioSource.onended = () => {
                audioNode.current = null;
            };
            metroSource.onended = () => {
                metroNode.current = null;
            };

            audioSource.start(startAt, playbackTimestamp);
            metroSource.start(startAt, playbackTimestamp);

            audioNode.current = audioSource;
            metroNode.current = metroSource;

            // Store playback tracking info for live position
            playbackStartInfoRef.current = {
                playStartTime: startAt,
                startTimestamp: selectedPage ? selectedPage.timestamp : 0,
                pageDuration: selectedPage ? selectedPage.duration : 0,
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

    // Track info for live playback position calculation
    const playbackStartInfoRef = useRef<{
        playStartTime: number;
        startTimestamp: number;
        pageDuration: number;
    } | null>(null);

    // Live getter for current playback position
    const getLivePlaybackPosition = useCallback(() => {
        if (!isPlaying || !audioContext || !playbackStartInfoRef.current) {
            // If not playing, return last snapped timestamp
            return selectedPage
                ? selectedPage.timestamp + selectedPage.duration
                : 0;
        }
        const { playStartTime, startTimestamp, pageDuration } =
            playbackStartInfoRef.current;
        return (
            startTimestamp +
            (audioContext.currentTime - playStartTime) +
            pageDuration
        );
    }, [isPlaying, audioContext, selectedPage]);

    // WaveSurfer initialization
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
            ws.destroy();
            setWaveSurfer(null);
            timingMarkersPlugin.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [waveformRef, waveformBuffer, theme]);

    // Update metronome on/off state and volume
    useEffect(() => {
        if (metroGainNode.current) {
            if (isMetronomeOn) {
                metroGainNode.current.gain.value = volumeAdjustment(volume);
            } else {
                metroGainNode.current.gain.value = 0;
            }
        }
    }, [isMetronomeOn, volume]);

    // Update markers if beats/measures change
    useEffect(() => {
        if (timingMarkersPlugin.current) {
            timingMarkersPlugin.current.updateTimingMarkers(beats, measures);
        }
    }, [beats, measures, audioDuration]);

    // Update WaveSurfer progress bar as playback position changes
    useEffect(() => {
        if (!waveSurfer || !audioBuffer) return;
        let rafId: number;

        const update = () => {
            const livePlayback = getLivePlaybackPosition();
            const progress = Math.max(
                0,
                Math.min(1, livePlayback / audioDuration),
            );
            waveSurfer.seekTo(progress);
            rafId = requestAnimationFrame(update);
        };

        if (isPlaying) {
            update();
        } else {
            // On pause, snap to current page position
            const livePlayback = getLivePlaybackPosition();
            const progress = Math.max(
                0,
                Math.min(1, livePlayback / audioDuration),
            );
            waveSurfer.seekTo(progress);
        }

        return () => {
            cancelAnimationFrame(rafId);
        };
    }, [
        isPlaying,
        waveSurfer,
        audioBuffer,
        audioDuration,
        getLivePlaybackPosition,
    ]);

    // Update WaveSurfer options if duration/pixels per second changes
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
