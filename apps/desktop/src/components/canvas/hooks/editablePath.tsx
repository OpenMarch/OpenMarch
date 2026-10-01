import EditablePath from "@/global/classes/canvasObjects/EditablePath";
import {
    updateMarcherPagesMutationOptions,
    useCreatePathway,
    useUpdatePathway,
} from "@/hooks/queries";
import { readTimelineMode } from "@/hooks/queries/useWorkspaceSettings";
import { Path } from "@openmarch/core";
import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * This hook keeps static methods in the EditablePath class up to date with React Query.
 *
 * In timeline mode the handlers write nothing (docs/timeline/phases/07-page-parity.md P7.10):
 * `pathways` and `marcher_pages.path_data_id` are page-era data that the resolver never reads, so
 * a write there would change nothing on the canvas. Nothing builds an EditablePath today, so this
 * only guards against one being wired up before curved paths have a timeline design (C-8).
 */
export default function useEditablePath() {
    const createPathway = useCreatePathway();
    const updatePathway = useUpdatePathway();
    const queryClient = useQueryClient();
    const updateMarcherPages = useMutation(
        updateMarcherPagesMutationOptions(queryClient),
    );

    useEffect(() => {
        const refuseInTimelineMode = async (): Promise<boolean> => {
            // A failed settings read keeps the page-mode write: page mode must never lose one
            const timelineMode = await readTimelineMode(queryClient).catch(
                () => false,
            );
            if (!timelineMode) return false;
            console.warn(
                "Editable pathways are page-mode only; nothing was written in timeline mode",
            );
            return true;
        };
        EditablePath.createPathway = (
            pathObj: Path,
            nextMarcherPageId: number,
        ) => {
            console.log(
                "EditablePath.createPathway",
                pathObj,
                nextMarcherPageId,
            );

            return refuseInTimelineMode().then((refused) => {
                if (refused) return;
                createPathway.mutate({
                    newPathwayArgs: {
                        path_data: pathObj.toJson(),
                    },
                    marcherPageIds: [nextMarcherPageId],
                });
            });
        };
        EditablePath.updatePathway = (pathId: number, pathObj: Path) =>
            refuseInTimelineMode().then((refused) => {
                if (refused) return;
                updatePathway.mutate({
                    id: pathId,
                    path_data: pathObj.toJson(),
                });
            });
    }, [createPathway, updateMarcherPages.mutate, updatePathway, queryClient]);
}
