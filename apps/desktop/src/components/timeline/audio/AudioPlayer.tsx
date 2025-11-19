import WaveSurfer from "wavesurfer.js";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjects } from "@/hooks";
import { useTheme } from "@/context/ThemeContext";
import { toast } from "sonner";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import { useTolgee } from "@tolgee/react";
import { createMetronomeWav, SAMPLE_RATE } from "@openmarch/metronome";
import WaveformTimingOverlay from "./WaveformTimingOverlay";
import { calculateMasterVolume } from "./volume";
import { useQuery } from "@tanstack/react-query";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import AudioOffsetWorker from "@/workers/audioOffset.worker.ts?worker";
import { SpinnerIcon } from "@phosphor-icons/react";

export const waveColor = "rgb(180, 180, 180)";
export const lightProgressColor = "rgb(100, 66, 255)";
export const darkProgressColor = "rgb(150, 126, 255)";
const PLAYBACK_DELAY = 0.1; // Delay in seconds to start playback
const WAVEFORM_HEIGHT = 60;

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
// eslint-disable-next-line max-lines-per-function
export default function AudioPlayer() {
    const { t } = useTolgee();
    const { theme } = useTheme();
    const { uiSettings } = useUiSettingsStore();
    const audioMuted = uiSettings.audioMuted;
    const audioVolume = uiSettings.audioVolume;
    const selectedPageContext = useSelectedPage();
    const isPlayingContext = useIsPlaying();
    const selectedAudioFileContext = useSelectedAudioFile();
    const { beats, measures, pages } = useTimingObjects();
    const { data: workspaceSettings } = useQuery(
        workspaceSettingsQueryOptions(),
    );
    const audioOffsetSeconds = workspaceSettings?.audioOffsetSeconds ?? 0;
    const contextsReady =
        !!selectedPageContext &&
        !!isPlayingContext &&
        !!selectedAudioFileContext;
    const selectedPage = selectedPageContext?.selectedPage ?? null;
    const isPlaying = isPlayingContext?.isPlaying ?? false;
    const selectedAudioFile =
        selectedAudioFileContext?.selectedAudioFile ?? null;
    // Metronome state management
    const { isMetronomeOn, accentFirstBeat, firstBeatOnly, volume, beatStyle } =
        useMetronomeStore();

    // Audio playback state management
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const audioNode = useRef<AudioBufferSourceNode | null>(null);
    const audioGainNode = useRef<GainNode | null>(null);
    const [audioDuration, setAudioDuration] = useState<number>(0);
    const [isAudioProcessing, setIsAudioProcessing] = useState<boolean>(false);

    // Metronome playback state management
    const [metronomeBuffer, setMetronomeBuffer] = useState<AudioBuffer | null>(
        null,
    );
    const metroNode = useRef<AudioBufferSourceNode | null>(null);
    const metroGainNode = useRef<GainNode | null>(null);

    // Refs for WaveSurfer and timing markers
    const waveformRef = useRef<HTMLDivElement>(null);
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
        if (!audioContext || !beats.length) return;

        const float32Array = createMetronomeWav(
            measures,
            beats,
            accentFirstBeat,
            firstBeatOnly,
            beatStyle,
        );
        const newBuffer = audioContext.createBuffer(
            1,
            float32Array.length,
            audioContext.sampleRate,
        );
        // React Native typings expect `Float32Array<ArrayBuffer>` but our metronome util returns
        // `Float32Array<ArrayBufferLike>`. Explicitly cast so TS understands we are providing the
        // correct view.
        void newBuffer.copyToChannel(float32Array as any, 0);

        // Set the metronome buffer in state
        setMetronomeBuffer(newBuffer);
    }, [
        audioContext,
        beats,
        measures,
        firstBeatOnly,
        beatStyle,
        accentFirstBeat,
    ]);

    const largestMinimumDuration = useRef(0);
    const minimumAudioDuration = useMemo(() => {
        const calculatedMinimumDuration =
            pages.length > 0
                ? pages[pages.length - 1].timestamp +
                  pages[pages.length - 1].duration +
                  10
                : 10;
        if (calculatedMinimumDuration > largestMinimumDuration.current)
            largestMinimumDuration.current = calculatedMinimumDuration;
        return largestMinimumDuration.current;
    }, [pages]);

    // Populate audio data when selectedAudioFile changes
    useEffect(() => {
        if (!audioContext || !selectedAudioFile) return;
        let isCancelled = false;
        let worker: Worker | null = null;

        AudioFile.getSelectedAudioFile(minimumAudioDuration).then(
            async (audioFile) => {
                if (!audioFile || !audioFile.data || isCancelled) return;

                try {
                    setIsAudioProcessing(true);

                    // Decode audio in the main thread (AudioContext is available here)
                    const decodedBuffer = await audioContext.decodeAudioData(
                        audioFile.data.slice(0),
                    );

                    if (isCancelled) return;

                    // Extract channel data to send to worker
                    const channelData: Float32Array[] = [];
                    for (let i = 0; i < decodedBuffer.numberOfChannels; i++) {
                        channelData.push(decodedBuffer.getChannelData(i));
                    }

                    // Create a new worker instance
                    worker = new AudioOffsetWorker();

                    // Set up worker message handler
                    worker.onmessage = (e: MessageEvent) => {
                        if (isCancelled) return;

                        if (e.data.type === "audioProcessed") {
                            // Reconstruct the AudioBuffer from the worker's response
                            const { audioBuffer: bufferData, waveformBuffer } =
                                e.data;

                            const newBuffer = audioContext.createBuffer(
                                bufferData.numberOfChannels,
                                bufferData.length,
                                bufferData.sampleRate,
                            );

                            // Copy channel data back into the AudioBuffer
                            for (
                                let i = 0;
                                i < bufferData.numberOfChannels;
                                i++
                            ) {
                                newBuffer.copyToChannel(
                                    bufferData.channelData[i],
                                    i,
                                );
                            }

                            setAudioBuffer(newBuffer);
                            setAudioDuration(newBuffer.duration);
                            setWaveformBuffer(waveformBuffer);
                            setIsAudioProcessing(false);

                            // Clean up worker
                            worker?.terminate();
                        } else if (e.data.type === "error") {
                            console.error("Worker error:", e.data.message);
                            toast.error(t("audio.decode.error"));
                            setIsAudioProcessing(false);
                            worker?.terminate();
                        }
                    };

                    worker.onerror = (error) => {
                        if (!isCancelled) {
                            console.error("Worker error:", error);
                            toast.error(t("audio.decode.error"));
                            setIsAudioProcessing(false);
                        }
                        worker?.terminate();
                    };

                    // Send the decoded audio buffer data to the worker for offset processing
                    const transferList: Transferable[] = [];
                    channelData.forEach((data) =>
                        transferList.push(data.buffer as ArrayBuffer),
                    );

                    worker.postMessage(
                        {
                            type: "processAudio",
                            audioBuffer: {
                                numberOfChannels:
                                    decodedBuffer.numberOfChannels,
                                length: decodedBuffer.length,
                                sampleRate: decodedBuffer.sampleRate,
                                channelData,
                            },
                            offsetSeconds: audioOffsetSeconds,
                        },
                        transferList,
                    );
                } catch (error) {
                    if (!isCancelled) {
                        toast.error(t("audio.decode.error"));
                        console.error("Audio decode error", error);
                        setIsAudioProcessing(false);
                    }
                }
            },
        );

        // Cleanup
        return () => {
            isCancelled = true;
            worker?.terminate();
            setIsAudioProcessing(false);
        };
    }, [
        audioContext,
        selectedAudioFile,
        audioOffsetSeconds,
        minimumAudioDuration,
        t,
    ]);

    // Sync audio and store playback position with the selected page
    useEffect(() => {
        if (!selectedPage || isPlaying) return;

        setPlaybackTimestamp(selectedPage.timestamp + selectedPage.duration);
    }, [selectedPage, isPlaying, setPlaybackTimestamp]);

    // Play/pause audio when isPlaying changes
    useEffect(() => {
        if (
            !audioContext ||
            !audioBuffer ||
            !metronomeBuffer ||
            isAudioProcessing
        )
            return;

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
            if (audioGainNode.current) {
                audioGainNode.current.disconnect();
                audioGainNode.current = null;
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
            audioGainNode.current = audioContext.createGain();
            audioGainNode.current.gain.value = calculateMasterVolume(
                audioVolume,
                audioMuted,
            );
            audioSource
                .connect(audioGainNode.current)
                .connect(audioContext.destination);

            const metroSource = audioContext.createBufferSource();
            metroGainNode.current = audioContext.createGain();
            const masterVolume = calculateMasterVolume(audioVolume, audioMuted);
            metroGainNode.current.gain.value =
                isMetronomeOn && masterVolume > 0
                    ? volumeAdjustment(volume) * masterVolume
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
    }, [isPlaying, audioBuffer, audioContext, isAudioProcessing]);

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
            height: WAVEFORM_HEIGHT,
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
        void ws.loadBlob(blob);

        setWaveSurfer(ws);

        return () => {
            ws.destroy();
            setWaveSurfer(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [waveformRef, waveformBuffer, theme]);

    // Update metronome on/off state and volume
    useEffect(() => {
        if (metroGainNode.current) {
            const masterVolume = calculateMasterVolume(audioVolume, audioMuted);
            metroGainNode.current.gain.value =
                isMetronomeOn && masterVolume > 0
                    ? volumeAdjustment(volume) * masterVolume
                    : 0;
        }
    }, [audioMuted, audioVolume, isMetronomeOn, volume]);

    useEffect(() => {
        if (audioGainNode.current) {
            audioGainNode.current.gain.value = calculateMasterVolume(
                audioVolume,
                audioMuted,
            );
        }
    }, [audioMuted, audioVolume]);

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

    const measuresDuration = useMemo(() => {
        if (!measures.length) {
            return 0;
        }
        const lastMeasure = measures[measures.length - 1];
        return lastMeasure.timestamp + lastMeasure.duration;
    }, [measures]);

    const renderedDuration = Math.max(audioDuration, measuresDuration);

    const audioWaveformWidth = useMemo(() => {
        if (audioDuration <= 0) return 0;
        return audioDuration * uiSettings.timelinePixelsPerSecond;
    }, [audioDuration, uiSettings.timelinePixelsPerSecond]);

    // Update WaveSurfer style if duration or zoom changes
    useEffect(() => {
        if (waveSurfer) {
            waveSurfer.setOptions({
                minPxPerSec: uiSettings.timelinePixelsPerSecond,
                width: audioWaveformWidth,
            });
        }
    }, [waveSurfer, audioWaveformWidth, uiSettings.timelinePixelsPerSecond]);

    const waveformWidth =
        renderedDuration > 0
            ? renderedDuration * uiSettings.timelinePixelsPerSecond
            : 0;

    if (!contextsReady) {
        console.warn(
            "AudioPlayer is waiting for context providers to mount; rendering skipped.",
        );
        return null;
    }

    return (
        <div className="w-fit pl-[40px]">
            <div
                className="relative pt-12"
                style={{
                    width: waveformWidth || undefined,
                    height: WAVEFORM_HEIGHT,
                }}
            >
                {isAudioProcessing && (
                    <div className="bg-bg-1/80 dark:bg-bg-3/80 absolute inset-0 z-10 flex items-center justify-start pl-4">
                        <SpinnerIcon size={16} className="animate-spin" />
                    </div>
                )}
                <div
                    id="waveform"
                    ref={waveformRef}
                    className="-z-10 h-full"
                    style={{
                        width: audioWaveformWidth || undefined,
                        height: WAVEFORM_HEIGHT,
                    }}
                ></div>
                {waveformWidth > audioWaveformWidth && (
                    <div
                        className="bg-fg-1/40 dark:bg-bg-1/40 pointer-events-none absolute top-0 bottom-0"
                        style={{
                            left: audioWaveformWidth,
                            width: waveformWidth - audioWaveformWidth,
                        }}
                    >
                        <div className="border-stroke h-full border-l border-dashed opacity-60" />
                    </div>
                )}
                <WaveformTimingOverlay
                    beats={beats}
                    measures={measures}
                    duration={renderedDuration}
                    pixelsPerSecond={uiSettings.timelinePixelsPerSecond}
                    height={WAVEFORM_HEIGHT}
                    width={waveformWidth}
                />
            </div>
        </div>
    );
}
