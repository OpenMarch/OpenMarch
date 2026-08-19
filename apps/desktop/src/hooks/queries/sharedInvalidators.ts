import { marcherPageKeys } from "./useMarcherPages";
import { coordinateDataKeys } from "./useCoordinateData";
import { QueryClient } from "@tanstack/react-query";
import { shapePageKeys } from "./useShapePages";
import { pageKeys } from "./usePages";
import { marcherAppearancesKeys } from "./useMarcherAppearances";
/**
 * Invalidate the marcher pages and coordinate data queries for a given page id
 *
 * These are the queries that must be invalidated when coordinates or pages are changed
 *
 * @param qc
 * @param pageIds
 */
export const invalidateByPage = (qc: QueryClient, pageIds: Set<number>) => {
    void qc.invalidateQueries({
        queryKey: pageKeys.inOrder(),
    });
    // A coordinate change cascades to other pages through inheritance so refresh all marcher pages and coordinate data
    void qc.invalidateQueries({
        queryKey: marcherPageKeys.all(),
    });
    void qc.invalidateQueries({
        queryKey: coordinateDataKeys.all,
    });
    // Shape and appearance data are per page and do not cascade
    for (const pageId of pageIds) {
        void qc.invalidateQueries({
            queryKey: shapePageKeys.byPageId(pageId),
        });
        void qc.invalidateQueries({
            queryKey: marcherAppearancesKeys.byPageId(pageId),
        });
    }
};
