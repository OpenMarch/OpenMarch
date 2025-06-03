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
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <FolderOpenIcon size={24} />
                    Open File
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.launchNewFileDialogue
                    }
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <FileIcon size={24} />
                    New File
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.launchSaveFileDialogue
                    }
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <FloppyDiskIcon size={24} />
                    Save File
                </RegisteredActionButton>
            </ToolbarSection>
            <ToolbarSection>
                <button
                    onClick={api.performUndo}
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <ArrowUUpLeftIcon size={24} />
                    Undo
                </button>
                <button
                    onClick={api.performRedo}
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
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
