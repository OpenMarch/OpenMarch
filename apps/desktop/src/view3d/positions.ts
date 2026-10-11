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

/** As in `@openmarch/core` `world.ts`. */
const METERS_PER_INCH = 0.0254;

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

/**
 * {@link positionAt} without allocating, for the per-frame path: writes the
 * position into `out` and returns true, or returns false (leaving `out`
 * untouched) when the timeline has no keyframes. The result is identical to
 * `positionAt`'s.
 *
 * Straight moves are interpolated here, with the same arithmetic as
 * `getCoordinatesAtTime` and `pixelsToWorld`. A move along a pathway still
 * goes through `getCoordinatesAtTime`, which allocates; pathways are rare.
 *
 * @param timeline - the performer's timeline from {@link usePerformerTimelines}
 * @param ms - show time in milliseconds
 * @param fieldProperties - the show's field, for the pixel-to-meter mapping
 * @param out - receives the position in world meters
 */
export function positionAtInto(
    timeline: MarcherTimeline,
    ms: number,
    fieldProperties: FieldProperties,
    out: WorldPoint,
): boolean {
    const { sortedTimestamps, pathMap } = timeline;
    const n = sortedTimestamps.length;
    if (n === 0) return false;
    const first = sortedTimestamps[0];
    const last = sortedTimestamps[n - 1];

    let px: number;
    let py: number;
    // `!(ms > first)` also catches NaN.
    const held = !(ms > first) ? first : ms >= last ? last : null;
    const exact = held ?? (pathMap.has(ms) ? ms : null);
    if (exact !== null) {
        const c = pathMap.get(exact);
        if (!c) return false;
        px = c.x;
        py = c.y;
    } else {
        // first < ms < last and ms is not a keyframe: find the keyframes on
        // either side (the same binary search as `findSurroundingTimestamps`).
        let low = 0;
        let high = n - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (sortedTimestamps[mid] < ms) low = mid + 1;
            else high = mid - 1;
        }
        const t0 = sortedTimestamps[high];
        const t1 = sortedTimestamps[low];
        const c0 = pathMap.get(t0);
        const c1 = pathMap.get(t1);
        if (!c0 || !c1) return false;
        if (c1.path) {
            const p = getCoordinatesAtTime(ms, timeline);
            if (!p) return false;
            px = p.x;
            py = p.y;
        } else {
            const progress = (ms - t0) / (t1 - t0);
            px = c0.x + progress * (c1.x - c0.x);
            py = c0.y + progress * (c1.y - c0.y);
        }
    }
    // As `pixelsToWorld`.
    const k =
        (fieldProperties.stepSizeInches * METERS_PER_INCH) /
        fieldProperties.pixelsPerStep;
    out.x = (px - fieldProperties.centerFrontPoint.xPixels) * k;
    out.z = (py - fieldProperties.centerFrontPoint.yPixels) * k;
    return true;
}
