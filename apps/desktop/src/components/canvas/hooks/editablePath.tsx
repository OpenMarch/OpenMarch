import EditablePath from "@/global/classes/canvasObjects/EditablePath";
import {
    useCreatePathway,
    useUpdateMarcherPages,
    useUpdatePathway,
} from "@/hooks/queries";
import { Path } from "@openmarch/path-utility";
import { useEffect } from "react";

/**
 * This hook keeps static methods in the EditablePath class up to date with React Query.
 */
export default function useEditablePath() {
    const createPathway = useCreatePathway();
    const updatePathway = useUpdatePathway();
    const updateMarcherPages = useUpdateMarcherPages();

    useEffect(() => {
        EditablePath.createPathway = (
            pathObj: Path,
            nextMarcherPageId: number,
        ) => {
            console.log(
                "EditablePath.createPathway",
                pathObj,
                nextMarcherPageId,
            );

            return createPathway.mutate({
                newPathwayArgs: {
                    path_data: pathObj.toJson(),
                },
                marcherPageIds: [nextMarcherPageId],
            });
        };
        EditablePath.updatePathway = (pathId: number, pathObj: Path) =>
            updatePathway.mutate({
                id: pathId,
                path_data: pathObj.toJson(),
            });
    }, [createPathway, updateMarcherPages.mutate, updatePathway]);
}
