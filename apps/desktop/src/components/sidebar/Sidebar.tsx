import FieldModal from "@/components/field/FieldModal";
import MarchersModal from "@/components/marcher/MarchersModal";
import MetronomeModal from "@/components/music/MetronomeModal";
import WorkspaceSettingsModal from "@/components/sidebar/WorkspaceSettingsModal";
import AppearanceModal from "@/components/marcher/appearance/AppearanceModal";
import MobileExportModal from "../mobile/MobileExportModal";
import PropsModal from "@/components/items/PropsModal";

export default function Sidebar() {
    return (
        <div
            id="sidebar"
            className="bg-fg-1 border-stroke rounded-6 touch:w-[88px] touch:overflow-y-auto touch:items-stretch flex h-full w-fit flex-col justify-between border px-8 py-16"
        >
            <div className="flex flex-col gap-16">
                <MarchersModal />
                {/* The music is edited on the timeline: Edit music (owner, 2026-11-04) */}
                <FieldModal />
                <MetronomeModal />
                <AppearanceModal />
                <PropsModal />
            </div>
            <div className="flex flex-col gap-16">
                {/* On the web, where sign-in can't run the panel says so. */}
                <MobileExportModal />
                <WorkspaceSettingsModal />
            </div>
        </div>
    );
}
