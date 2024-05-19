import { FaFile, FaFolderOpen, FaRedo, FaSave, FaUndo } from "react-icons/fa";
import * as api from "../../api/api";
import { topBarComponentProps } from "@/global/Interfaces";
import { useEffect, useRef } from "react";
import { useRegisteredActionsStore } from "@/stores/registeredAction/useRegisteredActionsStore";
import { RegisteredActionsEnum } from "@/utilities/RegisteredActionsHandler";

function FileControls({ className }: topBarComponentProps) {
    const { linkRegisteredAction } = useRegisteredActionsStore();
    const saveButtonRef = useRef<HTMLButtonElement>(null);
    const loadButtonRef = useRef<HTMLButtonElement>(null);
    const newButtonRef = useRef<HTMLButtonElement>(null);
    const undoButtonRef = useRef<HTMLButtonElement>(null);
    const redoButtonRef = useRef<HTMLButtonElement>(null);

    const ICON_SIZE = 16;

    useEffect(() => {
        if (saveButtonRef.current) linkRegisteredAction(RegisteredActionsEnum.launchSaveFileDialogue, saveButtonRef);
        if (loadButtonRef.current) linkRegisteredAction(RegisteredActionsEnum.launchLoadFileDialogue, loadButtonRef);
        if (newButtonRef.current) linkRegisteredAction(RegisteredActionsEnum.launchNewFileDialogue, newButtonRef);
        if (undoButtonRef.current) linkRegisteredAction(RegisteredActionsEnum.performUndo, undoButtonRef);
        if (redoButtonRef.current) linkRegisteredAction(RegisteredActionsEnum.performRedo, redoButtonRef);
    }, [linkRegisteredAction]);

    return (
        <>
            <div aria-label="File controls">

                {/* <ButtonGroup aria-label="File controls" className={className}> */}
                <button
                    className="btn-secondary rounded-l-lg"
                    ref={saveButtonRef}
                >
                    <FaSave size={ICON_SIZE} />
                </button >
                <button
                    className="btn-secondary"
                    onClick={api.launchLoadFileDialogue}
                >
                    <FaFolderOpen size={ICON_SIZE} />
                </button>
                <button
                    className="btn-secondary rounded-r-lg"
                    onClick={api.launchNewFileDialogue}
                // type="button"
                >
                    <FaFile size={ICON_SIZE} />
                </button>
                {/* </buttonGroup > */}
            </div >
            <div className="history-controls" >
                {/* <buttonGroup aria-label="History controls" className={className}> */}
                <button onClick={api.performUndo} className="btn-secondary rounded-l-lg">
                    <FaUndo size={ICON_SIZE} />
                </button>
                <button onClick={api.performRedo} className="btn-secondary rounded-r-lg">
                    <FaRedo size={ICON_SIZE} />
                </button>
                {/* </ButtonGroup > */}

            </div >
        </>
    );
}

export default FileControls;
