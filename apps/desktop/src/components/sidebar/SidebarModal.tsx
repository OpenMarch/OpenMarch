import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import clsx from "clsx";
import { type ReactNode, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

export default function SidebarModal() {
    const { isOpen, content, setOpen, width } = useSidebarModalStore();
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

    const getWidthClass = () => {
        switch (width) {
            case "wide":
                return "max-w-[120rem]";
            case "fit":
                return "w-fit";
            default:
                return "max-w-[36rem]";
        }
    };

    return (
        <div
            tabIndex={0}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={`rounded-6 border-stroke bg-modal shadow-fg-1 backdrop-blur-32 outline-hidden absolute left-[50px] top-0 z-40 h-full min-h-0 overflow-hidden border p-12 ${getWidthClass()} ${
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
    width = "default",
}: {
    buttonLabel: string | ReactNode;
    contents: ReactNode;
    newContentId: string;
    className?: string;
    width?: "default" | "wide" | "fit";
}) {
    const { toggleOpen, setContent, isOpen, contentId, setWidth } =
        useSidebarModalStore();

    useEffect(() => {
        if (isOpen && contentId === newContentId) {
            setWidth(width);
        }
    }, [width, isOpen, contentId, newContentId, setWidth]);

    return (
        <button
            onClick={() => {
                if (isOpen && contentId === newContentId) {
                    toggleOpen();
                } else {
                    setContent(contents, newContentId, width);
                    if (!isOpen) {
                        toggleOpen();
                    }
                }
            }}
            className={twMerge(
                clsx(
                    "hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50",
                    { "text-accent": isOpen && contentId === newContentId },
                    className,
                ),
            )}
        >
            {buttonLabel}
        </button>
    );
}
