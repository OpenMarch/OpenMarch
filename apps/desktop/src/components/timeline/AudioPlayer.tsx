import WaveSurfer from "wavesurfer.js";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { SyntheticEvent, useEffect, useRef, useState } from "react";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
// @ts-ignore - Importing the regions plugin
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import { TimingMarkersPlugin } from "./TimingMarkersPlugin";
import { useTheme } from "@/context/ThemeContext";

export const waveColor = "rgb(180, 180, 180)";
export const lightProgressColor = "rgb(100, 66, 255)";
export const darkProgressColor = "rgb(150, 126, 255)";

/**
 * The audio player handles the playback of the audio file.
 * There are no controls here for the audio player, it is controlled by isPlaying and selectedPage stores/contexts.
 *
 */
export default function AudioPlayer() {
    const { theme } = useTheme();
    const { uiSettings } = useUiSettingsStore();
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;
    // We'll use beats later for creating regions based on timing objects
    const { beats, measures } = useTimingObjectsStore();
    const { selectedAudioFile } = useSelectedAudioFile()!;
    const [audioFileUrl, setAudioFileUrl] = useState<string | null>(null);
    const [audioDuration, setAudioDuration] = useState<number>(0);
    const [waveSurfer, setWaveSurfer] = useState<WaveSurfer | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const waveformRef = useRef<HTMLDivElement>(null);
    const timingMarkersPlugin = useRef<TimingMarkersPlugin | null>(null);

    useEffect(() => {
        if (!audioRef.current) return;

        const audio = audioRef.current;

        if (isPlaying) {
            audio.play();
        } else {
            audio.currentTime = selectedPage
                ? selectedPage.timestamp + selectedPage.duration
                : 0;
            audio.pause();
        }
    }, [audioFileUrl, isPlaying, selectedPage, selectedPage?.timestamp]);

    useEffect(() => {
        if (!selectedAudioFile) return;
        AudioFile.getSelectedAudioFile().then((audioFile) => {
            if (!audioFile || !audioFile.data) return;
            const blob = new Blob([audioFile.data], { type: "audio/wav" });
            const url = URL.createObjectURL(blob);
            setAudioFileUrl(url);
        });
        return () => {
            if (audioFileUrl) window.URL.revokeObjectURL(audioFileUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAudioFile]);

    useEffect(() => {
        if (audioRef.current && waveformRef.current && waveSurfer == null) {
            const ws = WaveSurfer.create({
                // sync with the main audio element
                media: audioRef.current,
                container: waveformRef.current,

                // this should be dynamic, but the parent is given height through tailwind currently
                height: 60,
                width: audioDuration * 40,

                // hide the default cursor
                cursorWidth: 0,

                // this should be dynamic, and not hardcoded in the parent. this probably belongs in a store
                minPxPerSec: 40,

                // pretty up the waveform
                barWidth: 2,
                barGap: 1,
                barRadius: 2,
                barHeight: 1.2,
                waveColor,
                progressColor:
                    theme === "dark" ? darkProgressColor : lightProgressColor,

                // make it dumb
                interact: false,
                hideScrollbar: true,
                autoScroll: false,
            });

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
        }
        return () => {
            waveSurfer?.destroy();
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioRef, waveformRef, audioDuration]);

    // Update measures and beats when they change
    useEffect(() => {
        if (timingMarkersPlugin.current == null) return;
        timingMarkersPlugin.current.updateTimingMarkers(beats, measures);
    }, [beats, measures]);

    useEffect(() => {
        if (waveSurfer == null) return;

        waveSurfer.setOptions({
            minPxPerSec: uiSettings.timelinePixelsPerSecond,
            width: audioDuration * uiSettings.timelinePixelsPerSecond,
        });
    }, [audioDuration, waveSurfer, uiSettings.timelinePixelsPerSecond]);

    const handleAudioLoaded = (event: SyntheticEvent<HTMLAudioElement>) => {
        let audioElement = event.target as HTMLAudioElement;
        setAudioDuration(audioElement.duration);
    };

    return (
        <div className="pl-[40px]">
            {audioFileUrl && (
                <audio
                    ref={audioRef}
                    src={audioFileUrl}
                    preload="auto"
                    onLoadedMetadata={(event) => handleAudioLoaded(event)}
                />
            )}

            <div id="waveform" ref={waveformRef}></div>
        </div>
    );
}
