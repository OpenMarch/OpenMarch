import {
    CheckCircleIcon,
    WarningIcon,
    SealWarningIcon,
    InfoIcon,
    CircleNotchIcon,
} from "@phosphor-icons/react";
import { Toaster as ToasterPrimitive } from "sonner";

export default function Toaster() {
    return (
        <ToasterPrimitive
            visibleToasts={6}
            toastOptions={{
                unstyled: true,
                classNames: {
                    title: "text-body text-text leading-none",
                    description: "text-sub text-text",
                    // With two buttons (a `cancel` beside the action) the toast wraps: the text keeps
                    // the first line, and the buttons go on their own line underneath
                    toast: "p-20 flex gap-8 bg-modal rounded-6 border border-stroke font-sans w-full backdrop-blur-md shadow-modal [&:has([data-cancel])]:flex-wrap",
                    // Beside the icon (24 px and the 8 px gap, with room to spare so rounding never wraps
                    // it; it grows into the rest), or the whole width without one. Sonner
                    // renders the cancel as `[data-cancel]`
                    content:
                        "min-w-0 flex-1 [[data-sonner-toast]:has([data-cancel])_&]:basis-[calc(100%-40px)] [[data-sonner-toast]:has([data-cancel]):not(:has([data-icon]))_&]:basis-full",
                    // The action keeps to one line beside the text, so a long message never squeezes
                    // its label into a column
                    actionButton:
                        "shrink-0 self-center whitespace-nowrap rounded-6 px-8 py-4 text-body text-accent hover:underline focus-visible:outline-none focus-visible:ring focus-visible:ring-accent",
                    // A second, quieter button before the action (sonner's `cancel`); it starts the
                    // buttons' line and pushes both to the right
                    cancelButton:
                        "ml-auto shrink-0 self-center whitespace-nowrap rounded-6 px-8 py-4 text-body text-text hover:underline focus-visible:outline-none focus-visible:ring focus-visible:ring-accent",
                },
            }}
            icons={{
                success: <CheckCircleIcon size={24} className="text-green" />,
                info: <InfoIcon size={24} className="text-text" />,
                warning: <WarningIcon size={24} className="text-yellow" />,
                error: <SealWarningIcon size={24} className="text-red" />,
                loading: <CircleNotchIcon size={24} className="text-text" />,
            }}
        />
    );
}
