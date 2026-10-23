import { useSyncExternalStore } from "react";
import { useIsTouchMode } from "@/stores/InputModeStore";

const SHORT_SCREEN = "(max-height: 899px)";

const subscribe = (onChange: () => void) => {
    if (typeof window.matchMedia !== "function") return () => {};
    const query = window.matchMedia(SHORT_SCREEN);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
};
const isShortScreen = () =>
    typeof window.matchMedia === "function" &&
    window.matchMedia(SHORT_SCREEN).matches;

/**
 * Whether the Inspector should save height: in touch mode (bigger controls) or
 * on a short screen, e.g. a tablet in landscape. Then the notes scroll with the
 * rest, and the page section folds while marchers are selected.
 */
export function useCompactInspector(): boolean {
    const isTouch = useIsTouchMode();
    const short = useSyncExternalStore(subscribe, isShortScreen, () => false);
    return isTouch || short;
}
