import { SidebarModalLauncher } from "../sidebar/SidebarModal";
import TipsAndTricksMarkdown from "./TipsAndTricks.md?raw";
import StyledMarkdown from "../ui/StyledMarkdown";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { XIcon } from "@phosphor-icons/react";
import { LightbulbIcon } from "@phosphor-icons/react/dist/ssr";

export default function TipsAndTricks() {
    return (
        <SidebarModalLauncher
            contents={<TipsAndTricksContents />}
            buttonLabel={<LightbulbIcon size={24} />}
        />
    );
}

function TipsAndTricksContents() {
    const { toggleOpen } = useSidebarModalStore();

    return (
        <div className="animate-scale-in text-text flex w-fit flex-col gap-16">
            <div className="flex items-center justify-between">
                <h4 className="text-h4 leading-none">Tips and Tricks</h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </div>
            <div className="flex flex-col gap-8">
                <StyledMarkdown>{TipsAndTricksMarkdown}</StyledMarkdown>
            </div>
        </div>
    );
}
