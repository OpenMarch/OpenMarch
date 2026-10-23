import MusicModal from "@/components/music/MusicModal";
import FieldModal from "@/components/field/FieldModal";
import MarchersModal from "@/components/marcher/MarchersModal";
import MetronomeModal from "@/components/music/MetronomeModal";
import WorkspaceSettingsModal from "@/components/sidebar/WorkspaceSettingsModal";
import AppearanceModal from "@/components/marcher/appearance/AppearanceModal";
import MobileExportModal from "../mobile/MobileExportModal";
import { isWebBuild } from "@/utilities/webBuild";

export default function Sidebar() {
    return (
        <div
            id="sidebar"
            className="bg-fg-1 border-stroke rounded-6 touch:w-[80px] touch:overflow-y-auto touch:items-stretch flex h-full w-fit flex-col justify-between border px-8 py-16"
        >
            <div className="flex flex-col gap-16">
                <MarchersModal />
                <MusicModal />
                <FieldModal />
                <MetronomeModal />
                <AppearanceModal />
            </div>
            <div className="flex flex-col gap-16">
                {/* Uploading to the mobile app needs sign-in, which needs Electron. */}
                {!isWebBuild && <MobileExportModal />}
                <WorkspaceSettingsModal />
            </div>
        </div>
    );
}
