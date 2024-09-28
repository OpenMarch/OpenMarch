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
import ToolbarSection from "@/components/toolbar/ToolbarSection";

function FileControls() {
    return (
        <ToolbarSection aria-label="File controls">
            {/* <ButtonGroup aria-label="File controls" className={className}> */}
            <RegisteredActionButton
                registeredAction={
                    RegisteredActionsObjects.launchSaveFileDialogue
                }
            >
                <FloppyDisk size={24} />
            </RegisteredActionButton>
            <RegisteredActionButton
                registeredAction={
                    RegisteredActionsObjects.launchLoadFileDialogue
                }
            >
                <FolderOpen size={24} />
            </RegisteredActionButton>
            <RegisteredActionButton
                registeredAction={
                    RegisteredActionsObjects.launchNewFileDialogue
                }
            >
                <File size={24} />
            </RegisteredActionButton>
            <button
                onClick={api.performUndo}
                className="duration-150 ease-out hover:text-accent disabled:opacity-50"
            >
                <ArrowUUpLeft size={24} />
            </button>
            <button
                onClick={api.performRedo}
                className="duration-150 ease-out hover:text-accent disabled:opacity-50"
            >
                <ArrowUUpRight size={24} />
            </button>
        </ToolbarSection>
    );
}

export default FileControls;
