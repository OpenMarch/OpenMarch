import { useSyncExternalStore } from "react";

/**
 * In touch mode the toolbar's tab row (File · Alignment · Select · View) lives
 * in the title bar, so the top of a tablet screen is one row. The title bar
 * registers this element; the toolbar portals its tabs into it.
 */
let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

export function setToolbarTabsSlot(element: HTMLElement | null): void {
    if (slot === element) return;
    slot = element;
    listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const useToolbarTabsSlot = (): HTMLElement | null =>
    useSyncExternalStore(
        subscribe,
        () => slot,
        () => null,
    );
