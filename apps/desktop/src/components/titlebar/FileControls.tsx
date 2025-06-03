import {
    FileIcon,
    FolderOpenIcon,
    ArrowUUpLeftIcon,
    ArrowUUpRightIcon,
    FloppyDiskIcon,
} from "@phosphor-icons/react";
import * as api from "@/api/api";
import { useEffect, useState } from "react";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import ExportCoordinatesModal from "../exporting/ExportCoordinatesModal";
import { useUndoRedoStore } from "@/stores/UndoRedoStore";

function FileControls() {
    const canUndo = useUndoRedoStore((s) => s.canUndo);
    const canRedo = useUndoRedoStore((s) => s.canRedo);

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
                disabled={!canUndo}
                aria-disabled={!canUndo}
            >
                <ArrowUUpLeftIcon size={18} />
            </button>
            <button
                onClick={api.performRedo}
                className="hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                disabled={!canRedo}
                aria-disabled={!canRedo}
            >
                <ArrowUUpRightIcon size={18} />
            </button>
        </div>
    );
}

export default FileControls;
