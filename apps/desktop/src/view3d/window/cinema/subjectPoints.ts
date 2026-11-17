/**
 * Who a camera shot is about, as points on the field.
 *
 * `@openmarch/core`'s `cameraAt` asks its context for a subject's points at a
 * show time. This builds that context in the 3D View window from the show's
 * positions, sections and tags.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
    fieldFootprint,
    stepMeters,
    type CinemaContext,
    type CinemaSubject,
    type FieldProperties,
    type WorldPoint,
} from "@openmarch/core";
import { fieldPropertiesQueryOptions } from "@/hooks/queries/useFieldProperties";
import { allMarchersQueryOptions } from "@/hooks/queries/useMarchers";
import { marcherIdsForAllTagIdsQueryOptions } from "@/hooks/queries/tags/queries";
import { useShowPositions, type ShowPositions } from "@/view3d/positions";

/** What subject resolution needs to know about a marcher. */
export interface CinemaMarcher {
    id: number;
    section: string;
    tagIds: readonly number[];
}

/** How many (subject, time) answers {@link createSubjectPoints} keeps. */
export const SUBJECT_CACHE_SIZE = 256;
/** Times are rounded to this many per second before they are sampled. */
const BUCKETS_PER_SECOND = 60;

const NO_POINTS: readonly WorldPoint[] = [];

/**
 * A cache key for the subject, or null for a subject that has no marchers
 * (`center`, `region` and `spot` are resolved in core and never asked for).
 */
function subjectKey(subject: CinemaSubject): string | null {
    switch (subject.kind) {
        case "band":
            return "band";
        case "section":
            return `section:${subject.section}`;
        case "tag":
            return `tag:${subject.tagId}`;
        case "set":
            return `set:${subject.marcherIds.join(",")}`;
        case "marcher":
            return `marcher:${subject.marcherId}`;
        default:
            return null;
    }
}

/**
 * Builds `CinemaContext.subjectPoints` over the show's positions.
 *
 * A shot's framing samples its subject at about nine times around the frame's
 * time, and those times repeat from one frame to the next. Answers are cached
 * per subject and time rounded to 1/60 s (the {@link SUBJECT_CACHE_SIZE} most
 * recently used), and a time is sampled at its rounded value, so the answer
 * for a time never depends on which times were asked before it.
 *
 * Times before the show, and times that are not numbers, read as its start.
 * Times past its end read as the scene draws them (`ShowPositions`).
 *
 * The returned array belongs to the cache: callers copy it if they keep it.
 * Build a new function when the positions, marchers or field change.
 */
export function createSubjectPoints(
    positions: ShowPositions,
    marchers: readonly CinemaMarcher[],
    fieldProperties: FieldProperties,
): CinemaContext["subjectPoints"] {
    const known = new Set(marchers.map((m) => m.id));
    /** The subject's marcher ids, by subject key. They don't change with time. */
    const idsByKey = new Map<string, readonly number[]>();
    const idsOf = (subject: CinemaSubject, key: string): readonly number[] => {
        let ids = idsByKey.get(key);
        if (ids) return ids;
        switch (subject.kind) {
            case "band":
                ids = marchers.map((m) => m.id);
                break;
            case "section":
                ids = marchers
                    .filter((m) => m.section === subject.section)
                    .map((m) => m.id);
                break;
            case "tag":
                ids = marchers
                    .filter((m) => m.tagIds.includes(subject.tagId))
                    .map((m) => m.id);
                break;
            case "set":
                ids = subject.marcherIds.filter((id) => known.has(id));
                break;
            case "marcher":
                ids = known.has(subject.marcherId) ? [subject.marcherId] : [];
                break;
            default:
                ids = [];
        }
        idsByKey.set(key, ids);
        return ids;
    };

    // A Map keeps insertion order, so its first key is the least recently used.
    const cache = new Map<string, readonly WorldPoint[]>();
    const scratch: WorldPoint = { x: 0, z: 0 };

    return (subject, ms) => {
        const key = subjectKey(subject);
        if (key === null) return NO_POINTS;
        const ids = idsOf(subject, key);
        if (ids.length === 0) return NO_POINTS;

        const bucket = Math.round(
            ((ms > 0 ? ms : 0) * BUCKETS_PER_SECOND) / 1000,
        );
        const cacheKey = `${key}@${bucket}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            cache.delete(cacheKey);
            cache.set(cacheKey, cached);
            return cached;
        }

        const at = (bucket * 1000) / BUCKETS_PER_SECOND;
        const points: WorldPoint[] = [];
        for (const id of ids)
            if (positions.positionInto(id, at, fieldProperties, scratch))
                points.push({ x: scratch.x, z: scratch.z });
        if (cache.size >= SUBJECT_CACHE_SIZE)
            cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, points);
        return points;
    };
}

/**
 * The context `cameraAt` needs, for the show open in the 3D View window: its
 * field, and its marchers' positions, sections and tags (the queries the
 * performers' appearances use). Null until the positions, the marchers and
 * the field have loaded.
 *
 * @param aspect - the picture's width over its height
 */
export function useCinemaContext(aspect: number): CinemaContext | null {
    const { positions } = useShowPositions();
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const { data: marcherIdsByTagId } = useQuery(
        marcherIdsForAllTagIdsQueryOptions(),
    );
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());

    const cinemaMarchers = useMemo<CinemaMarcher[] | null>(() => {
        if (!marchers) return null;
        const tagIds = new Map<number, number[]>();
        for (const [tagId, marcherIds] of marcherIdsByTagId ?? [])
            for (const marcherId of marcherIds) {
                const list = tagIds.get(marcherId);
                if (list) list.push(tagId);
                else tagIds.set(marcherId, [tagId]);
            }
        return marchers.map((m) => ({
            id: m.id,
            section: m.section,
            tagIds: tagIds.get(m.id) ?? [],
        }));
    }, [marchers, marcherIdsByTagId]);

    const subjectPoints = useMemo(
        () =>
            positions && cinemaMarchers && fieldProperties
                ? createSubjectPoints(
                      positions,
                      cinemaMarchers,
                      fieldProperties,
                  )
                : null,
        [positions, cinemaMarchers, fieldProperties],
    );

    return useMemo(
        () =>
            subjectPoints && fieldProperties
                ? {
                      footprint: fieldFootprint(fieldProperties),
                      stepMeters: stepMeters(fieldProperties),
                      aspect,
                      subjectPoints,
                  }
                : null,
        [subjectPoints, fieldProperties, aspect],
    );
}
