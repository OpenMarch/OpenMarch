import { useQueries, useQuery } from "@tanstack/react-query";
import { allMarchersQueryOptions } from "../queries";
import { useTimingObjects } from "../useTimingObjects";
import { MarcherTimeline } from "@openmarch/core";
import { marcherTimelineQueryOptions } from "../queries/useMarcherTimelines";
import { useCallback } from "react";
import { getAllCoordinatesAtTime } from "@/services/rendering/get-coordinates-at-time";

const useMarcherTimelines = ():
    | {
          /** List of marcher ids whose timelines are being returned */
          marcherIds: number[];
          /** List of `MarcherTimelines` in the same order as the marcher ids */
          marcherTimelines: MarcherTimeline[];
      }
    | undefined => {
    const { data: marcherIds } = useQuery({
        ...allMarchersQueryOptions(),
        select: (result) => {
            return result.map((marcher) => marcher.id).sort();
        },
    });
    const { pages } = useTimingObjects();

    return useQueries({
        queries:
            marcherIds?.map((marcherId) =>
                marcherTimelineQueryOptions(
                    marcherId,
                    pages.map((page) => ({
                        page_id: page.id,
                        timestamp: page.timestamp,
                    })),
                ),
            ) ?? [],
        combine: (marcherTimelines) => {
            if (marcherIds == null) return;
            // Throw if any marcherTimelines are null
            if (marcherTimelines.some((mt) => mt == null || mt.data == null))
                throw new Error(
                    "Some marcher timelines were null. This should not happen.",
                );

            return {
                marcherIds,
                marcherTimelines: marcherTimelines.map(
                    (result) => result.data!, // assert that this is non-null
                ),
            };
        },
    });
};

/**
 *
 * @returns A callback that, given a timestamp in milliseconds, will return all of the coordinates of the marchers
 */
export const useRenderingCallback = () => {
    const timelineResult = useMarcherTimelines();
    const renderingCallback = useCallback(
        (timeMs: number) => {
            if (timelineResult == null) return;

            return getAllCoordinatesAtTime(
                timelineResult.marcherTimelines,
                timeMs,
            );
        },
        [timelineResult],
    );

    return renderingCallback;
};
