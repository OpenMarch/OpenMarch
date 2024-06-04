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

    useEffect(() => {
        if (!audioRef.current) return;

        const audio = audioRef.current;

        if (isPlaying) {
            audio.play();
        } else {
            audio.currentTime = selectedPage?.timestamp || 0;
            audio.pause();
        }
    }, [isPlaying, selectedPage, selectedPage?.timestamp]);

    return (
        <audio ref={audioRef} src={audioFile} preload="auto" />
    );
}
