<<<<<<< HEAD
import MusicModal from "@/components/music/MusicModal";
import FieldModal from "@/components/field/FieldModal";
import MarchersModal from "@/components/marcher/MarchersModal";
<<<<<<< HEAD
<<<<<<< HEAD
=======
import SectionAppearanceModal from "@/components/section/SectionAppearanceModal";
<<<<<<< HEAD
import BugReport from "./BugReport";
>>>>>>> 7d8b28a (rearrange, add tabs ui component)
=======
>>>>>>> 7dbba7f (move timeline controls, polishes)
=======
>>>>>>> dfd9976 (move section styles to marchers modal)
import TipsAndTricks from "../guides/TipsAndTricks";
import Plugins from "../plugins/Plugins";
=======
import PagesModal from "@/components/page/PagesModal";
import MusicModal from "@/components/music/MusicModal";
import FieldModal from "@/components/field/FieldModal";
import MarchersModal from "@/components/marcher/MarchersModal";
import SectionAppearanceModal from "@/components/section/SectionAppearanceModal";
import BugReport from "../ui/BugReport";
import TipsAndTricks from "../guides/TipsAndTricks";
>>>>>>> 1f8fe29 (ui: add new sidebar layout, fix icon imports)

export default function Sidebar() {
    return (
        <div
            id="sidebar"
            className="bg-fg-1 border-stroke rounded-6 flex h-full w-fit flex-col justify-between border px-8 py-16"
        >
            <div className="flex flex-col gap-16">
                <MarchersModal />
<<<<<<< HEAD
<<<<<<< HEAD
=======
                <PagesModal />
>>>>>>> dfd9976 (move section styles to marchers modal)
=======
                <SectionAppearanceModal />
                <PagesModal />
>>>>>>> 1f8fe29 (ui: add new sidebar layout, fix icon imports)
                <MusicModal />
                <FieldModal />
            </div>

            <div className="flex flex-col gap-16">
                <TipsAndTricks />
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
                <Plugins />
=======
>>>>>>> 7dbba7f (move timeline controls, polishes)
=======
                <Plugins />
>>>>>>> 936ead3 (rebase main)
=======
                <BugReport />
>>>>>>> 1f8fe29 (ui: add new sidebar layout, fix icon imports)
            </div>
        </div>
    );
}
