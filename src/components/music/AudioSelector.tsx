import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import { useCallback, useEffect, useState } from "react";

export default function AudioSelector({ className = "" }: { className?: string }) {
    const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
    const { selectedAudioFile, setSelectedAudioFile } = useSelectedAudioFile()!;

    const refreshAudioFiles = useCallback(() => {
        AudioFile.getAudioFilesDetails().then((audioFiles) => {
            setAudioFiles(audioFiles);
        });
    }, [setAudioFiles]);

    const handleSelectChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedAudioFileId = parseInt(event.target.value);
        AudioFile.setSelectedAudioFile(selectedAudioFileId).then((audioFile) => {
            setSelectedAudioFile(audioFile);
        });
    }, [setSelectedAudioFile]);

    useEffect(() => {
        refreshAudioFiles();
    }, [refreshAudioFiles, selectedAudioFile]);

    return (
        <div className={className}>
            <label htmlFor="audio-selector">Select an audio file:</label>
            <select id="audio-selector" onClick={refreshAudioFiles} onChange={handleSelectChange} value={selectedAudioFile?.id}>
                {audioFiles.map((audioFile) => (
                    <option key={audioFile.id} value={audioFile.id}>
                        {audioFile.nickname}
                    </option>
                ))}
            </select>
        </div>
    );
}
