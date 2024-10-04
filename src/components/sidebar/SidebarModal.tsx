import { useSidebarModalStore } from "@/stores/ui/sidebarModalStore";
import { ReactNode } from "react";

export default function SidebarModal() {
    const { isSidebarModalOpen, content } = useSidebarModalStore();
    return (
        <div
            className={`absolute left-0 top-0 z-40 h-full min-h-0 max-w-[35rem] rounded-6 border border-stroke bg-modal p-12 shadow-fg-1 backdrop-blur-32 ${
                isSidebarModalOpen ? "flex animate-scale-in" : "hidden"
            }`}
        >
            {content}
        </div>
    );
}

export function SidebarModalLauncher({
    buttonLabel,
    contents,
}: {
    buttonLabel: string;
    contents: ReactNode;
}) {
    const { toggleOpen, setContent } = useSidebarModalStore();
    return (
        <button
            onClick={() => {
                setContent(contents);
                toggleOpen();
            }}
            className="duration-150 ease-out hover:text-accent disabled:pointer-events-none disabled:opacity-50"
        >
            {buttonLabel}
        </button>
    );
}
