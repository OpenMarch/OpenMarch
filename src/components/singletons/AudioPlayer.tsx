import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useEffect, useRef, useState } from "react";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";

/**
 * The audio player handles the playback of the audio file.
 * There is no UI for the audio player, it is controlled by isPlaying and selectedPage stores/contexts.
 *
 * @returns An empty <> element
 */
export default function AudioPlayer() {
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;
    const { selectedAudioFile } = useSelectedAudioFile()!;
    const [audioFileUrl, setAudioFileUrl] = useState<string | null>(null);
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

    return (
        <div>
            {audioFileUrl && (
                <audio ref={audioRef} src={audioFileUrl} preload="auto" />
            )}
        </div>
    );
}
