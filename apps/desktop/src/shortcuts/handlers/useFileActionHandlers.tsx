import { toast } from "sonner";
import { T, useTolgee } from "@tolgee/react";
import { AlertDialogAction, AlertDialogCancel, Button } from "@openmarch/ui";
import { CircleNotchIcon } from "@phosphor-icons/react";
import AudioFile from "@/global/classes/AudioFile";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import { useAlertModalStore } from "@/stores/AlertModalStore";
import { requestOpenNewShowDialog } from "@/utilities/openNewShowDialog";
import { useActionHandler } from "../useActionHandler";

// eslint-disable-next-line max-lines-per-function
export function useFileActionHandlers() {
    const { t } = useTolgee();
    const {
        setTitle: setAlertModalTitle,
        setContent: setAlertModalContent,
        setActions: setAlertModalActions,
        setOpen: setAlertModalOpen,
    } = useAlertModalStore();
    const selectedAudioFileContext = useSelectedAudioFile();
    const setSelectedAudioFile =
        selectedAudioFileContext?.setSelectedAudioFile ?? (() => {});

    useActionHandler("launchLoadFileDialogue", () => {
        void window.electron.databaseLoad();
    });

    useActionHandler("launchSaveFileDialogue", () => {
        // Set alert modal with help text to confirm the user wants to save a copy
        setAlertModalTitle("fileTab.saveFile");
        setAlertModalContent(<T keyName="fileTab.saveCopyDialogDescription" />);
        setAlertModalActions(
            <div className="flex justify-end gap-16">
                <AlertDialogAction>
                    <Button
                        variant="primary"
                        onClick={(e) => {
                            e.preventDefault();

                            setAlertModalContent(
                                <div className="my-16 flex h-full w-full flex-col items-center justify-center gap-8 self-center">
                                    <CircleNotchIcon
                                        size={32}
                                        aria-label={t(
                                            "fileTab.saveSpinnerText",
                                        )}
                                        className="text-text my-8 animate-spin"
                                    />
                                    <T keyName="fileTab.saveSpinnerText" />
                                </div>,
                            );

                            setAlertModalActions(undefined);

                            window.electron
                                .databaseSave()
                                .then((response) => {
                                    setAlertModalOpen(false);

                                    // User canceled dialog
                                    if (response === 0) {
                                        return;
                                    } else if (response === 200) {
                                        toast.success(
                                            t("fileTab.toasts.success"),
                                        );
                                    } else {
                                        toast.error(t("fileTab.toasts.error"));
                                    }
                                })
                                .catch((err: Error) => {
                                    setAlertModalOpen(false);
                                    toast.error(
                                        `${t("fileTab.toasts.error")}. Error ${err.message}`,
                                    );
                                });
                        }}
                    >
                        <T keyName="fileTab.saveFile" />
                    </Button>
                </AlertDialogAction>
                <AlertDialogCancel>
                    <Button
                        variant="secondary"
                        onClick={() => setAlertModalOpen(false)}
                    >
                        <T keyName="fileTab.saveFileCancel" />
                    </Button>
                </AlertDialogCancel>
            </div>,
        );
        setAlertModalOpen(true);
    });

    useActionHandler("launchNewFileDialogue", () => {
        void requestOpenNewShowDialog();
    });

    useActionHandler("launchInsertAudioFileDialogue", () => {
        window.electron
            .databaseIsReady()
            .then(async (dbReady) => {
                if (!dbReady) {
                    toast.error(
                        "No file is open. Create or open a show first.",
                    );
                    return;
                }

                const response =
                    await window.electron.launchInsertAudioFileDialogue();
                if (response?.success) {
                    AudioFile.getSelectedAudioFile().then((audioFile) => {
                        const selectedAudioFileWithoutAudio = {
                            ...audioFile,
                            data: undefined,
                        };
                        setSelectedAudioFile(selectedAudioFileWithoutAudio);
                    });
                    window.dispatchEvent(new CustomEvent("audioFilesUpdated"));
                    toast.success("Audio file uploaded successfully");
                } else {
                    const errorMessage =
                        response?.error?.message ||
                        "Failed to upload audio file";
                    toast.error(errorMessage);
                    console.error(
                        "Error uploading audio file:",
                        response?.error,
                    );
                }
            })
            .catch((error) => {
                console.error(
                    "Error checking database or uploading audio file:",
                    error,
                );
                toast.error(
                    error instanceof Error
                        ? error.message
                        : "Failed to upload audio file",
                );
            });
    });
}
