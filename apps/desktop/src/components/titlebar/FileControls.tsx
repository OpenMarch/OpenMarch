import {
    FileIcon,
    FolderOpenIcon,
    ArrowUUpLeftIcon,
    ArrowUUpRightIcon,
    FloppyDiskIcon,
} from "@phosphor-icons/react";
import * as api from "@/api/api";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import { useFullscreenStore } from "@/stores/FullscreenStore";

export default function FileControls() {
    const { isFullscreen } = useFullscreenStore();

    return (
        <div className="titlebar-button flex w-fit gap-8">
            <RegisteredActionButton
                registeredAction={
                    RegisteredActionsObjects.launchLoadFileDialogue
                }
                className="hover:text-accent focus-visible:text-accent outline-hidden duration-150 ease-out disabled:opacity-50"
            >
                <FolderOpenIcon size={18} />
            </RegisteredActionButton>
            <RegisteredActionButton
                registeredAction={
                    RegisteredActionsObjects.launchNewFileDialogue
                }
                className="hover:text-accent focus-visible:text-accent outline-hidden duration-150 ease-out disabled:opacity-50"
            >
                <FileIcon size={18} />
            </RegisteredActionButton>
            <RegisteredActionButton
                registeredAction={
                    RegisteredActionsObjects.launchSaveFileDialogue
                }
                className="hover:text-accent focus-visible:text-accent outline-hidden duration-150 ease-out disabled:opacity-50"
            >
                <FloppyDiskIcon size={18} />
            </RegisteredActionButton>
            {!isFullscreen && (
                <>
                    <button
                        onClick={api.performUndo}
                        className="hover:text-accent focus-visible:text-accent outline-hidden duration-150 ease-out disabled:opacity-50"
                    >
                        <ArrowUUpLeftIcon size={18} />
                    </button>
                    <button
                        onClick={api.performRedo}
                        className="hover:text-accent focus-visible:text-accent outline-hidden duration-150 ease-out disabled:opacity-50"
                    >
                        <ArrowUUpRightIcon size={18} />
                    </button>
                </>
            )}
        </div>
    );
}
