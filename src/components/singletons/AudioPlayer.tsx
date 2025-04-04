import WaveSurfer from "wavesurfer.js";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { SyntheticEvent, useEffect, useRef, useState } from "react";
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
    const [audioDuration, setAudioDuration] = useState<number>(0);
    const [waveSurfer, setWaveSurfer] = useState<WaveSurfer | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
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
    }, [selectedAudioFile]);

    useEffect(() => {
        if (audioRef.current && waveformRef.current && waveSurfer == null) {
            setWaveSurfer(
                WaveSurfer.create({
                    // sync with the main audio element
                    media: audioRef.current,
                    container: waveformRef.current,

                    // this should be dynamic, but the parent is given height through tailwind currently
                    height: 50,
                    width: audioDuration * 40,

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
                }),
            );
        }
        return () => {
            waveSurfer?.destroy();
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioRef, waveformRef, audioDuration]);

    useEffect(() => {
        if (waveSurfer == null) return;

        waveSurfer.setOptions({
            minPxPerSec: pxPerSecond,
            width: audioDuration * pxPerSecond,
        });
    }, [pxPerSecond, audioDuration, waveSurfer]);

    const handleAudioLoaded = (event: SyntheticEvent<HTMLAudioElement>) => {
        let audioElement = event.target as HTMLAudioElement;
        setAudioDuration(audioElement.duration);
    };

    return (
        <div className="row-span-2 h-full min-h-0 whitespace-nowrap pl-[31px]">
            {audioFileUrl && (
                <audio
                    ref={audioRef}
                    src={audioFileUrl}
                    preload="auto"
                    onLoadedMetadata={(event) => handleAudioLoaded(event)}
                />
            )}

            <div ref={waveformRef}></div>
        </div>
    );
}
