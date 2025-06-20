import {
    File,
    FolderOpen,
    ArrowUUpLeft,
    ArrowUUpRight,
    FloppyDisk,
} from "@phosphor-icons/react";
import * as api from "@/api/api";
import { useEffect, useState } from "react";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import ExportCoordinatesModal from "../exporting/ExportCoordinatesModal";

function FileControls() {
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    async function updateHistoryAvailability() {
        const undoLength = await window.electron.getUndoStackLength();
        const redoLength = await window.electron.getRedoStackLength();
        setCanUndo(undoLength.data > 0);
        setCanRedo(redoLength.data > 0);
    }

    useEffect(() => {
        updateHistoryAvailability();

        // DEBUG: poll every 1s to catch any missed events
        const poll = setInterval(updateHistoryAvailability, 1000);

        const handler = () => updateHistoryAvailability();
        window.electron.onHistoryAction(handler);
        window.electron.onFetch(handler);

        return () => {
            clearInterval(poll);
            window.electron.removeHistoryActionListener();
            window.electron.removeFetchListener();
        };
    }, []);

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
            <ExportCoordinatesModal />
            <button
                onClick={api.performUndo}
                className="hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                disabled={!canUndo}
                aria-disabled={!canUndo}
            >
                <ArrowUUpLeft size={18} />
            </button>
            <button
                onClick={api.performRedo}
                className="hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                disabled={!canRedo}
                aria-disabled={!canRedo}
            >
                <ArrowUUpRight size={18} />
            </button>
        </div>
    );
}

export default FileControls;
