/**
 * Fullscreen (projector mode, ui.md UI-5) and the overlay's auto-hide.
 */
import { useCallback, useEffect, useState } from "react";

/** The overlay hides after this long without pointer movement in fullscreen. */
export const OVERLAY_IDLE_MS = 3000;

/** Whether the window is fullscreen, and a toggle for it. */
export function useFullscreen(): {
    isFullscreen: boolean;
    toggleFullscreen: () => void;
} {
    const [isFullscreen, setIsFullscreen] = useState(
        () => !!document.fullscreenElement,
    );

    useEffect(() => {
        const onChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    const toggleFullscreen = useCallback(() => {
        const request = document.fullscreenElement
            ? document.exitFullscreen()
            : document.documentElement.requestFullscreen();
        request.catch((error: unknown) =>
            console.error("3D View: fullscreen failed", error),
        );
    }, []);

    return { isFullscreen, toggleFullscreen };
}

/**
 * True after `idleMs` without pointer movement while `enabled`. Movement shows
 * the overlay again and restarts the timer. Always false when not enabled.
 */
export function usePointerIdle(
    enabled: boolean,
    idleMs = OVERLAY_IDLE_MS,
): boolean {
    const [idle, setIdle] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setIdle(false);
            return;
        }
        let timer = window.setTimeout(() => setIdle(true), idleMs);
        const onMove = () => {
            setIdle(false);
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setIdle(true), idleMs);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerdown", onMove);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerdown", onMove);
        };
    }, [enabled, idleMs]);

    return enabled && idle;
}
