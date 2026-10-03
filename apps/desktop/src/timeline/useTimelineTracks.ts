import { useEffect, useMemo, useRef, useState } from "react";
import type { Diagnostic, SpanInfo } from "@openmarch/core";
import { asc } from "drizzle-orm";
import { schema } from "@/global/database/db";
import { withTimelineWriteLock } from "@/db-functions/history";
import { timelineDisplayVersion } from "@/db-functions/timelineDisplay";
import type { DbConnection, DbTransaction } from "@/db-functions/types";
import type { TimelineInput } from "@/components/timeline/Timeline";
import { assignmentFromRow } from "./timelineRows";
import { resolverSpans, useTimelineResolverStore } from "./timelineStore";
import { useTimelineViewVersions } from "./useTimelineViewVersions";
import {
    buildTimelineClipTracks,
    type TimelineViewTables,
} from "./timelineViewModel";

/**
 * Reads the rows the view-model adapter needs. Call it where no timeline write can commit between
 * its reads, such as inside the write lock.
 */
export async function readTimelineViewTables(
    db: DbConnection | DbTransaction,
): Promise<TimelineViewTables> {
    const timelines = await db.select().from(schema.timelines).all();
    const transitions = await db
        .select()
        .from(schema.timeline_transitions)
        .all();
    const assignments = await db
        .select()
        .from(schema.timeline_assignments)
        .orderBy(asc(schema.timeline_assignments.id))
        .all();
    const shapes = await db
        .select({
            id: schema.timeline_shapes.id,
            name: schema.timeline_shapes.name,
        })
        .from(schema.timeline_shapes)
        .all();
    const marchers = await db
        .select({
            id: schema.marchers.id,
            drill_prefix: schema.marchers.drill_prefix,
            drill_order: schema.marchers.drill_order,
        })
        .from(schema.marchers)
        .all();
    return {
        timelines: timelines.map((t) => ({
            id: t.id,
            name: t.name,
            start: t.start_beat,
            end: t.end_beat,
        })),
        transitions: transitions.map((t) => ({
            id: t.id,
            timelineId: t.timeline_id,
            destShapeId: t.dest_shape_id,
            slotCount: t.slot_count,
            start: t.start_beat,
            end: t.end_beat,
        })),
        assignments: assignments.map(assignmentFromRow),
        shapes,
        marchers: marchers.map((m) => ({
            id: m.id,
            label: `${m.drill_prefix}${m.drill_order}`,
        })),
    };
}

const NO_TRACKS: readonly TimelineInput[] = [];

/** Rows read under the write lock, with the resolver store version they match. */
interface VersionedTables {
    readonly version: number;
    /** The display version (P7.15) at the same moment */
    readonly displayVersion: number;
    readonly tables: TimelineViewTables;
}

/**
 * Reads the rows under the write lock, tagged with the store version at that moment. Batches are
 * applied to the resolver before the lock is released, so the rows and that version's resolver
 * describe the same commit.
 */
export const readVersionedTimelineViewTables = (
    database: DbConnection,
): Promise<VersionedTables> =>
    withTimelineWriteLock(async () => {
        const tables = await readTimelineViewTables(database);
        return {
            version: useTimelineResolverStore.getState().version,
            displayVersion: timelineDisplayVersion(),
            tables,
        };
    });

/**
 * The timeline's tracks for the open file (P8.8): the view-model adapter over the stored tables
 * and the resolver. It rebuilds whenever the resolver store's version changes, which every
 * committed timeline edit, undo, redo and cold build bumps. With `enabled` false (the timeline dev
 * flag off), or before the resolver is ready, it reads nothing and returns no tracks.
 *
 * - Tracks are only built from rows and a resolver of the same version. While the next version's
 *   rows load, the last tracks stay, so nothing flickers and no mismatched pair is ever built.
 * - Spans and diagnostics are cached per resolver version.
 * - One track per stored timeline (`buildTimelineClipTracks`, ui.md UI-9 "Tracks"), so the tracks
 *   don't depend on the selected marchers.
 */
export function useTimelineTracks({
    database,
    enabled,
}: {
    database: DbConnection;
    enabled: boolean;
}): readonly TimelineInput[] {
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const { version, displayVersion } = useTimelineViewVersions();
    const active = enabled && resolver !== null;

    const [loaded, setLoaded] = useState<VersionedTables | null>(null);
    useEffect(() => {
        if (!active) {
            setLoaded(null);
            return;
        }
        let current = true;
        readVersionedTimelineViewTables(database).then(
            (read) => {
                if (current) setLoaded(read);
            },
            (error: unknown) =>
                console.error("Couldn't read the timeline's tracks", error),
        );
        return () => {
            current = false;
        };
    }, [active, database, version, displayVersion]);

    // Per resolver version: the spans asked for so far, and the diagnostics
    const cache = useMemo(() => {
        void version; // the resolver answers differently after each version
        const spans = new Map<number, readonly SpanInfo[]>();
        let diagnostics: readonly Diagnostic[] | null = null;
        return {
            spansOf: (marcherId: number) => {
                let found = spans.get(marcherId);
                if (!found && resolver) {
                    found = resolverSpans(resolver, marcherId);
                    spans.set(marcherId, found);
                }
                return found ?? [];
            },
            diagnostics: () =>
                (diagnostics ??= resolver ? resolver.diagnostics() : []),
        };
    }, [resolver, version]);

    const built = useMemo(() => {
        if (!active || !loaded) return NO_TRACKS;
        // Rows of another version: wait for the matching read
        if (
            loaded.version !== version ||
            loaded.displayVersion !== displayVersion
        )
            return null;
        return buildTimelineClipTracks({
            tables: loaded.tables,
            spansOf: cache.spansOf,
            diagnostics: cache.diagnostics(),
        });
    }, [active, loaded, version, displayVersion, cache]);

    const last = useRef<readonly TimelineInput[]>(NO_TRACKS);
    if (built !== null) last.current = built;
    return built ?? last.current;
}
