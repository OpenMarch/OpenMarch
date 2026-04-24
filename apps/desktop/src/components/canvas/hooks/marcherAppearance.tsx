import { useSelectedPage } from "@/context/SelectedPageContext";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import {
    allMarchersQueryOptions,
    fieldPropertiesQueryOptions,
    marcherAppearancesQueryOptions,
    marcherWithVisualsQueryOptions,
} from "@/hooks/queries";
import { useWorkspaceViewStore } from "@/stores/WorkspaceViewStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function MarcherAppearance({
    canvas,
}: {
    canvas: OpenMarchCanvas | null;
}) {
    const workspaceMode = useWorkspaceViewStore.use.mode();

    if (workspaceMode === "editor")
        return <EditorMarcherAppearances canvas={canvas} />;
    if (workspaceMode === "lightDesigner")
        return <LightDesignerMarcherAppearances canvas={canvas} />;
    throw new Error(`Unsupported workspace mode: ${workspaceMode}`);
}

const EditorMarcherAppearances = ({
    canvas,
}: {
    canvas: OpenMarchCanvas | null;
}) => {
    const queryClient = useQueryClient();
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const { data: marcherVisuals } = useQuery(marcherWithVisualsQueryOptions());

    const { selectedPage } = useSelectedPage()!;
    const { data: marcherAppearances } = useQuery(
        marcherAppearancesQueryOptions(selectedPage?.id, queryClient),
    );

    useEffect(() => {
        if (
            !canvas ||
            !marchers ||
            marcherAppearances == null ||
            marcherVisuals == null
        )
            return;

        // Add all marcher appearances to the canvas
        marchers.forEach((marcher) => {
            const visualGroup = marcherVisuals[marcher.id];
            const appearancesForMarcher = marcherAppearances[marcher.id];
            if (!visualGroup || !appearancesForMarcher) return;

            const canvasMarcher = visualGroup.getCanvasMarcher();
            canvasMarcher.setAppearance(
                appearancesForMarcher,
                {
                    requestRenderAll: false,
                },
                fieldProperties?.theme.defaultMarcher.label,
            );
        });

        canvas.requestRenderAll();
    }, [
        canvas,
        marchers,
        marcherAppearances,
        marcherVisuals,
        fieldProperties?.theme.defaultMarcher.label,
    ]);

    return null;
};

const LightDesignerMarcherAppearances = ({
    canvas,
}: {
    canvas: OpenMarchCanvas | null;
}) => {
    return null;
};
