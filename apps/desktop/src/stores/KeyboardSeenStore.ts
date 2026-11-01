import { useSyncExternalStore } from "react";
import { useIsTouchMode } from "@/stores/InputModeStore";

/**
 * Whether a hardware keyboard has been used in this window. Until then, a
 * tablet's tips leave out shortcut keycaps, which mean nothing without one.
 *
 * Keys typed into a text field don't count (an on-screen keyboard types
 * there), nor do IME composition keys.
 */
let seen = false;
let installed = false;
const listeners = new Set<() => void>();

const isEditable = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return (
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
    );
};

const onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.key === "Process") return;
    if (event.key === "Unidentified" || isEditable(event.target)) return;
    markKeyboardSeen();
};

export function markKeyboardSeen(): void {
    if (seen) return;
    seen = true;
    window.removeEventListener("keydown", onKeyDown, true);
    listeners.forEach((listener) => listener());
}

/** For tests. */
export function resetKeyboardSeen(): void {
    seen = false;
    installed = false;
    window.removeEventListener("keydown", onKeyDown, true);
    listeners.forEach((listener) => listener());
}

export const hasKeyboardBeenSeen = (): boolean => seen;

const subscribe = (listener: () => void) => {
    if (!installed && !seen && typeof window !== "undefined") {
        installed = true;
        window.addEventListener("keydown", onKeyDown, true);
    }
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const useKeyboardSeen = (): boolean =>
    useSyncExternalStore(subscribe, hasKeyboardBeenSeen, () => false);

/** Show shortcut keycaps: always with a mouse layout, in touch mode once a keyboard has been used. */
export function useShowShortcutHints(): boolean {
    const isTouch = useIsTouchMode();
    const keyboardSeen = useKeyboardSeen();
    return !isTouch || keyboardSeen;
}
