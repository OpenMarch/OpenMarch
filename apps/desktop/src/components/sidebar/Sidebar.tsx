
import Plugins from "../plugins/Plugins";
import MusicModal from "@/components/music/MusicModal";
import FieldModal from "@/components/field/FieldModal";
import MarchersModal from "@/components/marcher/MarchersModal";
import TipsAndTricks from "../guides/TipsAndTricks";

export default function Sidebar() {
    return (
        <div
            id="sidebar"
            className="bg-fg-1 border-stroke rounded-6 flex h-full w-fit flex-col justify-between border px-8 py-16"
        >
            <div className="flex flex-col gap-16">
                <MarchersModal />
                <MusicModal />
                <FieldModal />
            </div>

            <div className="flex flex-col gap-16">
                <TipsAndTricks />
                <Plugins />
            </div>
        </div>
    );
}
