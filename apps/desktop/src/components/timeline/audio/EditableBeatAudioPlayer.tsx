import WaveSurfer from "wavesurfer.js";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { SyntheticEvent, useEffect, useRef, useState } from "react";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjects } from "@/hooks";
// @ts-ignore - Importing the regions plugin
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import { EditableTimingMarkersPlugin } from "./EditableTimingMarkersPlugin";
import { T } from "@tolgee/react";
import { normalizeVolume } from "./volume";

/**
 * An audio player with editable beat markers.
 * Allows users to resize beats to adjust their duration.
 */
// eslint-disable-next-line max-lines-per-function
export default function EditableBeatAudioPlayer() {
    const { uiSettings } = useUiSettingsStore();
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;
    const { beats, measures, utility, fetchTimingObjects } = useTimingObjects();
    const { selectedAudioFile } = useSelectedAudioFile()!;
    const [audioFileUrl, setAudioFileUrl] = useState<string | null>(null);
    const [audioDuration, setAudioDuration] = useState<number>(0);
    const [waveSurfer, setWaveSurfer] = useState<WaveSurfer | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const waveformRef = useRef<HTMLDivElement>(null);
    const timingMarkersPlugin = useRef<EditableTimingMarkersPlugin | null>(
        null,
    );

    useEffect(() => {
        if (!audioRef.current) return;

        const audio = audioRef.current;

        if (isPlaying) {
            void audio.play();
        } else {
            audio.currentTime = selectedPage
                ? selectedPage.timestamp + selectedPage.duration
                : 0;
            audio.pause();
        }
    }, [audioFileUrl, isPlaying, selectedPage, selectedPage?.timestamp]);

    useEffect(() => {
        if (!selectedAudioFile) return;
        void AudioFile.getSelectedAudioFile().then((audioFile) => {
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
                height: 160,
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
                // TODO: share this with the theme and react to light/dark mode
                waveColor: "rgb(150, 150, 150)",
                progressColor: "rgb(100, 66, 255)",

                // make it dumb
                interact: false,
                hideScrollbar: true,
                autoScroll: false,
            });

            // Initialize regions plugin
            const regions = ws.registerPlugin(RegionsPlugin.create());

            // Use our editable timing markers plugin
            const editableMarkersPlugin = new EditableTimingMarkersPlugin(
                regions,
                beats,
                measures,
                fetchTimingObjects,
                utility?.default_beat_duration ?? 0.5,
            );
            timingMarkersPlugin.current = editableMarkersPlugin;

            // Create regions when the audio is decoded
            ws.on("decode", () => {
                editableMarkersPlugin.createTimingMarkers();
            });

            setWaveSurfer(ws);
        }
        return () => {
            waveSurfer?.destroy();
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioRef, waveformRef, audioDuration]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.muted = uiSettings.audioMuted;
            audioRef.current.volume = normalizeVolume(uiSettings.audioVolume);
        }
    }, [uiSettings.audioMuted, uiSettings.audioVolume]);

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
        const audioElement = event.target as HTMLAudioElement;
        setAudioDuration(audioElement.duration);
    };

    return (
        <div className="bg-red pl-[40px]">
            <div className="text-text/70 mb-2 text-sm">
                <T keyName="audio.editableBeatPlayer.description" />
            </div>
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
