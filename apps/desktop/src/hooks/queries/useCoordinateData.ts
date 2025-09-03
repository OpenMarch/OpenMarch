import {
    queryOptions,
    useQueries,
    useQueryClient,
} from "@tanstack/react-query";
import { marcherPagesByPageQueryOptions } from "./useMarcherPages";
import { Pathway, pathwaysByPageQueryOptions } from "./usePathways";
import { CoordinateDefinition, MarcherTimeline } from "@/utilities/Keyframes";
import { assert } from "@/utilities/utils";
import { MarcherPagesByMarcher } from "@/global/classes/MarcherPageIndex";

const coordinateDataKeys = {
    all: ["coordinateData"] as const,
    byPageId: (pageId: number) =>
        [...coordinateDataKeys.all, "page", pageId] as const,
};

/**
 * Get the timeline for one page for all marchers
 *
 * @param destinationTimestamp - in seconds, the destination timestamp of the page
 * @param marcherPages - the marcher pages for the page
 * @param pathwaysById - a record of pathway IDs to their pathways
 * @returns - a record of marcher IDs to their timelines for the page
 */
const getMarcherTimelines = (
    destinationTimestamp: number,
    marcherPages: MarcherPagesByMarcher,
    pathwaysById: Record<number, Pathway>,
): Record<number, MarcherTimeline> => {
    if (marcherPages == null) {
        console.debug("not loading timeline");
        // console.debug("midsetsLoaded", midsetsLoaded);
        // console.debug("midsets", midsets);
        // console.debug("marcherPagesLoaded", marcherPagesLoaded);
        console.debug("marcherPages", marcherPages);
        return {};
    }
    const marcherPagesArray = Object.values(marcherPages);

    // Make sure all the marcher pages are on the same page
    const pageIds = new Set<number>(marcherPagesArray.map((mp) => mp.page_id));
    assert(
        pageIds.size === 1,
        `MarcherPages are not all on the same page. Found ${pageIds.size} different page IDs: ${Array.from(pageIds).join(", ")}`,
    );

    // Organize midsets by marcher page ID for efficient lookup
    // const midsetsByMarcherPage = midsets.reduce(
    //     (acc: Record<number, Midset[]>, midset: Midset) => {
    //         if (!acc[midset.mp_id]) {
    //             acc[midset.mp_id] = [];
    //         }
    //         acc[midset.mp_id].push(midset);
    //         return acc;
    //     },
    //     {} as Record<number, Midset[]>,
    // );

    const timelinesByMarcherId: Record<number, MarcherTimeline> = {};
    if (!marcherPagesArray.length) return timelinesByMarcherId;

    for (const marcherPage of marcherPagesArray) {
        assert(
            !(marcherPage.marcher_id in timelinesByMarcherId),
            "Marcher ID already in timelinesByMarcherId",
        );
        const coordinateMap = new Map<number, CoordinateDefinition>();

        const pathData = marcherPage.path_data_id
            ? pathwaysById[marcherPage.path_data_id].path_data
            : undefined;
        // Add the marcher page position as the base coordinate
        coordinateMap.set(destinationTimestamp, {
            x: marcherPage.x,
            y: marcherPage.y,
            path: pathData,
            previousPathPosition: marcherPage.path_start_position || 0,
            nextPathPosition: marcherPage.path_end_position || 1,
        });
        // // Add midset positions at their progress placements
        // for (const midset of midsetsForMarcherPage) {
        //     const progressTime =
        //         page.timestamp +
        //         page.duration * midset.progress_placement;
        //     coordinateMap.set(progressTime, {
        //         x: midset.x,
        //         y: midset.y,
        //         path: midset.path_data || undefined,
        //     });
        // }

        const sortedTimestamps = Array.from(coordinateMap.keys()).sort(
            (a, b) => a - b,
        );
        timelinesByMarcherId[marcherPage.marcher_id] = {
            pathMap: coordinateMap,
            sortedTimestamps,
        };
    }
    return timelinesByMarcherId;
};

// --- coordinate data options (pure; no hooks) ---
export const coordinateDataQueryOptions = (
    page: { id: number; duration: number; timestamp: number },
    qc: ReturnType<typeof useQueryClient>,
) =>
    queryOptions({
        queryKey: ["coordinateData", page.id, page.duration, page.timestamp],
        enabled: !!page.id && page.duration != null && page.timestamp != null,
        queryFn: async () => {
            // Ensure deps exist (fetch if missing/stale)
            const marcherPagesPromise = qc.ensureQueryData(
                marcherPagesByPageQueryOptions(page.id),
            );

            const pathwaysPromise = qc.ensureQueryData(
                pathwaysByPageQueryOptions(page.id),
            );

            const [marcherPages, pathways] = await Promise.all([
                marcherPagesPromise,
                pathwaysPromise,
            ]);

            return getMarcherTimelines(
                page.timestamp + page.duration,
                marcherPages ?? {},
                pathways ?? {},
            );
        },
    });

export const combineMarcherTimelines = (
    timelines: Record<number, MarcherTimeline>[],
) => {
    return timelines.reduce((acc, r) => {
        for (const [marcherId, timeline] of Object.entries(r ?? {})) {
            for (const [timestamp, coordinate] of Object.entries(
                timeline.pathMap,
            )) {
                acc[parseInt(marcherId)].pathMap.set(
                    parseFloat(timestamp),
                    coordinate,
                );
                acc[parseInt(marcherId)].sortedTimestamps.push(
                    parseFloat(timestamp),
                );
                acc[parseInt(marcherId)].sortedTimestamps.sort((a, b) => a - b);
            }
        }
        return acc;
    }, {});
};

/**
 * Fetch the coordinate data for many pages. These pages must be sequential.
 *
 * @param pages - an array of pages
 * @returns - a record of marcher IDs to their timelines for the pages
 */
export const useManyCoordinateData = (
    pages: { id: number; duration: number; timestamp: number }[],
) => {
    const qc = useQueryClient();

    // TODO - memoize the pages array to prevent unnecessary re-renders

    return useQueries({
        queries: pages.map((page) => coordinateDataQueryOptions(page, qc)),
        combine: (results) => ({
            data: combineMarcherTimelines(results.map((r) => r.data ?? {})),
            isPending: results.some((r) => r.isPending),
            isFetching: results.some((r) => r.isFetching),
            error: results.find((r) => r.error)?.error,
        }),
    });
};
