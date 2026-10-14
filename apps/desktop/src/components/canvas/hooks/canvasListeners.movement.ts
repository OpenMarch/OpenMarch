import { useEffect, useCallback } from "react";
import { fabric } from "fabric";
import { handleGroupRotating } from "@/global/classes/canvasObjects/GroupUtils";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useSelectedPage } from "@/context/SelectedPageContext";

/**
 * Snaps rotate boxes while rotating. The paths come from the resolver (useTimelinePathRender,
 * P7.10) and a drag leaves them alone; they follow once the move is written.
 */
export const useMovementListeners = ({
    canvas,
}: {
    canvas: OpenMarchCanvas | null;
}) => {
    const { selectedPage } = useSelectedPage()!;

    const handleRotate = useCallback(
        (fabricEvent: fabric.IEvent<Event>) => {
            if (!canvas || !selectedPage) return;

            // Snap rotate boxes to 15 degree increments
            handleGroupRotating(
                fabricEvent,
                fabricEvent.target as fabric.Group,
            );

            canvas.requestRenderAll();
        },
        [canvas, selectedPage],
    );

    useEffect(() => {
        if (!canvas) return;
        canvas.on("object:rotating", handleRotate);

        return () => {
            canvas.off("object:rotating", handleRotate);
        };
    }, [canvas, handleRotate]);
};
