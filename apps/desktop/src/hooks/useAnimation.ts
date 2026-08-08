import { useCallback, useEffect } from "react";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useRenderingCallback } from "./rendering/useRenderingData";
import { subscribeToFrameClock } from "@/services/clock/frame-clock";

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
        const unsubscribe = subscribeToFrameClock((timeMs) =>
            updateCoordinates(timeMs),
        );

        return () => unsubscribe();
    }, [updateCoordinates]);
};
