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
}: {
    canvas: OpenMarchCanvas | null;
    selectedPage: Page | null;
}) => {
    const { data: shapePagesOnSelectedPage } = useQuery(
        shapePagesQueryByPageIdOptions(selectedPage?.id!),
    );
    const { data: shapePageMarchersOnSelectedPage } = useQuery(
        shapePageMarchersQueryByPageIdOptions(selectedPage?.id!),
    );

    // Update/render the MarcherShapes when the selected page or the ShapePages change
    useEffect(() => {
        if (canvas && shapePagesOnSelectedPage) {
            void canvas.renderMarcherShapes({
                shapePages: shapePagesOnSelectedPage,
            });
        }
    }, [
        canvas,
        selectedPage,
        shapePagesOnSelectedPage,
        shapePageMarchersOnSelectedPage,
    ]);
};
