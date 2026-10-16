/**
 * Performer positions for the 3D View (ADR 0002 D-6, docs/3d/design.md §8).
 *
 * This is the only place the 3D View computes where a performer is. Scene code
 * calls {@link useShowPositions} once and reads positions from the
 * {@link ShowPositions} it returns.
 *
 * - Positions come from the timeline resolver, as the 2D canvas and the
 *   exports get them: a show time becomes a beat through the tempo map
 *   (`beatAtTime`), and the resolver gives every marcher's position there.
 * - The window builds its own resolver from the timeline tables. Every
 *   committed timeline change in the editor invalidates
 *   {@link VIEW3D_TIMELINE_QUERY_KEY} (`useView3dPublisher`), so it is rebuilt.
 * - Positions are in world meters on the ground plane (`@openmarch/core`
 *   `pixelsToWorld`): +X toward side 2, +Z toward the audience.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { FieldProperties, Resolver, WorldPoint } from "@openmarch/core";
import { db } from "@/global/database/db";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import type { BeatTiming } from "@/timeline/timeMap";
import { PositionBuffer, playbackBeat } from "@/timeline/positionBuffer";
import { acquireExportResolver } from "@/timeline/timelineExport";
import { VIEW3D_TIMELINE_QUERY_KEY } from "@/view3d/sync/protocol";

/** As in `@openmarch/core` `world.ts`. */
const METERS_PER_INCH = 0.0254;

/**
 * What {@link ShowPositions} needs from a resolver. `marcherIds()` must be
 * ascending, as `@openmarch/core`'s resolver returns them (`PositionSource`):
 * {@link PositionBuffer} finds marchers by binary search.
 */
export type PositionResolver = Pick<Resolver, "marcherIds" | "positionsAt">;

/**
 * Every marcher's position at any show time, from one resolver and the show's
 * beats. Reading positions at one time for many marchers samples the resolver
 * once: the last sampled time is kept, so read all marchers at one time before
 * moving to the next.
 *
 * Sampling is the shared {@link PositionBuffer} and `playbackBeat`, as the 2D
 * fields sample it, so both views agree on where a marcher is at a time.
 */
export class ShowPositions {
    private readonly known: ReadonlySet<number>;
    private readonly sampled: PositionBuffer;
    private sampledMs = Number.NaN;

    constructor(
        resolver: PositionResolver,
        private readonly beats: readonly BeatTiming[],
    ) {
        this.known = new Set(resolver.marcherIds());
        this.sampled = new PositionBuffer({
            marcherIds: () => resolver.marcherIds(),
            positionsAt: (beat, out) => {
                resolver.positionsAt(beat, out);
                return true;
            },
        });
    }

    /** Whether the resolver knows `marcherId`. */
    has(marcherId: number): boolean {
        return this.known.has(marcherId);
    }

    /**
     * Writes a marcher's position at `ms` into `out`, in world meters, and
     * returns true; returns false, leaving `out` untouched, when the resolver
     * doesn't know the marcher or the time isn't a number. Allocates nothing.
     *
     * @param marcherId - the marcher
     * @param ms - show time in milliseconds
     * @param fieldProperties - the show's field, for the pixel-to-meter mapping
     * @param out - receives the position in world meters
     */
    positionInto(
        marcherId: number,
        ms: number,
        fieldProperties: FieldProperties,
        out: WorldPoint,
    ): boolean {
        if (!this.known.has(marcherId) || Number.isNaN(ms)) return false;
        if (ms !== this.sampledMs) {
            this.sampled.fill(playbackBeat(this.beats, ms));
            this.sampledMs = ms;
        }
        const i = this.sampled.indexOf(marcherId);
        if (i < 0) return false;
        const buffer = this.sampled.buffer;
        // As `pixelsToWorld`.
        const k =
            (fieldProperties.stepSizeInches * METERS_PER_INCH) /
            fieldProperties.pixelsPerStep;
        out.x = (buffer[i * 2] - fieldProperties.centerFrontPoint.xPixels) * k;
        out.z =
            (buffer[i * 2 + 1] - fieldProperties.centerFrontPoint.yPixels) * k;
        return true;
    }

    /** {@link positionInto} returning a new point, or null. */
    positionAt(
        marcherId: number,
        ms: number,
        fieldProperties: FieldProperties,
    ): WorldPoint | null {
        const out = { x: 0, z: 0 };
        return this.positionInto(marcherId, ms, fieldProperties, out)
            ? out
            : null;
    }
}

/** The window's resolver, cold-built from the timeline tables. */
export const view3dResolverQueryOptions = () => ({
    queryKey: VIEW3D_TIMELINE_QUERY_KEY,
    queryFn: () => acquireExportResolver(db),
    // A resolver is not plain data: never merge an old one into a new one
    structuralSharing: false,
});

export type ShowPositionsReturn = {
    /** Null until the resolver and the beats have loaded, and on error. */
    positions: ShowPositions | null;
    isLoading: boolean;
    hasError: boolean;
};

/**
 * Loads the show's resolver and beats in the 3D View window and returns the
 * {@link ShowPositions} over them. A new object comes back whenever either
 * changes, so callers can key on it.
 */
export function useShowPositions(): ShowPositionsReturn {
    const {
        beats,
        isLoading: timingLoading,
        hasError: timingError,
    } = useTimingObjects();
    const {
        data: resolver,
        isLoading: resolverLoading,
        isError: resolverError,
    } = useQuery(view3dResolverQueryOptions());

    return useMemo(() => {
        const isLoading = timingLoading || resolverLoading;
        const hasError = timingError || resolverError;
        if (isLoading || hasError || !resolver)
            return { positions: null, isLoading, hasError };
        return {
            positions: new ShowPositions(resolver, beats),
            isLoading: false,
            hasError: false,
        };
    }, [
        beats,
        resolver,
        timingLoading,
        timingError,
        resolverLoading,
        resolverError,
    ]);
}
