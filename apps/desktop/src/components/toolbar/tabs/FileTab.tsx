import ToolbarSection from "../ToolbarSection";
import {
    FileIcon,
    FolderOpenIcon,
    ArrowUUpLeftIcon,
    ArrowUUpRightIcon,
    FloppyDiskIcon,
    SignOutIcon,
    ArrowSquareOutIcon,
    GearSixIcon,
} from "@phosphor-icons/react";
import ActionButton from "@/shortcuts/ActionButton";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { T } from "@tolgee/react";
import {
    canUndoQueryOptions,
    canRedoQueryOptions,
    usePerformHistoryAction,
} from "@/hooks/queries/useHistory";
import { useQuery } from "@tanstack/react-query";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";

export function FileTab() {
    const { isFullscreen } = useFullscreenStore();
    const databaseReady = useDatabaseReady();
    const { data: canUndo } = useQuery(canUndoQueryOptions(databaseReady));
    const { data: canRedo } = useQuery(canRedoQueryOptions(databaseReady));
    const { mutate: performHistoryAction } = usePerformHistoryAction();
    return (
        <div className="flex w-full flex-wrap gap-8">
            <ToolbarSection>
                <ActionButton
                    action="launchLoadFileDialogue"
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <FolderOpenIcon size={24} />
                    <T keyName="fileTab.openFile" />
                </ActionButton>
                <ActionButton
                    action="launchNewFileDialogue"
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <FileIcon size={24} />
                    <T keyName="fileTab.newFile" />
                </ActionButton>
                <ActionButton
                    action="launchSaveFileDialogue"
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <FloppyDiskIcon size={24} />
                    <T keyName="fileTab.saveFile" />
                </ActionButton>
            </ToolbarSection>
            <ToolbarSection>
                <ActionButton
                    action="closeFile"
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <SignOutIcon size={24} />
                    <T keyName="fileTab.exitFile" />
                </ActionButton>
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
                <ActionButton
                    action="openExportDialog"
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <ArrowSquareOutIcon size={24} />
                    <T keyName="exportCoordinates.exportButton" />
                </ActionButton>
            </ToolbarSection>
            <ToolbarSection>
                <ActionButton
                    action="openSettings"
                    className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                >
                    <GearSixIcon size={24} />
                    <T keyName="toolbar.settings" />
                </ActionButton>
            </ToolbarSection>
        </div>
    );
}
