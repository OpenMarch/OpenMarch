import PlaybackControls from "./sections/PlaybackControls";
import UiSettingsToolbar from "./sections/UiSettingsToolbar";
import AlignmentToolbar from "./sections/AlignmentToolbar";
import PagesModal from "@/components/page/PagesModal";
import MusicModal from "@/components/music/MusicModal";
import FieldModal from "@/components/field/FieldModal";
import MarchersModal from "@/components/marcher/MarchersModal";
import SectionAppearanceModal from "@/components/section/SectionAppearanceModal";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import BugReport from "../ui/BugReport";
import TipsAndTricks from "../guides/TipsAndTricks";
import Plugins from "../plugins/Plugins";

export default function Topbar() {
    return (
        <div className="flex w-full flex-wrap gap-8">
            <PlaybackControls />
            <ToolbarSection>
                <MarchersModal />
                <SectionAppearanceModal />
                <PagesModal />
                <MusicModal />
                <FieldModal />
            </ToolbarSection>
            <UiSettingsToolbar />
            <AlignmentToolbar />
            <ToolbarSection aria-label="Feedback and tips">
                <TipsAndTricks />
                <Plugins />
                <BugReport />
                <a
                    href="https://openmarch.com/about/submitting-feedback"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-accent duration-150 ease-out"
                >
                    Submit feedback
                </a>
                <a
                    href="https://store.openmarch.com"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-accent duration-150 ease-out"
                >
                    Buy Merch{" "}
                </a>
            </ToolbarSection>
        </div>
    );
}
