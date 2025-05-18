import { SidebarModalLauncher } from "../sidebar/SidebarModal";
import TipsAndTricksMarkdown from "./TipsAndTricks.md?raw";
import StyledMarkdown from "../ui/StyledMarkdown";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { X } from "@phosphor-icons/react";

export default function TipsAndTricks() {
    return (
        <SidebarModalLauncher
            contents={<TipsAndTricksContents />}
            buttonLabel="Tips and Tricks"
        />
    );
}

function TipsAndTricksContents() {
    const { toggleOpen } = useSidebarModalStore();

    return (
        <div className="flex w-fit animate-scale-in flex-col gap-16 text-text">
            <div className="flex items-center justify-between">
                <h4 className="text-h4 leading-none">Tips and Tricks</h4>
                <button
                    onClick={toggleOpen}
                    className="duration-150 ease-out hover:text-red"
                >
                    <X size={24} />
                </button>
            </div>
            <div className="flex flex-col gap-8">
                <StyledMarkdown>{TipsAndTricksMarkdown}</StyledMarkdown>
            </div>
        </div>
    );
}
