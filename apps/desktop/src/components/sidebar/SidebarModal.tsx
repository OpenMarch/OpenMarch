import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import clsx from "clsx";
import { type ReactNode, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

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
            if (event.key === "Escape") {
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
            className={`rounded-6 border-stroke bg-modal shadow-fg-1 backdrop-blur-32 absolute top-0 left-[50px] z-40 h-full min-h-0 max-w-[36rem] overflow-hidden border p-12 outline-hidden ${
                isOpen ? "animate-scale-in flex" : "hidden"
            }`}
        >
            {content}
        </div>
    );
}

export function SidebarModalLauncher({
    buttonLabel,
    contents,
    newContentId,
    className,
}: {
    buttonLabel: string | ReactNode;
    contents: ReactNode;
    newContentId: string;
    className?: string;
}) {
    const { toggleOpen, setContent, isOpen, contentId } =
        useSidebarModalStore();
    return (
        <button
            onClick={() => {
                if (isOpen && contentId === newContentId) {
                    toggleOpen(); // close if already open with same content
                } else {
                    setContent(contents, newContentId);
                    if (!isOpen) toggleOpen(); // open if not already open
                }
            }}
            className={twMerge(
                clsx(
                    "hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50",
                    { "text-accent": isOpen && contentId === newContentId },
                    className,
                ),
            )}
            id={"sidebar-launcher-" + newContentId}
        >
            {buttonLabel}
        </button>
    );
}
