import { useEffect, useCallback, useRef } from "react";
import { fabric } from "fabric";
import { handleGroupRotating } from "@/global/classes/canvasObjects/GroupUtils";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useQuery } from "@tanstack/react-query";
import { marcherPagesByPageQueryOptions } from "@/hooks/queries";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useMarchersWithVisuals } from "@/hooks";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";

export const useMovementListeners = ({
    canvas,
}: {
    canvas: OpenMarchCanvas | null;
}) => {
    const { uiSettings } = useUiSettingsStore()!;
    const { selectedPage } = useSelectedPage()!;
    const { selectedMarchers } = useSelectedMarchers()!;
    const marcherVisuals = useMarchersWithVisuals();

    // MarcherPage queries
    const { data: marcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.id),
    );
    const { data: previousMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.previousPageId!),
    );
    const { data: nextMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.nextPageId!),
    );

    const frameRef = useRef<number | null>(null);

    const handleRotate = useCallback(
        (fabricEvent: fabric.IEvent<Event>) => {
            if (!canvas || !selectedPage || !marcherPages) return;

            // Snap rotate boxes to 15 degree increments
            handleGroupRotating(
                fabricEvent,
                fabricEvent.target as fabric.Group,
            );

            canvas.requestRenderAll();
        },
        [canvas, selectedPage, marcherPages],
    );

    /**
     * Update paths of moving CanvasMarchers.
     * Uses animation frames to ensure smooth updates.
     */
    const updateMovingPaths = useCallback(() => {
        if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current);
        }

        frameRef.current = requestAnimationFrame(() => {
            if (!canvas || !selectedPage || !marcherPages) return;

            // Render paths based on UI settings (pass empty objects for disabled paths)
            canvas.renderPathVisuals({
                marcherVisuals: marcherVisuals,
                previousMarcherPages: uiSettings.previousPaths
                    ? previousMarcherPages || {}
                    : {},
                currentMarcherPages: marcherPages,
                nextMarcherPages: uiSettings.nextPaths
                    ? nextMarcherPages || {}
                    : {},
                marcherIds: selectedMarchers.map((m) => m.id),
            });

            frameRef.current = null;
        });
    }, [
        canvas,
        marcherPages,
        marcherVisuals,
        nextMarcherPages,
        previousMarcherPages,
        selectedMarchers,
        selectedPage,
        uiSettings.nextPaths,
        uiSettings.previousPaths,
    ]);

    useEffect(() => {
        if (!canvas) return;
        canvas.on("object:rotating", handleRotate);

        canvas.on("object:moving", updateMovingPaths);
        canvas.on("object:scaling", updateMovingPaths);
        canvas.on("object:rotating", updateMovingPaths);

        return () => {
            canvas.off("object:rotating", handleRotate);

            canvas.off("object:moving", updateMovingPaths);
            canvas.off("object:scaling", updateMovingPaths);
            canvas.off("object:rotating", updateMovingPaths);

            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, [canvas, handleRotate, updateMovingPaths]);
};
