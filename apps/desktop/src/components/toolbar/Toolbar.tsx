import PlaybackControls from "./sections/PlaybackControls";
import UiSettingsToolbar from "./sections/UiSettingsToolbar";
import AlignmentToolbar from "./sections/AlignmentToolbar";

export default function Topbar() {
    return (
        <div className="flex w-full flex-wrap gap-8">
            <PlaybackControls />
            <UiSettingsToolbar />
            <AlignmentToolbar />
        </div>
    );
}
