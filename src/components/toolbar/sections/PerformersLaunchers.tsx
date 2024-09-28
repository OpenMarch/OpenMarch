import PageListModal from "@/components/page/PageListModal";
import MusicModal from "@/components/music/MusicModal";
import MarcherListModal from "@/components/marcher/MarcherListModal";
import ToolbarSection from "@/components/toolbar/ToolbarSection";

export default function PerformersLaunchers() {
    return (
        <ToolbarSection>
            <MarcherListModal />
            <PageListModal />
            <MusicModal />
        </ToolbarSection>
    );
}
