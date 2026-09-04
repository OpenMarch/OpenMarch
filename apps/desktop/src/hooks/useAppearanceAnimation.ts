import { useCallback, useEffect } from "react";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useAppearanceCallback } from "./rendering/useAppearanceData";
import {
    subscribeToFrameClock,
    useFrameClockStore,
} from "@/services/clock/frame-clock";

interface UseAppearanceAnimationProps {
    canvas: OpenMarchCanvas | null;
}

/**
 * Keeps every marcher's visual appearance (fill/outline color, shape, visibility) on
 * the canvas in sync with the current playback time, sampled from the frame clock.
 *
 * Mirrors `useAnimation` (coordinates), but kept separate and composable: appearance
 * is driven by its own callback (`useAppearanceCallback`) and its own frame clock
 * subscription, rather than being tied to a page-scoped effect. See
 * `useAppearanceCallback` for why this stays cheap even though it runs every frame —
 * appearance keyframes are far sparser than coordinate keyframes.
 */
export const useAppearanceAnimation = ({
    canvas,
}: UseAppearanceAnimationProps) => {
    const { appearanceCallback, marcherIds } = useAppearanceCallback();

    const updateAppearances = useCallback(
        (timeMs: number) => {
            if (canvas == null) {
                console.warn("Canvas is null! This should not happen");
                return;
            }

            if (marcherIds == null) {
                console.warn("marcherIds is null! This should not happen");
                return;
            }

            const appearances = appearanceCallback(timeMs);
            if (appearances == null) {
                console.warn("appearances are null! This should not happen!");
                return;
            }

            canvas.updateMarcherAppearances(appearances, marcherIds);
            canvas.requestRenderAll();
        },
        [canvas, marcherIds, appearanceCallback],
    );

    useEffect(() => {
        // `subscribeToFrameClock` only fires on the *next* clock change — it never
        // replays the current time on subscribe. Paint once with whatever the clock
        // already says so the very first render (and any re-render once the
        // appearance queries finish loading, since that recreates `updateAppearances`)
        // isn't left showing stale/default appearances until the next play or seek.
        updateAppearances(useFrameClockStore.getState().currentTime);

        const unsubscribe = subscribeToFrameClock((timeMs) =>
            updateAppearances(timeMs),
        );

        return () => unsubscribe();
    }, [updateAppearances]);
};
