import { marcherPageKeys } from "./useMarcherPages";
import { coordinateDataKeys } from "./useCoordinateData";
import { QueryClient } from "@tanstack/react-query";
import { shapePageKeys } from "./useShapePages";
/**
 * Invalidate the marcher pages and coordinate data queries for a given page id
 *
 * @param qc
 * @param pageIds
 */
export const invalidateByPage = (qc: QueryClient, pageIds: Set<number>) => {
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
