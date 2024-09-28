import FileControls from "./sections/FileControls";
import PlaybackControls from "./sections/PlaybackControls";
import UiSettingsToolbar from "./sections/UiSettingsToolbar";
import ExportCoordinatesModal from "../exporting/ExportCoordinatesModal";
import AlignmentToolbar from "./sections/AlignmentToolbar";
import PerformersLaunchers from "./sections/PerformersLaunchers";
import ToolbarSection from "./ToolbarSection";

function Topbar() {
    return (
        <div className="flex w-full flex-wrap gap-8">
            <FileControls />
            <PlaybackControls />
            <PerformersLaunchers />
            <UiSettingsToolbar />
            <AlignmentToolbar />
            <ToolbarSection>
                <ExportCoordinatesModal />
            </ToolbarSection>
        </div>
    );
}

export default Topbar;
