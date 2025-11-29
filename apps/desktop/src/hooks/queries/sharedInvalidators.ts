import { marcherPageKeys } from "./useMarcherPages";
import { coordinateDataKeys } from "./useCoordinateData";
import { QueryClient } from "@tanstack/react-query";
import { shapePageKeys } from "./useShapePages";
import { pageKeys } from "./usePages";
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
    // Invalidate marcherPage queries for each affected page
    for (const pageId of pageIds) {
        void qc
            .invalidateQueries({
                queryKey: marcherPageKeys.byPage(pageId),
            })
            .then(() => {
                void qc.invalidateQueries({
                    queryKey: coordinateDataKeys.byPageId(pageId),
                });
                void qc.invalidateQueries({
                    queryKey: shapePageKeys.byPageId(pageId),
                });
            });
    }
};
