import { Button, ButtonGroup } from "react-bootstrap";
import { FaFile, FaFileExport, FaFolderOpen, FaRedo, FaSave, FaUndo } from "react-icons/fa";
import * as api from "../api/api";

function FileControls() {
    return (
        <>
            <div className="file-controls mx-2">
                <ButtonGroup aria-label="File controls">
                    <Button variant="secondary" size="sm" onClick={api.launchSaveFileDialogue}>
                        <FaSave />
                    </Button >
                    <Button variant="secondary" size="sm" onClick={api.launchLoadFileDialogue}>
                        <FaFolderOpen />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={api.launchNewFileDialogue}>
                        <FaFile />
                    </Button>
                </ButtonGroup >
            </div >
            <div className="history-controls mx-2">
                <ButtonGroup aria-label="History controls">
                    <Button variant="secondary" size="sm" onClick={api.performUndo}>
                        <FaUndo />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={api.performRedo}>
                        <FaRedo />
                    </Button>
                </ButtonGroup >

            </div >
        </>
    );
}

export default FileControls;
