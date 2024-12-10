import PlaybackControls from "./sections/PlaybackControls";
import UiSettingsToolbar from "./sections/UiSettingsToolbar";
// import ExportCoordinatesModal from "../exporting/ExportCoordinatesModal";
import AlignmentToolbar from "./sections/AlignmentToolbar";
import PagesModal from "@/components/page/PagesModal";
import MusicModal from "@/components/music/MusicModal";
import FieldModal from "@/components/field/FieldModal";
import MarchersModal from "@/components/marcher/MarchersModal";
import ToolbarSection from "@/components/toolbar/ToolbarSection";

function Topbar() {
    return (
        <div className="flex w-full flex-wrap gap-8">
            <PlaybackControls />
            <ToolbarSection>
                <MarchersModal />
                <PagesModal />
                <MusicModal />
                <FieldModal />
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
