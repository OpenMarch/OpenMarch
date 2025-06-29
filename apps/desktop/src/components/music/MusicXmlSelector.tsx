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

// Dummy class/utility -- replace with your actual MusicXmlFile class or API.
import MusicXmlFile from "@/global/classes/MusicXmlFile";
import { useSelectedMusicXmlFile } from "@/context/SelectedMusicXmlFileContext";

export default function MusicXmlSelector() {
    const [xmlFiles, setXmlFiles] = useState<MusicXmlFile[]>([]);
    const { selectedMusicXmlFile, setSelectedMusicXmlFile } =
        useSelectedMusicXmlFile();

    const refreshXmlFiles = useCallback(() => {
        MusicXmlFile.getMusicXmlFilesDetails().then(setXmlFiles);
    }, []);

    const handleSelectChange = useCallback(
        (value: string) => {
            const selectedFileId = parseInt(value);
            MusicXmlFile.setSelectedMusicXmlFile(selectedFileId).then(
                setSelectedMusicXmlFile,
            );
        },
        [setSelectedMusicXmlFile],
    );

    useEffect(() => {
        refreshXmlFiles();
    }, [refreshXmlFiles, selectedMusicXmlFile]);

    return (
        <div className="mt-8 flex items-center justify-between gap-8 px-12">
            <label
                htmlFor="musicxml-selector"
                className="text-body text-text/80 w-full"
            >
                MusicXML File
            </label>
            <div id="musicxml-selector" onClick={refreshXmlFiles}>
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
                        {xmlFiles.length > 0 && <SelectSeparator />}
                        {xmlFiles.map((xmlFile) => (
                            <SelectItem
                                key={xmlFile.id}
                                value={`${xmlFile.id}`}
                            >
                                {xmlFile.nickname}
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
