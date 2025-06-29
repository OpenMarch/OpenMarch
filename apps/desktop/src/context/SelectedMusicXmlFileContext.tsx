import { ReactNode, createContext, useContext, useState } from "react";
import MusicXmlFile from "@/global/classes/MusicXmlFile";

// Define the type for the context value
type SelectedMusicXmlFileContextProps = {
    selectedMusicXmlFile: MusicXmlFile | null;
    setSelectedMusicXmlFile: (selectedXmlFile: MusicXmlFile) => void;
};

const SelectedMusicXmlFileContext = createContext<
    SelectedMusicXmlFileContextProps | undefined
>(undefined);

export function SelectedMusicXmlFileProvider({
    children,
}: {
    children: ReactNode;
}) {
    const [selectedMusicXmlFile, setSelectedMusicXmlFile] =
        useState<MusicXmlFile | null>(null);

    // Create the context value object
    const contextValue: SelectedMusicXmlFileContextProps = {
        selectedMusicXmlFile,
        setSelectedMusicXmlFile,
    };

    return (
        <SelectedMusicXmlFileContext.Provider value={contextValue}>
            {children}
        </SelectedMusicXmlFileContext.Provider>
    );
}

export function useSelectedMusicXmlFile() {
    return useContext(SelectedMusicXmlFileContext);
}
