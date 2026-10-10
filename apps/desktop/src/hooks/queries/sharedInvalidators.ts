import { marcherPageKeys } from "./useMarcherPages";
import { coordinateDataKeys } from "./useCoordinateData";
import { QueryClient } from "@tanstack/react-query";
import { shapePageKeys } from "./useShapePages";
import { pageKeys } from "./usePages";
import { marcherAppearancesKeys } from "./useMarcherAppearances";
import { pathwayKeys } from "./usePathways";
import type { MarcherPagesWriteResult } from "@/db-functions/marcherPage";
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
                void qc.invalidateQueries({
                    queryKey: marcherAppearancesKeys.byPageId(pageId),
                });
            });
    }
};

/**
 * Invalidates what a page-mode marcher page write changed: the written pages, the later pages an
 * edit carried to, the marchers it carried, and pathways (a write moves pathway ends, and a carried
 * page drops its copied pathway).
 *
 * @param writtenPageIds the pages the write was asked to change
 * @param result what `updateMarcherPages` returned, if anything
 */
export const invalidateAfterMarcherPagesWrite = (
    qc: QueryClient,
    writtenPageIds: Iterable<number>,
    result?: MarcherPagesWriteResult,
) => {
    void qc.invalidateQueries({ queryKey: pathwayKeys.all });
    for (const run of result?.carried ?? [])
        void qc.invalidateQueries({
            queryKey: marcherPageKeys.byMarcher(run.marcherId),
        });
    invalidateByPage(
        qc,
        new Set([
            ...writtenPageIds,
            ...(result?.followedPageIds ?? []),
            ...(result?.pathwayPageIds ?? []),
        ]),
    );
};

/**
 * Invalidates every marcher page, pathway and coordinate query. For writes that can carry an edit
 * forward but don't report which pages it reached (shape edits).
 */
export const invalidateAllMarcherPages = (qc: QueryClient) => {
    void qc.invalidateQueries({ queryKey: marcherPageKeys.all() });
    void qc.invalidateQueries({ queryKey: pathwayKeys.all });
    void qc.invalidateQueries({ queryKey: coordinateDataKeys.all });
};
