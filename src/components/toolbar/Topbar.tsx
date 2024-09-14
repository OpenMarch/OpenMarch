import FileControls from "./FileControls";
import PlaybackControls from "./PlaybackControls";
import MarcherListModal from "../marcher/MarcherListModal";
import PageListModal from "../page/PageListModal";
import UiSettingsToolbar from "./UiSettingsToolbar";
import ExportCoordinatesModal from "../exporting/ExportCoordinatesModal";
import AlignmentToolbar from "./AlignmentToolbar";
import MusicModal from "../music/MusicModal";
import { useCursorModeStore } from "@/stores/CursorModeStore";

function Topbar({ className = "" }: { className?: string }) {
    const { cursorMode } = useCursorModeStore();
    const componentClassName = "";
    return (
        <div
            className={` gap-2 flex bg-gray-700 w-full flex-wrap items-center p-4 m-0 overflow-y-auto ${className}`}
        >
            <FileControls className={componentClassName} />
            <PlaybackControls className={componentClassName} />
            <MarcherListModal className={componentClassName} />
            <PageListModal className={componentClassName} />
            <MusicModal className={componentClassName} />
            <UiSettingsToolbar className={`${componentClassName}`} />
            <AlignmentToolbar className={componentClassName} />
            <ExportCoordinatesModal className={componentClassName} />
            <div>Cursor mode: {cursorMode}</div>
        </div>
    );
}

export default Topbar;
