import {
    CheckCircleIcon,
    WarningIcon,
    SealWarningIcon,
    InfoIcon,
    CircleNotchIcon,
} from "@phosphor-icons/react";
import { Toaster as ToasterPrimitive } from "sonner";

/**
 * Compact toasts in the window's bottom-right corner: tight padding, 16px icon, 320px wide (sonner's
 * is 356px), 12px from the edges. There they cover the inspector's bottom, clear of the timeline (it stops
 * at the inspector's edge) and its +; floating above the timeline put them over the field. Sonner swaps in its mobile offset and full
 * width at 600px or narrower (a small window, the web editor), so that offset is 12px too.
 */
export default function Toaster() {
    return (
        <ToasterPrimitive
            visibleToasts={6}
            offset={12}
            mobileOffset={12}
            style={{ "--width": "320px" } as React.CSSProperties}
            toastOptions={{
                unstyled: true,
                classNames: {
                    title: "text-body text-text leading-tight",
                    description: "text-sub text-text-subtitle leading-tight",
                    // With two buttons (a `cancel` beside the action) the toast wraps: the text keeps
                    // the first line, and the buttons go on their own line underneath
                    toast: "px-12 py-8 flex items-center gap-8 bg-modal rounded-6 border border-stroke font-sans w-full backdrop-blur-md shadow-modal [&:has([data-cancel])]:flex-wrap",
                    // Centered on a one-line toast; with a description the icon stays by the title
                    // (16 px in its 17.5 px line)
                    icon: "[[data-sonner-toast]:has([data-description])_&]:self-start [[data-sonner-toast]:has([data-description])_&]:mt-[1px]",
                    // Beside the icon (16 px and the 8 px gap, with room to spare so rounding never wraps
                    // it; it grows into the rest), or the whole width without one. Sonner
                    // renders the cancel as `[data-cancel]`
                    content:
                        "min-w-0 flex-1 [[data-sonner-toast]:has([data-cancel])_&]:basis-[calc(100%-32px)] [[data-sonner-toast]:has([data-cancel]):not(:has([data-icon]))_&]:basis-full",
                    // The action keeps to one line beside the text, so a long message never squeezes
                    // its label into a column
                    actionButton:
                        "shrink-0 self-center whitespace-nowrap rounded-6 px-6 py-2 text-body text-accent hover:underline focus-visible:outline-none focus-visible:ring focus-visible:ring-accent",
                    // A second, quieter button before the action (sonner's `cancel`); it starts the
                    // buttons' line and pushes both to the right
                    cancelButton:
                        "ml-auto shrink-0 self-center whitespace-nowrap rounded-6 px-6 py-2 text-body text-text hover:underline focus-visible:outline-none focus-visible:ring focus-visible:ring-accent",
                },
            }}
            icons={{
                success: <CheckCircleIcon size={16} className="text-green" />,
                info: <InfoIcon size={16} className="text-text" />,
                warning: <WarningIcon size={16} className="text-yellow" />,
                error: <SealWarningIcon size={16} className="text-red" />,
                loading: <CircleNotchIcon size={16} className="text-text" />,
            }}
        />
    );
}
