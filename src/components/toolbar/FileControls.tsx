import {
    File,
    FolderOpen,
    ArrowUUpLeft,
    ArrowUUpRight,
    FloppyDisk,
} from "@phosphor-icons/react";
import * as api from "../../api/api";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "../RegisteredActionButton";
import ToolbarSection from "./ToolbarSection";

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
            <button onClick={api.performUndo}>
                <ArrowUUpLeft size={24} />
            </button>
            <button onClick={api.performRedo}>
                <ArrowUUpRight size={24} />
            </button>
        </ToolbarSection>
    );
}

export default FileControls;
