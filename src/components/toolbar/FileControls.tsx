import { FaFile, FaFolderOpen, FaRedo, FaSave, FaUndo } from "react-icons/fa";
import * as api from "../../api/api";
import { topBarComponentProps } from "@/global/Interfaces";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "../RegisteredActionButton";

function FileControls({ className }: topBarComponentProps) {

    const ICON_SIZE = 16;

    return (
        <>
            <div aria-label="File controls">

                {/* <ButtonGroup aria-label="File controls" className={className}> */}
                <RegisteredActionButton
                    registeredAction={RegisteredActionsObjects.launchSaveFileDialogue}
                    className="btn-secondary rounded-none rounded-l"
                >
                    <FaSave size={ICON_SIZE} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={RegisteredActionsObjects.launchLoadFileDialogue}
                    className="btn-secondary rounded-none"
                >
                    <FaFolderOpen size={ICON_SIZE} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    registeredAction={RegisteredActionsObjects.launchNewFileDialogue}
                    className="btn-secondary rounded-none"
                >
                    <FaFile size={ICON_SIZE} />
                </RegisteredActionButton>
            </div >
            <div className="history-controls" >
                {/* <buttonGroup aria-label="History controls" className={className}> */}
                <button onClick={api.performUndo} className="btn-secondary rounded-none rounded-l">
                    <FaUndo size={ICON_SIZE} />
                </button>
                <button onClick={api.performRedo} className="btn-secondary rounded-none rounded-r">
                    <FaRedo size={ICON_SIZE} />
                </button>
                {/* </ButtonGroup > */}

            </div >
        </>
    );
}

export default FileControls;
