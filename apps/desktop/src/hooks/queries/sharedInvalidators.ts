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
    // The whole-show query is not a prefix match of the per-page keys, so mark it
    // stale explicitly. Exports refetch it when they mount; skip the refetch here so
    // the always-mounted preview handler doesn't reload every marcher page per edit.
    void qc.invalidateQueries({
        queryKey: marcherPageKeys.all(),
        exact: true,
        refetchType: "none",
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
                void qc.invalidateQueries({
                    queryKey: marcherAppearancesKeys.byPageId(pageId),
                });
            });
    }
};
