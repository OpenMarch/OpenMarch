import { Button, ButtonGroup } from "react-bootstrap";
import { FaFile, FaFileExport, FaFolderOpen, FaRedo, FaSave, FaUndo } from "react-icons/fa";
import * as api from "../api/api";
import { topBarComponentProps } from "@/Interfaces";

function FileControls({ className }: topBarComponentProps) {
    return (
        <>
            <div className="file-controls">
                <ButtonGroup aria-label="File controls" className={className}>
                    <Button variant="secondary" onClick={api.launchSaveFileDialogue}>
                        <FaSave />
                    </Button >
                    <Button variant="secondary" onClick={api.launchLoadFileDialogue}>
                        <FaFolderOpen />
                    </Button>
                    <Button variant="secondary" onClick={api.launchNewFileDialogue}>
                        <FaFile />
                    </Button>
                </ButtonGroup >
            </div >
            <div className="history-controls" >
                <ButtonGroup aria-label="History controls" className={className}>
                    <Button variant="secondary" onClick={api.performUndo}>
                        <FaUndo />
                    </Button>
                    <Button variant="secondary" onClick={api.performRedo}>
                        <FaRedo />
                    </Button>
                </ButtonGroup >

            </div >
        </>
    );
}

export default FileControls;
