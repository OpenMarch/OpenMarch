import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useEffect, useRef } from "react";
import audioFile from '/Users/alex/Documents/OpenMarch Junk/Cadets_2016_Awakening.mp3';

/**
 * The audio player handles the playback of the audio file.
 * There is no UI for the audio player, it is controlled by isPlaying and selectedPage stores/contexts.
 *
 * @returns An empty <> element
 */
export default function AudioPlayer() {
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;
    const audioRef = useRef<HTMLAudioElement>(null);
    const audioPath = '/Users/alex/Documents/OpenMarch Junk/Cadets_2016_Awakening.mp3'

    useEffect(() => {
        if (!audioRef.current) return;

        const audio = audioRef.current;

        audio.currentTime = selectedPage?.timestamp || 0;

        if (isPlaying) {
            console.log("playing")
            console.log("current time", audio.currentTime)
            audio.play();
        } else {
            audio.pause();
        }


    }, [isPlaying, selectedPage, selectedPage?.timestamp]);

    const getLocalFilePath = (filePath: string) => {
        return `file://${filePath.replace(/\\/g, '/')}`;
    };

    return (
        <audio ref={audioRef} src={audioFile} preload="auto" />
    );
}
