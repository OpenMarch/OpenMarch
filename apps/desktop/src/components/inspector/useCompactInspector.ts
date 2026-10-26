import { useIsTouchMode } from "@/stores/InputModeStore";

/**
 * Whether the Inspector should save height: only in the tablet (touch) layout,
 * where controls are bigger. Then the notes scroll with the rest, and the page
 * section folds while marchers are selected. A mouse layout is never changed,
 * however short the window.
 */
export function useCompactInspector(): boolean {
    return useIsTouchMode();
}
