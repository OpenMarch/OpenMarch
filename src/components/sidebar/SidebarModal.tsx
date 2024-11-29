import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { type ReactNode, useEffect, useState } from "react";

export default function SidebarModal() {
    const { isOpen, content, setOpen } = useSidebarModalStore();
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = () => {
        setIsFocused(true);
        console.log("focus");
    };

    const handleBlur = () => {
        setIsFocused(false);
        console.log("blur");
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isFocused && event.key === "Escape") {
                setOpen(false);
                console.log("asdasdasd");
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [setOpen, isFocused]);

    return (
        <div
            tabIndex={0}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={`absolute left-0 top-0 z-40 h-full min-h-0 max-w-[35rem] overflow-scroll rounded-6 border border-stroke bg-modal p-12 shadow-fg-1 backdrop-blur-32 ${
                isOpen ? "flex animate-scale-in" : "hidden"
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
    buttonLabel: string | ReactNode;
    contents: ReactNode;
}) {
    const { toggleOpen, setContent, isOpen } = useSidebarModalStore();
    return (
        <button
            onClick={() => {
                if (!isOpen) {
                    setContent(contents);
                    toggleOpen();
                } else {
                    setContent(contents);
                }
            }}
            className="outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
        >
            {buttonLabel}
        </button>
    );
}
