import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import clsx from "clsx";
import { type ReactNode, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { TouchCaption } from "@/components/ui/InfoTip";
import { FIELD_EDIT_PANEL_ID } from "@/field/editMode/fieldEditPanelId";

export default function SidebarModal() {
    const { isOpen, content, contentId, setOpen } = useSidebarModalStore();
    // The Field panel takes room beside the field instead of covering it, so the field fits in
    // the room left and its rulers stay in view (#824)
    const besideField = contentId === FIELD_EDIT_PANEL_ID;
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = () => {
        setIsFocused(true);
    };

    const handleBlur = () => {
        setIsFocused(false);
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // The Field panel's Escape is the Edit field mode's: it closes a line's menu or
            // popover, then drops the pick, and only then closes the panel (#824)
            if (
                useSidebarModalStore.getState().contentId ===
                FIELD_EDIT_PANEL_ID
            )
                return;
            if (event.key === "Escape") {
                setOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [setOpen, isFocused]);

    if (!isOpen) return null;

    return (
        <div
            tabIndex={0}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={clsx(
                "rounded-6 border-stroke bg-modal shadow-fg-1 backdrop-blur-32 animate-scale-in flex h-full min-h-0 max-w-[36rem] overflow-hidden border p-12 outline-hidden",
                besideField
                    ? "relative ml-8 shrink-0"
                    : "touch:left-[96px] absolute top-0 left-[50px] z-40",
            )}
        >
            {content}
        </div>
    );
}

export function SidebarModalLauncher({
    buttonLabel,
    name,
    contents,
    newContentId,
    className,
    ariaLabel,
    testId,
}: {
    buttonLabel: string | ReactNode;
    /** What the button opens, e.g. "Marchers": its accessible name, and its caption in touch mode. */
    name?: string;
    contents: ReactNode;
    newContentId: string;
    className?: string;
    /** For icon-only labels. */
    ariaLabel?: string;
    testId?: string;
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
            aria-label={ariaLabel ?? name}
            title={name}
            className={twMerge(
                clsx(
                    "hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50",
                    name !== undefined &&
                        "touch:flex touch:min-h-44 touch:w-full touch:flex-col touch:items-center touch:justify-center touch:gap-2",
                    { "text-accent": isOpen && contentId === newContentId },
                    className,
                ),
            )}
            id={"sidebar-launcher-" + newContentId}
            data-testid={testId}
        >
            {buttonLabel}
            {name !== undefined && (
                <TouchCaption className="max-w-full text-center leading-tight whitespace-normal">
                    {name}
                </TouchCaption>
            )}
        </button>
    );
}
