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
import { useAudioStore } from "@/stores/AudioStore";
import { useTolgee } from "@tolgee/react";

export const waveColor = "rgb(180, 180, 180)";
export const lightProgressColor = "rgb(100, 66, 255)";
export const darkProgressColor = "rgb(150, 126, 255)";

/**
 * The audio player handles playback via Web Audio API.
 * Controls are managed by isPlaying and selectedPage stores/contexts.
 */
export default function AudioPlayer() {
    const { theme } = useTheme();
    const { uiSettings } = useUiSettingsStore();
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;
    const { beats, measures } = useTimingObjectsStore();
    const { selectedAudioFile } = useSelectedAudioFile()!;

    const { audioContext, setAudioContext, setPlaybackTimestamp } =
        useAudioStore();
    const [startTimestamp, setStartTimestamp] = useState(0);
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

    const waveformRef = useRef<HTMLDivElement>(null);
    const timingMarkersPlugin = useRef<TimingMarkersPlugin | null>(null);
    const [waveSurfer, setWaveSurfer] = useState<WaveSurfer | null>(null);
    const [waveformBuffer, setWaveformBuffer] = useState<ArrayBuffer | null>(
        null,
    );

    const { t } = useTolgee();

    // Set up AudioContext on first mount
    useEffect(() => {
        if (!audioContext) {
            try {
                setAudioContext(new window.AudioContext());
            } catch (e) {
                toast.error(t("audio.context.error"));
            }
        }
    }, [audioContext, setAudioContext, t]);

    // Populate audio data when selectedAudioFile changes
    useEffect(() => {
        if (!audioContext || !selectedAudioFile) return;
        let isCancelled = false;

        AudioFile.getSelectedAudioFile().then((audioFile) => {
            if (!audioFile || !audioFile.data) return;

            setWaveformBuffer(audioFile.data);

            audioContext.decodeAudioData(
                audioFile.data,
                (buffer) => {
                    if (!isCancelled) setAudioBuffer(buffer);
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
        if (!selectedPage) return;
        if (!isPlaying) {
            setStartTimestamp(selectedPage.timestamp);
            setPlaybackTimestamp(selectedPage.timestamp);
        }
    }, [selectedPage, isPlaying, setPlaybackTimestamp]);

    // Play/pause audio when isPlaying changes
    useEffect(() => {
        if (!audioContext || !audioBuffer) return;

        // Helper to stop playback
        const stopPlayback = () => {
            if (sourceNodeRef.current) {
                try {
                    sourceNodeRef.current.stop();
                } catch (e) {
                    // Audio already stopped or not playing, ignore
                }
                sourceNodeRef.current.disconnect();
                sourceNodeRef.current = null;
            }
        };

        // If started playback, create a new source node
        if (isPlaying) {
            stopPlayback();

            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);

            source.onended = () => {
                sourceNodeRef.current = null;
            };

            source.start(0, startTimestamp);
            sourceNodeRef.current = source;
            // If not playing, stop any existing playback
        } else {
            stopPlayback();
        }

        return () => {
            stopPlayback();
        };
    }, [isPlaying, audioBuffer, audioContext, startTimestamp]);

    // Update the current playback timestamp in the store when playing
    useEffect(() => {
        if (!isPlaying || !audioContext || !selectedPage) return;

        let rafId: number;
        const startTimestamp = selectedPage.timestamp;
        const playStartTime = audioContext.currentTime;

        // Helper to update playback timestamp
        const update = () => {
            const currentPlayback =
                startTimestamp + (audioContext.currentTime - playStartTime);
            setPlaybackTimestamp(currentPlayback);
            rafId = requestAnimationFrame(update);
        };

        update();

        return () => {
            cancelAnimationFrame(rafId);
            setPlaybackTimestamp(selectedPage.timestamp);
        };
    }, [isPlaying, audioContext, selectedPage, setPlaybackTimestamp]);

    // WaveSurfer for waveform/regions only (not playback)
    useEffect(() => {}, [
        waveformRef,
        waveformBuffer,
        uiSettings.timelinePixelsPerSecond,
        theme,
        beats,
        measures,
    ]);

    // Update markers if beats/measures change
    useEffect(() => {
        if (timingMarkersPlugin.current) {
            timingMarkersPlugin.current.updateTimingMarkers(beats, measures);
        }
    }, [beats, measures]);

    // Update WaveSurfer options if duration/pixels per second changes
    useEffect(() => {
        if (waveSurfer) {
            waveSurfer.setOptions({
                minPxPerSec: uiSettings.timelinePixelsPerSecond,
                width: uiSettings.timelinePixelsPerSecond,
            });
        }
    }, [waveSurfer, uiSettings.timelinePixelsPerSecond]);

    return (
        <div className="w-fit pl-[40px]">
            <div id="waveform" ref={waveformRef}></div>
        </div>
    );
}
