import ToolbarSection from "../ToolbarSection";
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
import ExportCoordinatesModal from "@/components/exporting/ExportCoordinatesModal";
import SettingsModal from "@/components/settings/SettingsModal";

export function FileTab() {
    return (
        <div className="flex w-full flex-wrap gap-8">
            <ToolbarSection>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.launchLoadFileDialogue
                    }
                >
                    <FolderOpenIcon size={24} />
                    Open File
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.launchNewFileDialogue
                    }
                >
                    <FileIcon size={24} />
                    New File
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.launchSaveFileDialogue
                    }
                >
                    <FloppyDiskIcon size={24} />
                    Save File
                </RegisteredActionButton>
            </ToolbarSection>
            <ToolbarSection>
                <button onClick={api.performUndo}>
                    <ArrowUUpLeftIcon size={24} />
                    Undo
                </button>
                <button onClick={api.performRedo}>
                    <ArrowUUpRightIcon size={24} />
                    Redo
                </button>
            </ToolbarSection>
            <ToolbarSection>
                <ExportCoordinatesModal />
            </ToolbarSection>
            <ToolbarSection>
                <SettingsModal />
            </ToolbarSection>
        </div>
    );
}
