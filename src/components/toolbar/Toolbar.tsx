import FileControls from "./sections/FileControls";
import PlaybackControls from "./sections/PlaybackControls";
import UiSettingsToolbar from "./sections/UiSettingsToolbar";
// import ExportCoordinatesModal from "../exporting/ExportCoordinatesModal";
import AlignmentToolbar from "./sections/AlignmentToolbar";
import PageListModal from "@/components/page/PageListModal";
import MusicModal from "@/components/music/MusicModal";
import MarchersModal from "@/components/marcher/MarchersModal";
import ToolbarSection from "@/components/toolbar/ToolbarSection";

function Topbar() {
    return (
        <div className="flex w-full flex-wrap gap-8">
            <FileControls />
            <PlaybackControls />
            <ToolbarSection>
                <MarchersModal />
                <PageListModal />
                <MusicModal />
            </ToolbarSection>
            <UiSettingsToolbar />
            <AlignmentToolbar />
            {/* maybe just have this in the menubar (file > export)
                <ToolbarSection>
                    <ExportCoordinatesModal />
                </ToolbarSection>
             */}
        </div>
    );
}

export default Topbar;
