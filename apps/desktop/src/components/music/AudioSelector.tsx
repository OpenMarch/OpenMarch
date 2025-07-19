import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import { useCallback, useEffect, useState } from "react";
import {
    Select,
    SelectItem,
    SelectContent,
    SelectSeparator,
    SelectTriggerButton,
    Button,
    AlertDialog,
    AlertDialogTrigger,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogCancel,
    AlertDialogAction,
} from "@openmarch/ui";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "../RegisteredActionButton";
import { TrashIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { T, useTolgee } from "@tolgee/react";

export default function AudioSelector() {
    const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
    const { selectedAudioFile, setSelectedAudioFile } = useSelectedAudioFile()!;
    const { t } = useTolgee();

    const refreshAudioFiles = useCallback(() => {
        AudioFile.getAudioFilesDetails().then((audioFiles) => {
            setAudioFiles(audioFiles);
        });
    }, [setAudioFiles]);

    const handleSelectChange = useCallback(
        (value: string) => {
            const selectedAudioFileId = parseInt(value);
            AudioFile.setSelectedAudioFile(selectedAudioFileId).then(
                (audioFile) => {
                    setSelectedAudioFile(audioFile);
                },
            );
        },
        [setSelectedAudioFile],
    );

    const handleDelete = useCallback(
        (audioFileId: number) => {
            AudioFile.deleteAudioFile(audioFileId).then((newSelectedFile) => {
                if (newSelectedFile) {
                    setSelectedAudioFile(newSelectedFile);
                }
                refreshAudioFiles();
            });
            toast.success(
                t("music.deleteSuccess", {
                    fileName: selectedAudioFile?.nickname,
                }),
            );
        },
        [
            refreshAudioFiles,
            selectedAudioFile?.nickname,
            setSelectedAudioFile,
            t,
        ],
    );

    useEffect(() => {
        refreshAudioFiles();
    }, [refreshAudioFiles, selectedAudioFile]);

    return (
        <div className="flex flex-col gap-12">
            <h5 className="text-h5 leading-none">
                <T keyName="music.audio" />
            </h5>
            <div className="flex items-center justify-between gap-8 px-12">
                <label
                    htmlFor="audio-selector"
                    className="text-body text-text/80 w-full"
                >
                    <T keyName="music.audioFile" />
                </label>
                <div id="audio-selector" onClick={refreshAudioFiles}>
                    <Select
                        onValueChange={handleSelectChange}
                        value={`${selectedAudioFile?.id}`}
                    >
                        <SelectTriggerButton
                            label={
                                selectedAudioFile?.nickname || t("music.import")
                            }
                            className="w-[384px] px-12"
                        />
                        <SelectContent>
                            <RegisteredActionButton
                                registeredAction={
                                    RegisteredActionsObjects.launchInsertAudioFileDialogue
                                }
                                showTooltip={false}
                                className="text-text"
                            >
                                <T keyName="music.importAudioFile" />
                            </RegisteredActionButton>
                            {audioFiles.length > 0 && <SelectSeparator />}
                            {audioFiles.map((audioFile) => (
                                <div
                                    key={audioFile.id}
                                    className="grid grid-cols-2 text-xs text-wrap"
                                >
                                    <SelectItem value={`${audioFile.id}`}>
                                        {audioFile.nickname}
                                    </SelectItem>
                                </div>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <div className="flex justify-end py-8">
                <AlertDialog>
                    <AlertDialogTrigger>
                        <Button
                            variant="secondary"
                            disabled={
                                audioFiles.length === 0 || !selectedAudioFile
                            }
                        >
                            <TrashIcon /> <T keyName="music.deleteAudioFile" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogTitle>
                            <T keyName="music.deleteAudioFile" />
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            <T keyName="music.deleteAudioFileDescription" />
                            <div className="border-border bg-bg-1 border-stroke text-text overflow-auto rounded-md border p-16 font-mono text-wrap">
                                {selectedAudioFile?.nickname}
                            </div>
                        </AlertDialogDescription>
                        <div className="flex justify-end gap-8">
                            <AlertDialogCancel>
                                <Button variant="secondary" size="compact">
                                    <T keyName="music.cancel" />
                                </Button>
                            </AlertDialogCancel>
                            <AlertDialogAction>
                                <Button
                                    variant="red"
                                    size="compact"
                                    onClick={() => {
                                        if (selectedAudioFile)
                                            handleDelete(selectedAudioFile.id);
                                    }}
                                >
                                    <T keyName="music.delete" />
                                </Button>
                            </AlertDialogAction>
                        </div>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
}
