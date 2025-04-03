import WaveSurfer from "wavesurfer.js";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useEffect, useRef, useState } from "react";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";

/**
 * The audio player handles the playback of the audio file.
 * There are no controls here for the audio player, it is controlled by isPlaying and selectedPage stores/contexts.
 * TODO: add the ability to turn off the waveform visualizer
 *
 * @returns An empty <> element
 */
export default function AudioPlayer({ pxPerSecond }: { pxPerSecond: number }) {
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;
    const { selectedAudioFile } = useSelectedAudioFile()!;
    const [audioFileUrl, setAudioFileUrl] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [waveSurfer, setWaveSurfer] = useState<WaveSurfer | null>(null);
    const waveformRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!audioRef.current) return;

        const audio = audioRef.current;

        if (isPlaying) {
            audio.play();
        } else {
            audio.currentTime = selectedPage?.timestamp || 0;
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
    }, [selectedAudioFile, setAudioFileUrl]);

    useEffect(() => {
        // TODO there's a race condition or an unmet dependency here. every so often the waveform won't load
        if (audioRef?.current && waveformRef?.current && waveSurfer == null) {
            setWaveSurfer(
                WaveSurfer.create({
                    // sync with the main audio element
                    media: audioRef.current,
                    container: waveformRef.current,

                    // this should be dynamic, but the parent is given height through tailwind currently
                    height: 50,
                    // TODO: this doesn't exactly behave yet when resizing
                    width: waveformRef.current.offsetWidth,

                    // hide the default cursor
                    cursorWidth: 0,

                    // this should be dynamic, and not hardcoded in the parent. this probably belongs in a store
                    minPxPerSec: 40,

                    // pretty up the waveform
                    barWidth: 2,
                    barGap: 1,
                    barRadius: 2,
                    // TODO: share this with the theme and react to light/dark mode
                    waveColor: "rgb(150, 150, 150)",
                    progressColor: "rgb(100, 66, 255)",

                    // make it dumb
                    interact: false,
                    hideScrollbar: true,
                    autoScroll: false,
                    allowScroll: false,
                }),
            );
        }
        return () => {
            if (waveSurfer) waveSurfer.destroy();
        };
    }, [audioFileUrl, audioRef, waveSurfer]);

    useEffect(() => {
        waveSurfer?.setOptions({
            minPxPerSec: pxPerSecond,
            width: waveformRef.current?.offsetWidth,
        });
    }, [pxPerSecond, waveSurfer]);

    return (
        <div className="row-span-2 h-full min-h-0 whitespace-nowrap pl-[31px]">
            {audioFileUrl && (
                <audio ref={audioRef} src={audioFileUrl} preload="auto" />
            )}

            <div ref={waveformRef}></div>
        </div>
    );
}
