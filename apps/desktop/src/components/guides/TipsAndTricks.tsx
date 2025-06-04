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
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <div className="flex items-center justify-between">
                <h4 className="text-h4 leading-none">Tips and Tricks</h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <X size={24} />
                </button>
            </div>

            <div className="flex grow flex-col gap-8 overflow-scroll">
                <StyledMarkdown>{TipsAndTricksMarkdown}</StyledMarkdown>
            </div>
        </div>
    );
}
