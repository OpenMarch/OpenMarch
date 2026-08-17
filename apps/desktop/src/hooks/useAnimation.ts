import { useCallback, useEffect } from "react";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useRenderingCallback } from "./rendering/useRenderingData";
import {
    subscribeToFrameClock,
    useFrameClockStore,
} from "@/services/clock/frame-clock";

interface UseAnimationProps {
    canvas: OpenMarchCanvas | null;
}

export const useAnimation = ({ canvas }: UseAnimationProps) => {
    const { renderingCallback, marcherIds } = useRenderingCallback();

    const updateCoordinates = useCallback(
        (timeMs: number) => {
            if (canvas == null) {
                console.warn("Canvas is null! This should not happen");
                return;
            }

            if (marcherIds == null) {
                console.warn("marcherIds is null! This should not happen");
                return;
            }

            const coordinates = renderingCallback(timeMs);
            if (coordinates == null) {
                console.warn("coordinates are null! This should not happen!");
                return;
            }

            canvas.updateMarcherCoordinates(coordinates, marcherIds);
            canvas.requestRenderAll();
        },
        [canvas, marcherIds, renderingCallback],
    );

    useEffect(() => {
        // `subscribeToFrameClock` only fires on the *next* clock change — it never
        // replays the current time on subscribe. Paint once with whatever the clock
        // already says so the first render (and any re-render once coordinate
        // timelines reload after a mutation, since that recreates `updateCoordinates`)
        // isn't left showing stale positions until the next play or seek.
        updateCoordinates(useFrameClockStore.getState().currentTime);

        const unsubscribe = subscribeToFrameClock((timeMs) =>
            updateCoordinates(timeMs),
        );

        return () => unsubscribe();
    }, [updateCoordinates]);
};
