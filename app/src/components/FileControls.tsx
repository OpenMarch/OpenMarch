import { Button, ButtonGroup } from "react-bootstrap";
import { FaFileExport, FaFolderOpen, FaRedo, FaSave, FaUndo } from "react-icons/fa";

function FileControls() {
    return (
        <div className="file-controls mx-2">
            <ButtonGroup aria-label="File controls">
                < Button variant="secondary" size="sm" > <FaSave /></Button >
                <Button variant="secondary" size="sm"><FaFolderOpen /></Button>
                <Button variant="secondary" size="sm"><FaFileExport /></Button>
                <Button variant="secondary" size="sm"><FaUndo /></Button>
                <Button variant="secondary" size="sm"><FaRedo /></Button>
            </ButtonGroup >
        </div >
    );
}

export default FileControls;
