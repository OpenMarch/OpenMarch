import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import Page from "@/global/classes/Page";
import {
    shapePagesQueryByPageIdOptions,
    shapePageMarchersQueryByPageIdOptions,
} from "@/hooks/queries";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * Draws the selected page's page-era shapes (`MarcherShape`s from `shape_pages`).
 *
 * In timeline mode (P7.11) it draws none and reads none: shape pages are frozen page-era rows
 * that no longer say where marchers are, and their edits would write `marcher_pages`. Turning
 * timeline mode on removes the page shapes, and a page render still running then (it awaits each
 * shape's marchers) stops and is cleared. Timeline mode draws the spec shape picked in the
 * inspector instead (`useTimelineShapeCanvas`).
 */
export const useRenderMarcherShapes = ({
    canvas,
    selectedPage,
    isPlaying,
    timelineMode,
}: {
    canvas: Pick<OpenMarchCanvas, "renderMarcherShapes"> | null;
    selectedPage: Page | null;
    isPlaying: boolean;
    /** The file's timeline flag. Required, so no caller falls back to page mode by omission. */
    timelineMode: boolean;
}) => {
    const pageId = timelineMode ? null : (selectedPage?.id ?? null);
    const { data: shapePagesOnSelectedPage } = useQuery(
        shapePagesQueryByPageIdOptions(pageId),
    );
    const { data: shapePageMarchersOnSelectedPage } = useQuery(
        shapePageMarchersQueryByPageIdOptions(pageId),
    );
    /** Moves on with every render and every mode change; a render that sees it moved stops */
    const generation = useRef(0);
    const timelineModeRef = useRef(timelineMode);
    timelineModeRef.current = timelineMode;

    useEffect(() => {
        generation.current++;
        if (canvas && timelineMode)
            void canvas.renderMarcherShapes({ shapePages: [] });
    }, [canvas, timelineMode]);

    // Update/render the MarcherShapes when the selected page or the ShapePages change
    // and the animation is not playing.
    useEffect(() => {
        if (!canvas || timelineMode || !shapePagesOnSelectedPage || isPlaying)
            return;
        const mine = ++generation.current;
        const isCurrent = () =>
            generation.current === mine && !timelineModeRef.current;
        void canvas
            .renderMarcherShapes({
                shapePages: shapePagesOnSelectedPage,
                isCurrent,
            })
            .then(() => {
                // Timeline mode turned on while this render awaited: take back what it drew
                if (timelineModeRef.current)
                    void canvas.renderMarcherShapes({ shapePages: [] });
            });
    }, [
        canvas,
        selectedPage,
        isPlaying,
        timelineMode,
        shapePagesOnSelectedPage,
        shapePageMarchersOnSelectedPage,
    ]);
};
