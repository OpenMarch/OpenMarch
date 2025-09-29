import ToolbarSection from "../ToolbarSection";
import {
    FileIcon,
    FolderOpenIcon,
    ArrowUUpLeftIcon,
    ArrowUUpRightIcon,
    FloppyDiskIcon,
    SignOutIcon,
} from "@phosphor-icons/react";
import * as api from "@/api/api";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import ExportCoordinatesModal from "@/components/exporting/ExportCoordinatesModal";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import SettingsModal from "../SettingsModal";
import { T } from "@tolgee/react";
import {
    canUndoQueryOptions,
    canRedoQueryOptions,
    usePerformHistoryAction,
} from "@/hooks/queries/useHistory";
import { useQuery } from "@tanstack/react-query";

export function FileTab() {
    const { isFullscreen } = useFullscreenStore();
    const { data: canUndo } = useQuery(canUndoQueryOptions);
    const { data: canRedo } = useQuery(canRedoQueryOptions);
    const { mutate: performHistoryAction } = usePerformHistoryAction();
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
                    <T keyName="fileTab.openFile" />
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.launchNewFileDialogue
                    }
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <FileIcon size={24} />
                    <T keyName="fileTab.newFile" />
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={
                        RegisteredActionsObjects.launchSaveFileDialogue
                    }
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <FloppyDiskIcon size={24} />
                    <T keyName="fileTab.saveFile" />
                </RegisteredActionButton>
            </ToolbarSection>
            <ToolbarSection>
                <button
                    onClick={api.closeCurrentFile}
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <SignOutIcon size={24} />
                    <T keyName="fileTab.exitFile" />
                </button>
            </ToolbarSection>
            {!isFullscreen && (
                <ToolbarSection>
                    <button
                        disabled={!canUndo}
                        onClick={() => performHistoryAction("undo")}
                        className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                    >
                        <ArrowUUpLeftIcon size={24} />
                        <T keyName="fileTab.undo" />
                    </button>
                    <button
                        disabled={!canRedo}
                        onClick={() => performHistoryAction("redo")}
                        className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                    >
                        <ArrowUUpRightIcon size={24} />
                        <T keyName="fileTab.redo" />
                    </button>
                </ToolbarSection>
            )}
            <ToolbarSection>
                <ExportCoordinatesModal />
            </ToolbarSection>
            <ToolbarSection>
                <SettingsModal />
            </ToolbarSection>
        </div>
    );
}
