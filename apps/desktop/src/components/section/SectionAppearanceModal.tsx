import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import { XIcon } from "@phosphor-icons/react";
import SectionAppearanceList from "./SectionAppearanceList";
import { UserCircleGearIcon } from "@phosphor-icons/react/dist/ssr";

export default function SectionAppearanceModal() {
    return (
        <SidebarModalLauncher
            contents={<SectionAppearanceListContents />}
            buttonLabel={<UserCircleGearIcon size={24} />}
        />
    );
}

export function SectionAppearanceListContents() {
    const { toggleOpen } = useSidebarModalStore();

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">Section Styles</h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <div className="flex grow flex-col gap-16 overflow-scroll">
                <SectionAppearanceList />
            </div>
        </div>
    );
}
