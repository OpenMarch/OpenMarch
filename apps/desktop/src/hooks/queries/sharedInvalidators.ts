import { marcherPageKeys } from "./useMarcherPages";
import { coordinateDataKeys } from "./useCoordinateData";
import { QueryClient } from "@tanstack/react-query";
import { shapePageKeys } from "./useShapePages";
import { pageKeys } from "./usePages";
import { marcherAppearancesKeys } from "./useMarcherAppearances";
import { marcherTimelineKeys } from "./useMarcherTimelines";
import { useFrameClockStore } from "@/services/clock/frame-clock";
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

export const invalidateAllMarchers = (qc: QueryClient) => {
    const promises = [
        qc.invalidateQueries({
            queryKey: marcherTimelineKeys.all(),
        }),
    ];

    // Wait for all promises to resolve, then increment the clock version
    // This is to trigger a re-render for all subscribers of the frame clock
    void Promise.all(promises).then(() => {
        useFrameClockStore.setState(({ _version }) => ({
            _version: _version + 1,
        }));
    });
};

export const invalidateByMarchers = (
    qc: QueryClient,
    marcherIds: Set<number>,
) => {
    for (const marcherId of marcherIds) {
        void qc.invalidateQueries({
            queryKey: marcherTimelineKeys.byMarcherId(marcherId),
        });
    }
};
