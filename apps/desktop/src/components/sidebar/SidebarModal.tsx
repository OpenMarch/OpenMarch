import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { type ReactNode, useEffect, useState } from "react";

export default function SidebarModal() {
    const { isOpen, content, setOpen } = useSidebarModalStore();
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = () => {
        setIsFocused(true);
    };

    const handleBlur = () => {
        setIsFocused(false);
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isFocused && event.key === "Escape") {
                setOpen(false);
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
            className={`rounded-6 border-stroke bg-modal shadow-fg-1 backdrop-blur-32 absolute top-0 left-0 z-40 h-full min-h-0 max-w-[35rem] border p-12 outline-hidden ${
                isOpen ? "animate-scale-in" : "hidden"
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
            className="hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
        >
            {buttonLabel}
        </button>
    );
}
