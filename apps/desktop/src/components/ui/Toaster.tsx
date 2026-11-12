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
import { NOTE_TOAST_DURATION_MS } from "./toastDurations";

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
 *
 * On click, not pointerdown: sonner removes a dismissed toast about 200 ms
 * later, so a press held longer than that would lose its click. Presses on
 * the toast's own buttons (Undo, Back up) are left to the button, which
 * closes the toast itself.
 */
export function useTapToDismiss(enabled: boolean) {
    useEffect(() => {
        if (!enabled) return;
        const onClick = (event: MouseEvent) => {
            const target = event.target;
            if (
                target instanceof Element &&
                target.closest("[data-sonner-toast] button")
            )
                return;
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
        document.addEventListener("click", onClick, true);
        return () => document.removeEventListener("click", onClick, true);
    }, [enabled]);
}

/**
 * Compact toasts in the window's bottom-right corner: tight padding, 16px icon, 320px wide (sonner's
 * is 356px), 12px from the edges. There they cover the inspector's bottom, clear of the timeline (it stops
 * at the inspector's edge) and its +; floating above the timeline put them over the field. Sonner swaps in its mobile offset and full
 * width at 600px or narrower (a small window, the web editor), so that offset is 12px too.
 */
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
            offset={12}
            mobileOffset={12}
            style={{ "--width": "320px" } as React.CSSProperties}
            {...(isTouch
                ? {
                      position: overlayOpen
                          ? ("bottom-center" as const)
                          : ("top-center" as const),
                      offset: overlayOpen ? { bottom: 16 } : { top: touchTop },
                      className: "touch-toaster",
                      // Short notes go quickly. Toasts with a button pass their
                      // own longer duration (ACTION_TOAST_DURATION_MS or more),
                      // which wins over this default
                      duration: NOTE_TOAST_DURATION_MS,
                  }
                : {})}
            toastOptions={{
                unstyled: true,
                classNames: {
                    title: "text-body text-text leading-tight",
                    description: "text-sub text-text-subtitle leading-tight",
                    // The toast wraps: with two buttons (a `cancel` beside the action), or one too long
                    // to sit beside the text, the text keeps the first line and the buttons go on their
                    // own line underneath (#805: "Stop at the end of Page 5" squeezed the text into a column)
                    toast: "px-12 py-8 flex flex-wrap items-center gap-8 bg-modal rounded-6 border border-stroke font-sans w-full backdrop-blur-md shadow-modal",
                    // Centered on a one-line toast; with a description the icon stays by the title
                    // (16 px in its 17.5 px line)
                    icon: "[[data-sonner-toast]:has([data-description])_&]:self-start [[data-sonner-toast]:has([data-description])_&]:mt-[1px]",
                    // Beside the icon (16 px and the 8 px gap, with room to spare so rounding never wraps
                    // it; it grows into the rest), or the whole width without one. Sonner
                    // renders the cancel as `[data-cancel]`
                    content:
                        "min-w-0 flex-1 basis-[120px] [[data-sonner-toast]:has([data-cancel])_&]:basis-[calc(100%-32px)] [[data-sonner-toast]:has([data-cancel]):not(:has([data-icon]))_&]:basis-full",
                    // The action keeps to one line: beside the text while the text keeps 120 px (room for "Release notes" or "Switch to Expert"), so a
                    // long message never squeezes its label into a column; otherwise under it, at the right
                    actionButton:
                        "[[data-sonner-toast]:not(:has([data-cancel]))_&]:ml-auto shrink-0 self-center whitespace-nowrap rounded-6 px-6 py-2 text-body text-accent hover:underline focus-visible:outline-none focus-visible:ring focus-visible:ring-accent",
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
