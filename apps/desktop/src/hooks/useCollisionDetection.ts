import { useEffect, useMemo, useState } from "react";
import {
    queryOptions,
    skipToken,
    useQueries,
    useQueryClient,
    type UseQueryResult,
} from "@tanstack/react-query";
import {
    CollisionData,
    collisionWindow,
    detectCollisions,
} from "@/global/classes/CollisionDetection";
import type Marcher from "@/global/classes/Marcher";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useCollisionStore } from "@/stores/CollisionStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import type { PositionSource } from "@/timeline/positionBuffer";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { allMarchersQueryOptions } from "./queries";
import { useTimingObjects } from "./useTimingObjects";

/**
 * Collision detection (fork #226), as a query over the resolver's positions that feeds
 * `useCollisionStore`, so both fields' markers and the Collisions tab show it.
 *
 * When it runs: for the selected page only (`collisionWindow`: its positions and the move to the
 * next page), once the page and the resolver version have held still for `SETTLE_MS`, or at once
 * when the cache already has the answer. A new
 * resolver version (any committed edit, undo or redo) is a new query key, so an edit asks again;
 * a drag's pending positions aren't committed, so it doesn't run mid-drag. It never runs per
 * frame, nor while playing or scrubbing, when the selected page follows the playhead and the
 * fields hide the markers anyway. Going back to a page and version already checked reads the
 * cache.
 */

/**
 * The open file's resolver, read directly: `timelineStore.positionsAt` would move the idle warm
 * pass's focus to the beats checked, away from where the user is looking.
 */
const resolverSource: PositionSource = {
    marcherIds: () =>
        useTimelineResolverStore.getState().resolver?.marcherIds() ?? [],
    positionsAt(beat, out) {
        const { resolver } = useTimelineResolverStore.getState();
        if (!resolver || out.length !== 2 * resolver.marcherIds().length)
            return false;
        resolver.positionsAt(beat, out);
        return true;
    },
};

/** How long the page and the resolver version must hold still before detection runs */
const SETTLE_MS = 150;

/** What to check: the page it's for, and its beats at a resolver version */
export interface CollisionRequest {
    pageId: number;
    fromBeat: number;
    toBeat: number;
    version: number;
}

export const collisionKeys = {
    all: () => ["collisions"] as const,
    forRequest: ({ version, fromBeat, toBeat }: CollisionRequest) =>
        [...collisionKeys.all(), version, fromBeat, toBeat] as const,
};

/**
 * The collisions between a request's beats, labeled by marcher id; `_combineCollisions` labels
 * them by drill number. Disabled without a request.
 */
export const collisionsQueryOptions = (request: CollisionRequest | null) =>
    queryOptions<CollisionData[]>({
        queryKey: request
            ? collisionKeys.forRequest(request)
            : [...collisionKeys.all(), "none"],
        queryFn: request
            ? () => {
                  const start = performance.now();
                  const found = detectCollisions(
                      resolverSource,
                      request.fromBeat,
                      request.toBeat,
                      new Map(),
                  );
                  // Its cost, for DevTools' performance panel and benchmarks
                  performance.measure("openmarch:collisions", { start });
                  return found;
              }
            : skipToken,
        // The key holds the resolver version: an answer never goes stale, only unused
        staleTime: Infinity,
        gcTime: 60_000,
        retry: false,
    });

export type CollisionsReturn = {
    /** Null until the requested page's collisions are found */
    collisions: CollisionData[] | null;
    isLoading: boolean;
    hasError: boolean;
};

/** Labels the found pairs with the marchers' drill numbers, as the tab and markers show them. */
export const _combineCollisions = (
    results: [UseQueryResult<Marcher[]>, UseQueryResult<CollisionData[]>],
): CollisionsReturn => {
    const [marchers, found] = results;
    const isLoading = marchers.isLoading || found.isLoading;
    const hasError = marchers.isError || found.isError;
    if (isLoading || hasError || !marchers.data || !found.data)
        return { collisions: null, isLoading, hasError };
    const drillNumbers = new Map(
        marchers.data.map((m) => [m.id, m.drill_number]),
    );
    const label = (id: number) => drillNumbers.get(id) ?? String(id);
    return {
        collisions: found.data.map((c) => ({
            ...c,
            label: `${label(c.marcher1Id)}, ${label(c.marcher2Id)}`,
        })),
        isLoading: false,
        hasError: false,
    };
};

/** `request`, once it has held still (by value) for `ms`. */
function useSettled(
    request: CollisionRequest | null,
    ms: number,
): CollisionRequest | null {
    const [settled, setSettled] = useState(request);
    const key = request ? JSON.stringify(request) : null;
    useEffect(() => {
        if (key === null) return setSettled(null);
        const timer = setTimeout(() => setSettled(JSON.parse(key)), ms);
        return () => clearTimeout(timer);
    }, [key, ms]);
    return settled;
}

/** Runs collision detection for the selected page and puts what it finds in `useCollisionStore`. */
export function useCollisionDetection(): void {
    const { pages } = useTimingObjects();
    const { selectedPage } = useSelectedPage()!;
    const isPlaying = useIsPlaying()?.isPlaying ?? false;
    const scrubbing = useTimelineSelectionStore((s) => s.scrubbing);
    const ready = useTimelineResolverStore((s) => s.status === "ready");
    const version = useTimelineResolverStore((s) => s.version);

    const idle = ready && !isPlaying && !scrubbing;
    const beats =
        idle && selectedPage ? collisionWindow(selectedPage, pages) : null;
    const pageId = selectedPage?.id;
    // By value, so an unchanged request keeps its identity across renders
    const live = useMemo<CollisionRequest | null>(
        () =>
            beats && pageId !== undefined
                ? { pageId, ...beats, version }
                : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pageId, beats?.fromBeat, beats?.toBeat, version],
    );
    const settled = useSettled(live, SETTLE_MS);
    // An answer the cache has (going back to a page) needs no settling
    const queryClient = useQueryClient();
    const request =
        live &&
        queryClient.getQueryData(collisionKeys.forRequest(live)) !== undefined
            ? live
            : settled;
    const { collisions } = useQueries({
        queries: [allMarchersQueryOptions(), collisionsQueryOptions(request)],
        combine: _combineCollisions,
    });

    const setCollisions = useCollisionStore((s) => s.setCollisions);
    const selectedPageId = selectedPage?.id;
    useEffect(() => {
        // An answer for a page no longer selected waits for the next request
        if (!collisions || !request || request.pageId !== selectedPageId)
            return;
        setCollisions({ id: request.pageId }, collisions, request.version);
    }, [collisions, request, selectedPageId, setCollisions]);
}
