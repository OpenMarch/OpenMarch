import { useEffect, useCallback, useRef } from "react";
import { fabric } from "fabric";
import { handleGroupRotating } from "@/global/classes/canvasObjects/GroupUtils";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    marcherPagesByPageQueryOptions,
    marcherWithVisualsQueryOptions,
    fieldPropertiesQueryOptions,
} from "@/hooks/queries";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useShallow } from "zustand/react/shallow";
import { useTimingObjects } from "@/hooks";
import { useTimelineMode } from "@/hooks/queries/useWorkspaceSettings";
import { useTimelineResolverStore } from "@/timeline/timelineStore";

// eslint-disable-next-line max-lines-per-function
export const useMovementListeners = ({
    canvas,
}: {
    canvas: OpenMarchCanvas | null;
}) => {
    const uiSettings = useUiSettingsStore(
        useShallow((s) => ({
            previousPaths: s.uiSettings.previousPaths,
            nextPaths: s.uiSettings.nextPaths,
            stepSizeWarnings: s.uiSettings.stepSizeWarnings,
        })),
    );
    const { selectedPage } = useSelectedPage()!;
    const { pages } = useTimingObjects()!;
    const { selectedMarchers } = useSelectedMarchers()!;
    const queryClient = useQueryClient();
    const { data: marcherVisuals } = useQuery(
        marcherWithVisualsQueryOptions(queryClient),
    );
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());

    // Timeline mode (P7.10): once the resolver is ready, the paths come from it
    // (useTimelinePathRender) and a drag leaves them alone, as page mode's redraw from the stored
    // rows does; they follow once the move is written. Redrawing here would put back the straight
    // marcher_pages lines.
    const timelineMode = useTimelineMode();
    const timelineResolverReady = useTimelineResolverStore(
        (s) => s.status === "ready",
    );
    const drawFromResolver = timelineMode && timelineResolverReady;

    // MarcherPage queries. The previous and next pages' rows only feed the page-mode path redraw
    // below, so they aren't read once the resolver draws the paths.
    const { data: marcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.id),
    );
    const { data: previousMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(
            drawFromResolver ? null : selectedPage?.previousPageId,
        ),
    );
    const { data: nextMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(
            drawFromResolver ? null : selectedPage?.nextPageId,
        ),
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
            frameRef.current = null;
        }
        if (drawFromResolver) return;

        frameRef.current = requestAnimationFrame(() => {
            if (
                !canvas ||
                !selectedPage ||
                !marcherPages ||
                !fieldProperties ||
                marcherVisuals == null
            )
                return;

            // Always render, renderPathVisuals decides visibility per pathway
            const nextPage = pages.find(
                (p) => p.id === selectedPage.nextPageId,
            );
            canvas.renderPathVisuals({
                marcherVisuals: marcherVisuals,
                previousMarcherPages: previousMarcherPages || {},
                currentMarcherPages: marcherPages,
                nextMarcherPages: nextMarcherPages || {},
                marcherIds: selectedMarchers.map((m) => m.id),
                currentPageCounts: selectedPage.counts,
                nextPageCounts: nextPage?.counts,
                previousPathsEnabled: uiSettings.previousPaths,
                nextPathsEnabled: uiSettings.nextPaths,
                stepSizeWarningsEnabled: uiSettings.stepSizeWarnings,
                fieldProperties: fieldProperties,
            });

            frameRef.current = null;
        });
    }, [
        canvas,
        drawFromResolver,
        fieldProperties,
        marcherPages,
        marcherVisuals,
        nextMarcherPages,
        pages,
        previousMarcherPages,
        selectedMarchers,
        selectedPage,
        uiSettings.nextPaths,
        uiSettings.previousPaths,
        uiSettings.stepSizeWarnings,
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
