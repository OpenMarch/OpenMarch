import { useSelectedMusicXmlFile } from "@/context/SelectedMusicXmlFileContext";
import MusicXmlFile from "@/global/classes/MusicXmlFile";
import { useState, useEffect, useCallback } from "react";
import {
    Select,
    SelectItem,
    SelectContent,
    SelectSeparator,
    SelectTriggerButton,
} from "@openmarch/ui";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "../RegisteredActionButton";

export default function MusicXmlSelector() {
    const [musicXmlFiles, setMusicXmlFiles] = useState<MusicXmlFile[]>([]);
    const { selectedMusicXmlFile, setSelectedMusicXmlFile } =
        useSelectedMusicXmlFile()!;

    const refreshMusicXmlFiles = useCallback(() => {
        MusicXmlFile.getMusicXmlFilesDetails().then((musicXmlFiles) => {
            setMusicXmlFiles(musicXmlFiles);
        });
    }, [setMusicXmlFiles]);

    const handleSelectChange = useCallback(
        (value: string) => {
            const selectedMusicXmlFileId = parseInt(value);
            MusicXmlFile.setSelectedMusicXmlFile(selectedMusicXmlFileId).then(
                (musicXmlFile: any) => {
                    setSelectedMusicXmlFile(musicXmlFile);
                },
            );
        },
        [setSelectedMusicXmlFile],
    );

    useEffect(() => {
        refreshMusicXmlFiles();
    }, [refreshMusicXmlFiles, selectedMusicXmlFile]);

    return (
        <div className="mt-8 flex items-center justify-between gap-8 px-12">
            <label
                htmlFor="musicxml-selector"
                className="text-body text-text/80 w-full"
            >
                MusicXML File
            </label>
            <div id="musicxml-selector" onClick={refreshMusicXmlFiles}>
                <Select
                    onValueChange={handleSelectChange}
                    value={
                        selectedMusicXmlFile ? `${selectedMusicXmlFile.id}` : ""
                    }
                >
                    <SelectTriggerButton
                        label={selectedMusicXmlFile?.nickname || "Import"}
                        className="w-[384px] px-12"
                    />
                    <SelectContent>
                        <RegisteredActionButton
                            registeredAction={
                                RegisteredActionsObjects.launchImportMusicXmlFileDialogue
                            }
                            showTooltip={false}
                            className="text-text"
                        >
                            Import MusicXML file
                        </RegisteredActionButton>
                        {musicXmlFiles.length > 0 && <SelectSeparator />}
                        {musicXmlFiles.map((musicXmlFile) => (
                            <SelectItem
                                key={musicXmlFile.id}
                                value={`${musicXmlFile.id}`}
                            >
                                {musicXmlFile.nickname}
                            </SelectItem>
                        ))}
                    </SelectContent>
                    <div className="text-text-subtitle text-sub mx-2 mt-4">
                        You may need to refresh the page to see new files.
                    </div>
                </Select>
            </div>
        </div>
    );
}
