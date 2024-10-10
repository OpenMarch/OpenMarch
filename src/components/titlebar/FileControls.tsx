import {
    File,
    FolderOpen,
    ArrowUUpLeft,
    ArrowUUpRight,
    FloppyDisk,
} from "@phosphor-icons/react";
import * as api from "@/api/api";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "@/components/RegisteredActionButton";

function FileControls() {
    return (
        <div className="titlebar-button flex gap-12" aria-label="File controls">
            <RegisteredActionButton
                registeredAction={
                    RegisteredActionsObjects.launchSaveFileDialogue
                }
            >
                <FloppyDisk size={18} />
            </RegisteredActionButton>
            <RegisteredActionButton
                registeredAction={
                    RegisteredActionsObjects.launchLoadFileDialogue
                }
            >
                <FolderOpen size={18} />
            </RegisteredActionButton>
            <RegisteredActionButton
                registeredAction={
                    RegisteredActionsObjects.launchNewFileDialogue
                }
            >
                <File size={18} />
            </RegisteredActionButton>
            <button
                onClick={api.performUndo}
                className="duration-150 ease-out hover:text-accent disabled:opacity-50"
            >
                <ArrowUUpLeft size={18} />
            </button>
            <button
                onClick={api.performRedo}
                className="duration-150 ease-out hover:text-accent disabled:opacity-50"
            >
                <ArrowUUpRight size={18} />
            </button>
        </div>
    );
}

export default FileControls;
