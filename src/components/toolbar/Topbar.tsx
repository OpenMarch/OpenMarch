import FileControls from "./FileControls";
import PlaybackControls from "./PlaybackControls";
import MarcherListModal from "../marcher/MarcherListModal";
import PageListModal from "../page/PageListModal";
import UiSettingsToolbar from "./UiSettingsToolbar";
import ExportCoordinatesModal from "../exporting/ExportCoordinatesModal";
import AlignmentToolbar from "./AlignmentToolbar";
import MusicModal from "../music/MusicModal";
import { useCursorModeStore } from "@/stores/cursorMode/useCursorModeStore";

function Topbar() {
    const { cursorMode } = useCursorModeStore();
    return (
        <div className="flex w-full flex-wrap gap-8">
            <FileControls />
            <PlaybackControls />
            <MarcherListModal />
            <PageListModal />
            <MusicModal />
            <UiSettingsToolbar />
            <AlignmentToolbar />
            <ExportCoordinatesModal />
            <div>Cursor mode: {cursorMode}</div>
        </div>
    );
}

export default Topbar;
