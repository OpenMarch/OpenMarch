import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import Page from "@/global/classes/Page";
import {
    shapePagesQueryByPageIdOptions,
    shapePageMarchersQueryByPageIdOptions,
} from "@/hooks/queries";
import { useStablePageId } from "@/hooks/useStablePageId";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

export const useRenderMarcherShapes = ({
    canvas,
    selectedPage,
    isPlaying,
}: {
    canvas: OpenMarchCanvas | null;
    selectedPage: Page | null;
    isPlaying: boolean;
}) => {
    // Freeze the queried page while playing — this data only feeds `renderMarcherShapes`
    // below, which is already skipped during playback, so there's no need to fetch it
    // fresh (over IPC) for every not-yet-cached page playback passes through.
    const stablePageId = useStablePageId(selectedPage?.id ?? null, isPlaying);
    const { data: shapePagesOnSelectedPage } = useQuery(
        shapePagesQueryByPageIdOptions(stablePageId),
    );
    const { data: shapePageMarchersOnSelectedPage } = useQuery(
        shapePageMarchersQueryByPageIdOptions(stablePageId),
    );

    // Update/render the MarcherShapes when the selected page or the ShapePages change
    // and the animation is not playing.
    useEffect(() => {
        if (canvas && shapePagesOnSelectedPage && !isPlaying) {
            void canvas.renderMarcherShapes({
                shapePages: shapePagesOnSelectedPage,
            });
        }
    }, [
        canvas,
        selectedPage,
        isPlaying,
        shapePagesOnSelectedPage,
        shapePageMarchersOnSelectedPage,
    ]);
};
