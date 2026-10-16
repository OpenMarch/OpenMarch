import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile, {
    computePlaceholderAudioDurationFromPages,
} from "@/global/classes/AudioFile";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjects } from "@/hooks";
import { toast } from "sonner";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import { useTolgee } from "@tolgee/react";
import { createMetronomeWav, SAMPLE_RATE } from "@openmarch/metronome";
import { calculateMasterVolume } from "./volume";
import { useQuery } from "@tanstack/react-query";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { timeAtBeat } from "@/timeline/timeMap";
import AudioOffsetWorker from "@/workers/audioOffset.worker.ts?worker";
import {
    audioEnvelope,
    useAudioEnvelopeStore,
    type AudioEnvelope,
} from "@/timeline/timelineWaveform";
import timeStretchWorkletUrl from "@/timeline/timeStretch.worklet.ts?worker&url";
import {
    TIME_STRETCH_PROCESSOR,
    type StretchMessage,
} from "@/timeline/timeStretchMessages";
import {
    effectivePlaybackSpeed,
    usePlaybackSpeedStore,
} from "@/stores/PlaybackSpeedStore";

export const waveColor = "rgb(180, 180, 180)";
export const lightProgressColor = "rgb(100, 66, 255)";
export const darkProgressColor = "rgb(150, 126, 255)";
const PLAYBACK_DELAY = 0.1; // Delay in seconds to start playback
// The live position leads the audio by this much wall time (the delay, plus a little)
const LIVE_LEAD = PLAYBACK_DELAY + 0.01;
// Stopping fades the sources out over this many seconds, so a stop or restart doesn't click
const STOP_FADE = 0.008;

// Helper function to adjust volume based on percentage
function volumeAdjustment(volume: number): number {
    return (volume * 2.0) / 100.0;
}

// Playback start info interface
interface PlaybackStartInfo {
    playStartTime: number;
    startTimestamp: number;
    pageDuration: number;
    /** Playback speed: show seconds per second */
    rate: number;
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

    const { playStartTime, startTimestamp, pageDuration, rate } =
        playbackStartInfoRef.current;
    return (
        startTimestamp +
        pageDuration +
        (audioContextRef.currentTime - playStartTime + LIVE_LEAD) * rate
    );
};

/** The speed playback is running at, 1 while stopped */
export const getLivePlaybackRate = (): number =>
    playbackStartInfoRef.current?.rate ?? 1;

/**
 * Moves the live playback position to `seconds` now, without waiting for the audio to restart
 * (timeline mode's loop, UI-9). The audio player restarts its sources from the playhead on the same
 * seek and then replaces this start info with its own. Does nothing while nothing is playing.
 */
export const restartLivePlaybackAt = (seconds: number): void => {
    if (!audioContextRef || !playbackStartInfoRef.current) return;
    const { rate } = playbackStartInfoRef.current;
    playbackStartInfoRef.current = {
        playStartTime: audioContextRef.currentTime,
        startTimestamp: seconds - LIVE_LEAD * rate,
        pageDuration: 0,
        rate,
    };
};

/** The worklet that plays the music and metronome at any speed, and each one's gain */
interface PlaybackEngine {
    node: AudioWorkletNode;
    musicGain: GainNode;
    metronomeGain: GainNode;
    send: (message: StretchMessage, transfer?: Transferable[]) => void;
}

// Ramps a gain to `value` at `at`, after holding what it had until then
function rampGain(gain: GainNode, value: number, from: number, to: number) {
    gain.gain.cancelScheduledValues(from);
    gain.gain.setValueAtTime(gain.gain.value, from);
    gain.gain.linearRampToValueAtTime(value, to);
}

// A volume or mute change while playing. Before the start lands it replaces the gain set for the
// start, which would otherwise undo it then; the fade-out of a restart isn't cut short
function setLiveGain(gain: GainNode, value: number, now: number) {
    const at = Math.max(now, playbackStartInfoRef.current?.playStartTime ?? 0);
    gain.gain.cancelScheduledValues(at);
    gain.gain.setValueAtTime(value, at);
}

// The metronome's gain for the current settings
function metronomeGainValue(audioVolume: number): number {
    const masterVolume = calculateMasterVolume(audioVolume, false);
    const { isMetronomeOn, volume } = useMetronomeStore.getState();
    return isMetronomeOn && masterVolume > 0
        ? volumeAdjustment(volume) * masterVolume
        : 0;
}

/**
 * The audio player handles playback via Web Audio API, at the playback speed
 * (`PlaybackSpeedStore`) through the time-stretch worklet, which keeps the music's pitch.
 * Metronome controls are managed by MetronomeModal.
 *
 * It runs only the engine: the AudioContext, the music and metronome sources, the live playback
 * clock and the timeline's waveform envelope. It renders nothing, since the timeline draws its own
 * waveform lane and playhead.
 */
