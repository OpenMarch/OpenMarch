/**
 * Performer positions for the 3D View (ADR 0002 D-6, docs/3d/design.md §8).
 *
 * This is the only place the 3D View computes where a performer is. Scene code
 * calls {@link usePerformerTimelines} once and {@link positionAt} per performer
 * per frame. When the timeline motion model replaces keyframes, only this
 * module changes.
 *
 * - Timelines cover the whole show, not the editor's ±2 pages, so the window
 *   can show any time without refetching.
 * - Positions are in world meters on the ground plane (`@openmarch/core`
 *   `pixelsToWorld`): +X toward side 2, +Z toward the audience.
 * - Before the first page and after the last, a performer holds its first or
 *   last set.
 */
import {
    useQueries,
    useQueryClient,
    type UseQueryResult,
} from "@tanstack/react-query";
import { useMemo } from "react";
import {
    pixelsToWorld,
    type FieldProperties,
    type WorldPoint,
} from "@openmarch/core";
import {
    combineMarcherTimelines,
    coordinateDataQueryOptions,
} from "@/hooks/queries/useCoordinateData";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import {
    getCoordinatesAtTime,
    type MarcherTimeline,
} from "@/utilities/Keyframes";

/** One timeline per marcher ID, covering every page of the show. */
export type PerformerTimelines = Map<number, MarcherTimeline>;

export type PerformerTimelinesReturn = {
    /** Empty until every page has loaded, and on error. */
    timelines: PerformerTimelines;
    isLoading: boolean;
    hasError: boolean;
};

const EMPTY_TIMELINES: PerformerTimelines = new Map();

/**
 * Combines every page's coordinate data into one timeline per marcher. It
 * returns no timelines until all pages have loaded, so the scene never shows
 * part of a show.
 */
export const _combinePerformerTimelines = (
    results: UseQueryResult<Map<number, MarcherTimeline>>[],
): PerformerTimelinesReturn => {
    const isLoading = results.some((r) => r.isLoading);
    const hasError = results.some((r) => r.isError);
    if (isLoading || hasError || results.some((r) => r.data === undefined)) {
        return { timelines: EMPTY_TIMELINES, isLoading, hasError };
    }
    return {
        timelines: combineMarcherTimelines(
            results.map((r) => r.data as Map<number, MarcherTimeline>),
        ),
        isLoading: false,
        hasError: false,
    };
};

/**
 * Loads the whole show's coordinate data in the 3D View window and combines it
 * into one {@link MarcherTimeline} per marcher. It reuses the editor's query
 * options, so the editor's relayed invalidations refresh it.
 */
export function usePerformerTimelines(): PerformerTimelinesReturn {
    const queryClient = useQueryClient();
    const {
        pages,
        isLoading: pagesLoading,
        hasError: pagesError,
    } = useTimingObjects();

    const combined = useQueries({
        queries: pages.map((page) =>
            coordinateDataQueryOptions(page, queryClient),
        ),
        combine: _combinePerformerTimelines,
    });

    return useMemo(() => {
        if (pagesLoading || pagesError) {
            return {
                timelines: EMPTY_TIMELINES,
                isLoading: pagesLoading,
                hasError: pagesError,
            };
        }
        return combined;
    }, [pagesLoading, pagesError, combined]);
}

/**
 * Where a performer is at a show time, in world meters.
 *
 * At a page's end it is exactly that page's set; between pages it follows the
 * editor's interpolation, including pathways. Before the first page it holds
 * the first set, and after the last page it holds the last.
 *
 * @param timeline - the performer's timeline from {@link usePerformerTimelines}
 * @param ms - show time in milliseconds
 * @param fieldProperties - the show's field, for the pixel-to-meter mapping
 * @returns the position, or null if the timeline has no keyframes
 */
export function positionAt(
    timeline: MarcherTimeline,
    ms: number,
    fieldProperties: FieldProperties,
): WorldPoint | null {
    const { sortedTimestamps, pathMap } = timeline;
    if (sortedTimestamps.length === 0) return null;
    const first = sortedTimestamps[0];
    const last = sortedTimestamps[sortedTimestamps.length - 1];

    // `!(ms > first)` also catches NaN.
    const pixels = !(ms > first)
        ? pathMap.get(first)
        : ms >= last
          ? pathMap.get(last)
          : (pathMap.get(ms) ?? getCoordinatesAtTime(ms, timeline));
    if (!pixels) return null;
    return pixelsToWorld(fieldProperties, pixels);
}
