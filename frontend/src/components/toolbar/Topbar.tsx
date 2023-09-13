import { FileControls } from './FileControls';
import { PlaybackControls } from './PlaybackControls';
import { NewMarcherForm } from './NewMarcherForm';
import { NewPageForm } from './NewPageForm';

export function Topbar() {
    return (
        <div className="topbar">
            Jeff
            <div className="toolbar-left">
                <FileControls />
                <PlaybackControls />
            </div>

            <div className="toolbar-right">
                <NewMarcherForm />
                <NewPageForm />
            </div>
        </div>
    );
}