// eslint-disable-next-line max-lines-per-function
export default function AudioPlayer() {
    const { t } = useTolgee();
    const audioMuted = useUiSettingsStore((s) => s.uiSettings.audioMuted);
    const audioVolume = useUiSettingsStore((s) => s.uiSettings.audioVolume);
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
    const isPlaying = isPlayingContext?.isPlaying ?? false;
    const selectedAudioFile =
        selectedAudioFileContext?.selectedAudioFile ?? null;
    // Metronome state management
    const { isMetronomeOn, accentFirstBeat, firstBeatOnly, volume, beatStyle } =
        useMetronomeStore();

    // The music and metronome are loaded into the engine; they play once both are
    const [audioLoaded, setAudioLoaded] = useState<boolean>(false);
    const [audioEnvelopeState, setAudioEnvelopeState] =
        useState<AudioEnvelope | null>(null);
    const [isAudioProcessing, setIsAudioProcessing] = useState<boolean>(false);
    const [metronomeLoaded, setMetronomeLoaded] = useState<boolean>(false);

    // AudioContext state management
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [engine, setEngine] = useState<PlaybackEngine | null>(null);
    // UI-9, UI-11: play starts at the playback cursor (or the playhead when there is none), not
    // the selected page. Every cursor or playhead write restarts playback from it, which is how a
    // preview loops back to its start.
    // Only read while playing (where playback starts, and each restart); paused, a scrub's seeks
    // don't re-render the player
    const playheadBeat = useTimelineSelectionStore((s) =>
        isPlaying ? displayedBeat(s) : 0,
    );
    const playheadRevision = useTimelineSelectionStore((s) =>
        isPlaying ? s.playheadRevision : -1,
    );
    const startSeconds = timeAtBeat(beats, playheadBeat);
    const restartKey = playheadRevision;
    const playbackSpeed = usePlaybackSpeedStore(effectivePlaybackSpeed);

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

    // Load the time-stretch worklet once the context exists
    useEffect(() => {
        if (!audioContext) return;
        let cancelled = false;
        let created: PlaybackEngine | null = null;
        audioContext.audioWorklet
            .addModule(timeStretchWorkletUrl)
            .then(() => {
                if (cancelled) return;
                const node = new AudioWorkletNode(
                    audioContext,
                    TIME_STRETCH_PROCESSOR,
                    {
                        numberOfInputs: 0,
                        numberOfOutputs: 2,
                        outputChannelCount: [2, 1],
                    },
                );
                const musicGain = audioContext.createGain();
                const metronomeGain = audioContext.createGain();
                musicGain.gain.value = 0;
                metronomeGain.gain.value = 0;
                node.connect(musicGain, 0).connect(audioContext.destination);
                node.connect(metronomeGain, 1).connect(
                    audioContext.destination,
                );
                created = {
                    node,
                    musicGain,
                    metronomeGain,
                    send: (message, transfer) =>
                        node.port.postMessage(message, transfer ?? []),
                };
                setEngine(created);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error("Audio worklet error", error);
                toast.error(t("audio.context.error"));
            });
        return () => {
            cancelled = true;
            // Ends the processor, which would otherwise run on holding the show's music
            created?.send({ type: "dispose" });
            created?.node.disconnect();
            created?.musicGain.disconnect();
            created?.metronomeGain.disconnect();
            setEngine(null);
            setAudioLoaded(false);
            setMetronomeLoaded(false);
        };
    }, [audioContext, t]);

    // Populate metronome audio track when beats or measures change
    useEffect(() => {
        if (!engine || !beats.length) return;

        const track = createMetronomeWav(
            measures,
            beats,
            accentFirstBeat,
            firstBeatOnly,
            beatStyle,
        );
        // Where each click starts, so the engine can play them unstretched at any speed
        const firstBeats = new Set(
            measures.map((m) => m.beats[0]?.index).filter((i) => i != null),
        );
        const onsets = Float64Array.from(
            beats
                .filter((b) => !firstBeatOnly || firstBeats.has(b.index))
                .map((b) => b.timestamp),
        ).sort();
        engine.send({ type: "metronome", track, onsets }, [
            track.buffer as ArrayBuffer,
            onsets.buffer,
        ]);
        setMetronomeLoaded(true);
    }, [engine, beats, measures, firstBeatOnly, beatStyle, accentFirstBeat]);

    const largestMinimumDuration = useRef(0);
    const minimumAudioDuration = useMemo(() => {
        const cappedDuration = computePlaceholderAudioDurationFromPages(pages);
        if (cappedDuration > largestMinimumDuration.current)
            largestMinimumDuration.current = cappedDuration;
        return largestMinimumDuration.current;
    }, [pages]);

    // The timeline's waveform lane (UI-12) reads the offset audio's envelope
    useEffect(() => {
        const { setEnvelope } = useAudioEnvelopeStore.getState();
        setEnvelope(
            audioEnvelopeState && selectedAudioFile ? audioEnvelopeState : null,
        );
    }, [audioEnvelopeState, selectedAudioFile]);
    useEffect(
        () => () => useAudioEnvelopeStore.getState().setEnvelope(null),
        [],
    );

    // Populate audio data when selectedAudioFile changes
    useEffect(() => {
        if (!audioContext || !engine || !selectedAudioFile) return;
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
                            const { audioBuffer: bufferData } = e.data as {
                                audioBuffer: {
                                    numberOfChannels: number;
                                    length: number;
                                    sampleRate: number;
                                    channelData: Float32Array[];
                                };
                            };
                            const channels = bufferData.channelData;

                            // The envelope first: the channels then move to the engine
                            setAudioEnvelopeState(
                                audioEnvelope({
                                    ...bufferData,
                                    getChannelData: (channel) =>
                                        channels[channel]!,
                                }),
                            );
                            engine.send(
                                { type: "music", channels },
                                channels.map((c) => c.buffer as ArrayBuffer),
                            );
                            setAudioLoaded(true);
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
                            minimumDuration: minimumAudioDuration,
                            // Nothing reads the WAV copy
                            encodeWaveform: false,
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
        engine,
        selectedAudioFile,
        audioOffsetSeconds,
        minimumAudioDuration,
        t,
    ]);

    // Play/pause audio when isPlaying changes
    useEffect(() => {
        if (
            !audioContext ||
            !engine ||
            !audioLoaded ||
            !metronomeLoaded ||
            isAudioProcessing
        )
            return;

        // Fades both out, then stops the engine, so a stop or restart doesn't click
        const stopPlayback = () => {
            const now = audioContext.currentTime;
            rampGain(engine.musicGain, 0, now, now + STOP_FADE);
            rampGain(engine.metronomeGain, 0, now, now + STOP_FADE);
            engine.send({ type: "stop", at: now + STOP_FADE });
        };

        if (isPlaying) {
            // A browser starts a context made before any click suspended. Starting a buffer
            // source used to resume it; the worklet has none, so Play resumes it (Play always
            // follows a click or key, so the browser allows it). The clock holds while suspended,
            // so the start below still lands PLAYBACK_DELAY after the audio runs
            if (audioContext.state === "suspended") void audioContext.resume();
            const startAt = audioContext.currentTime + PLAYBACK_DELAY;
            const rate = effectivePlaybackSpeed(
                usePlaybackSpeedStore.getState(),
            );
            const { audioVolume: volume, audioMuted: muted } =
                useUiSettingsStore.getState().uiSettings;
            // The volume scales both; mute silences the music only, so the metronome can count
            // through it (UI-12). Live changes update the gains below without restarting
            engine.musicGain.gain.setValueAtTime(
                calculateMasterVolume(volume, muted),
                startAt,
            );
            engine.metronomeGain.gain.setValueAtTime(
                metronomeGainValue(volume),
                startAt,
            );
            engine.send({
                type: "play",
                at: startAt,
                from: startSeconds,
                rate,
            });

            // Store playback tracking info for live position
            playbackStartInfoRef.current = {
                playStartTime: startAt,
                startTimestamp: startSeconds,
                pageDuration: 0,
                rate,
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
    }, [
        isPlaying,
        engine,
        audioLoaded,
        audioContext,
        isAudioProcessing,
        metronomeLoaded,
        startSeconds,
        restartKey,
    ]);

    // A speed change while playing keeps the show's position: the engine and the live clock
    // both change speed from now
    useEffect(() => {
        const info = playbackStartInfoRef.current;
        if (!audioContext || !engine || !info || info.rate === playbackSpeed)
            return;
        const now = audioContext.currentTime;
        if (now < info.playStartTime) {
            // Not started yet: it starts at the new speed
            engine.send({
                type: "rate",
                at: info.playStartTime,
                rate: playbackSpeed,
            });
            playbackStartInfoRef.current = { ...info, rate: playbackSpeed };
            return;
        }
        // Where the audio is now, behind the live position by its lead
        const audioSeconds = getLivePlaybackPosition() - LIVE_LEAD * info.rate;
        engine.send({ type: "rate", at: now, rate: playbackSpeed });
        playbackStartInfoRef.current = {
            playStartTime: now,
            startTimestamp: audioSeconds,
            pageDuration: 0,
            rate: playbackSpeed,
        };
    }, [audioContext, engine, playbackSpeed]);

    // Update metronome on/off state and volume
    useEffect(() => {
        if (audioContext && engine && playbackStartInfoRef.current)
            setLiveGain(
                engine.metronomeGain,
                metronomeGainValue(audioVolume),
                audioContext.currentTime,
            );
    }, [audioContext, engine, audioVolume, isMetronomeOn, volume]);

    useEffect(() => {
        if (audioContext && engine && playbackStartInfoRef.current)
            setLiveGain(
                engine.musicGain,
                calculateMasterVolume(audioVolume, audioMuted),
                audioContext.currentTime,
            );
    }, [audioContext, engine, audioMuted, audioVolume]);

    if (!contextsReady) {
        console.warn(
            "AudioPlayer is waiting for context providers to mount; rendering skipped.",
        );
        return null;
    }

    return null;
}
