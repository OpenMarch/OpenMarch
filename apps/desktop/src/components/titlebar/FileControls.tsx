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
import ExportCoordinatesModal from "../exporting/ExportCoordinatesModal";

function FileControls() {
    return (
        <div className="titlebar-button flex gap-12" aria-label="File controls">
            <RegisteredActionButton
                registeredAction={
                    RegisteredActionsObjects.launchSaveFileDialogue
                }
            >
                <FloppyDiskIcon size={18} />
            </RegisteredActionButton>
            <RegisteredActionButton
                registeredAction={
                    RegisteredActionsObjects.launchLoadFileDialogue
                }
            >
                <FolderOpenIcon size={18} />
            </RegisteredActionButton>
            <RegisteredActionButton
                registeredAction={
                    RegisteredActionsObjects.launchNewFileDialogue
                }
            >
                <FileIcon size={18} />
            </RegisteredActionButton>
            <ExportCoordinatesModal />
            <button
                onClick={api.performUndo}
                className="hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
            >
                <ArrowUUpLeftIcon size={18} />
            </button>
            <button
                onClick={api.performRedo}
                className="hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
            >
                <ArrowUUpRightIcon size={18} />
            </button>
        </div>
    );
}

export default FileControls;
