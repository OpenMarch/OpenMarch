import {
    CheckCircleIcon,
    WarningIcon,
    SealWarningIcon,
    InfoIcon,
    CircleNotchIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast, Toaster as ToasterPrimitive } from "sonner";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
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

/** Whether a Radix dialog is open (they portal to <body>). */
function useDialogOpen(enabled: boolean): boolean {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!enabled) return;
        const check = () =>
            setOpen(
                document.querySelector('[role="dialog"][data-state="open"]') !==
                    null,
            );
        check();
        const observer = new MutationObserver(check);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["data-state"],
        });
        return () => observer.disconnect();
    }, [enabled]);
    return open;
}

/**
 * Touch mode: a toast never blocks what's under it (taps pass through, except
 * its own buttons, see the CSS below), and a tap on it dismisses it.
 */
function useTapToDismiss(enabled: boolean) {
    useEffect(() => {
        if (!enabled) return;
        const onPointerDown = (event: PointerEvent) => {
            const hit = Array.from(
                document.querySelectorAll("[data-sonner-toast]"),
            ).some((el) => {
                const r = el.getBoundingClientRect();
                return (
                    event.clientX >= r.left &&
                    event.clientX <= r.right &&
                    event.clientY >= r.top &&
                    event.clientY <= r.bottom
                );
            });
            if (hit) toast.dismiss();
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        return () =>
            document.removeEventListener("pointerdown", onPointerDown, true);
    }, [enabled]);
}

export default function Toaster() {
    const isTouch = useIsTouchMode();
    const touchTop = useTouchToastTop(isTouch);
    // With a panel or dialog open, its header (title, close X) is at the top: toasts go to the bottom
    const sidebarPanelOpen = useSidebarModalStore((state) => state.isOpen);
    const dialogOpen = useDialogOpen(isTouch);
    const overlayOpen = sidebarPanelOpen || dialogOpen;
    useTapToDismiss(isTouch);
    return (
        <ToasterPrimitive
            visibleToasts={6}
            {...(isTouch
                ? {
                      position: overlayOpen
                          ? ("bottom-center" as const)
                          : ("top-center" as const),
                      offset: overlayOpen ? { bottom: 16 } : { top: touchTop },
                      className: "touch-toaster",
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
