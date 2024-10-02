import FileControls from "./sections/FileControls";
import PlaybackControls from "./sections/PlaybackControls";
import UiSettingsToolbar from "./sections/UiSettingsToolbar";
import ExportCoordinatesModal from "../exporting/ExportCoordinatesModal";
import AlignmentToolbar from "./sections/AlignmentToolbar";
import PageListModal from "@/components/page/PageListModal";
import MusicModal from "@/components/music/MusicModal";
import MarcherListModal from "@/components/marcher/MarcherListModal";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import { useSidebarModalStore } from "@/stores/ui/sidebarModalStore";

function Topbar() {
    const { toggleOpen } = useSidebarModalStore();
    return (
        <div className="flex w-full flex-wrap gap-8">
            {/* <FileControls /> */}
            <PlaybackControls />
            <ToolbarSection>
                <MarcherListModal />
                <PageListModal />
                <MusicModal />
            </ToolbarSection>
            <UiSettingsToolbar />
            <AlignmentToolbar />
            <ToolbarSection>
                <ExportCoordinatesModal />
            </ToolbarSection>
            <button className="text-text" onClick={toggleOpen}>
                toggle sidebar modal
            </button>
        </div>
    );
}

export default Topbar;
