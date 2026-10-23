import {
    CheckCircleIcon,
    WarningIcon,
    SealWarningIcon,
    InfoIcon,
    CircleNotchIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Toaster as ToasterPrimitive } from "sonner";
import { useIsTouchMode } from "@/stores/InputModeStore";

const GAP = 8;

/**
 * Where toasts start in touch mode: just below the toolbar (or the title bar
 * when there's no toolbar), centred over the field, so they don't cover the
 * timeline, the inspector or their controls at the bottom.
 */
function useTouchToastTop(enabled: boolean): number {
    const [top, setTop] = useState(64);
    useEffect(() => {
        if (!enabled) return;
        const measure = () => {
            const anchor =
                document.querySelector("[data-toolbar]") ??
                document.querySelector(".main-app-titlebar");
            if (anchor)
                setTop(Math.round(anchor.getBoundingClientRect().bottom) + GAP);
        };
        measure();
        const observer =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(measure);
        const anchor = document.querySelector("[data-toolbar]");
        if (anchor && observer) observer.observe(anchor);
        window.addEventListener("resize", measure);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [enabled]);
    return top;
}

export default function Toaster() {
    const isTouch = useIsTouchMode();
    const touchTop = useTouchToastTop(isTouch);
    return (
        <ToasterPrimitive
            visibleToasts={6}
            {...(isTouch
                ? {
                      position: "top-center" as const,
                      offset: { top: touchTop },
                      // Short notes go quickly; ones with a button keep sonner's own time
                      duration: 2500,
                  }
                : {})}
            toastOptions={{
                unstyled: true,
                classNames: {
                    title: "text-body text-text leading-none",
                    description: "text-sub text-text",
                    toast: "p-20 flex gap-8 bg-modal rounded-6 border border-stroke font-sans w-full backdrop-blur-md shadow-modal",
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
