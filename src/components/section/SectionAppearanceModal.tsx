import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import { X } from "@phosphor-icons/react";
import SectionAppearanceList from "./SectionAppearanceList";

export default function SectionAppearanceModal() {
    return (
        <SidebarModalLauncher
            contents={<SectionAppearanceListContents />}
            buttonLabel="Sections"
        />
    );
}

export function SectionAppearanceListContents() {
    const { toggleOpen } = useSidebarModalStore();

    return (
        <div className="flex w-fit animate-scale-in flex-col gap-16 text-text">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">Section Styles</h4>
                <button
                    onClick={toggleOpen}
                    className="duration-150 ease-out hover:text-red"
                >
                    <X size={24} />
                </button>
            </header>
            <SectionAppearanceList />
        </div>
    );
}
