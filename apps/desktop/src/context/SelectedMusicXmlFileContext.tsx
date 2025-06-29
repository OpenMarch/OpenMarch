import AudioFile from "@/global/classes/MusicXmlFile";
import { ReactNode, createContext, useContext, useState } from "react";

// Define the type for the context value
type SelectedMusicXmlFileContextFileContextProps = {
    selectedAudioFile: XmlFile | null;
    setSelectedAudioFile: (selectedXmlFile: File) => void;
};

const SelectedAudioFileContext = createContext<
    SelectedAudioFileContextProps | undefined
>(undefined);

export function SelectedAudioFileProvider({
    children,
}: {
    children: ReactNode;
}) {
    const [selectedAudioFile, setSelectedAudioFile] =
        useState<AudioFile | null>(null);

    // Create the context value object
    const contextValue: SelectedAudioFileContextProps = {
        selectedAudioFile,
        setSelectedAudioFile,
    };

    return (
        <SelectedAudioFileContext.Provider value={contextValue}>
            {children}
        </SelectedAudioFileContext.Provider>
    );
}

export function useSelectedAudioFile() {
    return useContext(SelectedAudioFileContext);
}
