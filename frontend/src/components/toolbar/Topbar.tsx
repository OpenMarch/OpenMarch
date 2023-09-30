import FileControls from './FileControls';
import PlaybackControls from './PlaybackControls';
import NewMarcherForm from './NewMarcherForm';
import EditPageForm from './EditPageForm';

function Topbar() {
    return (
        <div className="topbar conatiner h-10">
            <div className="toolbar-left">
                <FileControls />
                <PlaybackControls />
            </div>

            <div className="toolbar-right">
                <NewMarcherForm />
                <EditPageForm />
            </div>
        </div>
    );
}

export default Topbar;
