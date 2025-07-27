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

    const {
        audioContext,
        setAudioContext,
        playbackTimestamp,
        setPlaybackTimestamp,
    } = useAudioStore();
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const [audioDuration, setAudioDuration] = useState<number>(0);

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
        if (!selectedPage) return;
        if (!isPlaying) {
            setPlaybackTimestamp(
                selectedPage.timestamp + selectedPage.duration,
            );
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

            source.start(0, playbackTimestamp);
            sourceNodeRef.current = source;
            // If not playing, stop any existing playback
        } else {
            stopPlayback();
        }

        return () => {
            stopPlayback();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, audioBuffer, audioContext]);

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
            setPlaybackTimestamp(currentPlayback + selectedPage.duration);
            rafId = requestAnimationFrame(update);
        };

        update();

        return () => {
            cancelAnimationFrame(rafId);
            setPlaybackTimestamp(selectedPage.timestamp);
        };
    }, [isPlaying, audioContext, selectedPage, setPlaybackTimestamp]);

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
            interact: false, // disables seeking and interaction
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

    // Update markers if beats/measures change
    useEffect(() => {
        if (timingMarkersPlugin.current) {
            timingMarkersPlugin.current.updateTimingMarkers(beats, measures);
        }
    }, [beats, measures, audioDuration]);

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
