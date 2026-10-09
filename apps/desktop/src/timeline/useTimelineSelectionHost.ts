import { useEffect } from "react";
import { eq } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbConnection, DbTransaction } from "@/db-functions/types";
import {
    useTimelineSelectionStore,
    type StoredTimelineMembership,
} from "@/stores/TimelineSelectionStore";
import { useTimelineViewVersions } from "./useTimelineViewVersions";
import { readVersionedTimelineViewTables } from "./useTimelineTracks";
import type { TimelineViewTables } from "./timelineViewModel";

/**
 * Every stored timeline with its name and the marchers that have an assignment in one of its
 * transitions, ordered by start, then id.
 */
export async function readStoredTimelineMemberships(
    db: DbConnection | DbTransaction,
): Promise<StoredTimelineMembership[]> {
    const timelines = await db
        .select({
            id: schema.timelines.id,
            start: schema.timelines.start_beat,
            end: schema.timelines.end_beat,
            name: schema.timelines.name,
        })
        .from(schema.timelines)
        .all();
    const rows = await db
        .select({
            timelineId: schema.timeline_transitions.timeline_id,
            marcherId: schema.timeline_assignments.marcher_id,
        })
        .from(schema.timeline_assignments)
        .innerJoin(
            schema.timeline_transitions,
            eq(
                schema.timeline_assignments.transition_id,
                schema.timeline_transitions.id,
            ),
        )
        .all();
    const members = new Map<number, Set<number>>();
    for (const row of rows) {
        let set = members.get(row.timelineId);
        if (!set) members.set(row.timelineId, (set = new Set()));
        set.add(row.marcherId);
    }
    return timelines
        .sort((a, b) => a.start - b.start || a.id - b.id)
        .map((t) => ({ ...t, marcherIds: members.get(t.id) ?? new Set() }));
}

/**
 * `readStoredTimelineMemberships`, from the rows the timeline views share
 * (`readVersionedTimelineViewTables`): a marcher belongs to a timeline when one of its assignments
 * is in one of the timeline's transitions.
 */
export function storedTimelineMembershipsFromTables(
    tables: Pick<
        TimelineViewTables,
        "timelines" | "transitions" | "assignments"
    >,
): StoredTimelineMembership[] {
    const timelineOfTransition = new Map<number, number>();
    for (const t of tables.transitions)
        timelineOfTransition.set(t.id, t.timelineId);
    const members = new Map<number, Set<number>>();
    for (const a of tables.assignments) {
        const timelineId = timelineOfTransition.get(a.transition);
        if (timelineId === undefined) continue;
        let set = members.get(timelineId);
        if (!set) members.set(timelineId, (set = new Set()));
        set.add(a.marcher);
    }
    return tables.timelines
        .map((t) => ({ id: t.id, start: t.start, end: t.end, name: t.name }))
        .sort((a, b) => a.start - b.start || a.id - b.id)
        .map((t) => ({ ...t, marcherIds: members.get(t.id) ?? new Set() }));
}

/**
 * Keeps `useTimelineSelectionStore`'s `storedTimelines` current in timeline mode: reloads them
 * after every committed timeline edit, undo, redo and cold build (the resolver and display
 * versions), reading under the write lock so no write lands between the reads. With `enabled`
 * false it clears them. Mount once, with the resolver session (`TimelineResolverHost`).
 */
export function useTimelineSelectionHost(
    database: DbConnection,
    enabled: boolean,
): void {
    const { version, displayVersion } = useTimelineViewVersions();
    const setStoredTimelines = useTimelineSelectionStore(
        (s) => s.setStoredTimelines,
    );
    useEffect(() => {
        if (!enabled) {
            setStoredTimelines(null);
            return;
        }
        let current = true;
        // The rows the tracks and the inspector read for the same versions, read once
        readVersionedTimelineViewTables(database).then(
            ({ tables }) => {
                if (current)
                    setStoredTimelines(
                        storedTimelineMembershipsFromTables(tables),
                    );
            },
            (error: unknown) =>
                console.error("Couldn't read the stored timelines", error),
        );
        return () => {
            current = false;
        };
    }, [database, enabled, version, displayVersion, setStoredTimelines]);
}
