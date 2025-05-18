import AudioSelector from "./AudioSelector";
import { SidebarModalLauncher } from "../sidebar/SidebarModal";
import { X } from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";

export default function MusicModal() {
    return (
        <SidebarModalLauncher
            contents={<MusicModalContents />}
            buttonLabel="Music"
        />
    );
}

function MusicModalContents() {
    const { toggleOpen } = useSidebarModalStore();
    return (
        <div className="animate-scale-in text-text flex w-fit flex-col gap-16">
            <header className="flex justify-between gap-24">
                <h4 className="text-h4 leading-none">Music</h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <X size={24} />
                </button>
            </header>
            {/* <div id="measure editing container">
                <MeasureEditor />
            </div> */}
            <div className="flex flex-col gap-16">
                <AudioSelector />
            </div>
        </div>
    );
}
