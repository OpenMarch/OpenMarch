import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import Page from "@/global/classes/Page";
import {
    shapePagesQueryByPageIdOptions,
    shapePageMarchersQueryByPageIdOptions,
} from "@/hooks/queries";
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
    const { data: shapePagesOnSelectedPage } = useQuery(
        shapePagesQueryByPageIdOptions(selectedPage?.id!),
    );
    const { data: shapePageMarchersOnSelectedPage } = useQuery(
        shapePageMarchersQueryByPageIdOptions(selectedPage?.id!),
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
