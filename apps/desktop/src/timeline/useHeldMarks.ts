import { useEffect, useMemo } from "react";
import { create } from "zustand";
import type { DbConnection } from "@/db-functions/types";
import { useTimelineDisplayStore } from "@/db-functions/timelineDisplay";
import { readHeldMarks, type HeldMark } from "@/db-functions/timelineHeldMarks";
import { selectionHeldBars, type SelectionHeldBar } from "./timelineHeldBars";
import { useTimelineResolverStore } from "./timelineStore";

/**
 * The stored Held marks (`timeline_held_marks`) as the renderer sees them, for the timeline's Held
 * bars. Read by `useHeldMarksHost` after every committed edit, undo or redo that may have changed
 * them: the marks aren't in the change log, so it follows the resolver's version (an edit that
 * also wrote rows) and the display version (an edit that wrote only marks).
 */
export const useHeldMarksStore = create<{
    marks: readonly HeldMark[];
    /**
     * The resolver version (`useTimelineResolverStore`) the marks were read for, or `null` before
     * the first read. Behind the resolver's version, the marks may be older than the rows: the
     * field's look waits for them rather than drawing a Held marcher Not defined for a frame.
     */
    version: number | null;
}>(() => ({
    marks: [],
    version: null,
}));

let reads = 0;

/**
 * Reads the Held marks again into `useHeldMarksStore`; a late older read is dropped.
 *
 * @param version the resolver version the read is for; a failed read still records it, so
 *   nothing waits on marks that won't come
 */
export async function refreshHeldMarks(
    database: DbConnection,
    version: number | null = useTimelineResolverStore.getState().version,
): Promise<void> {
    const read = ++reads;
    try {
        const marks = await readHeldMarks(database);
        if (read === reads) useHeldMarksStore.setState({ marks, version });
    } catch (error) {
        console.error("Couldn't read the Held marks", error);
        if (read === reads) useHeldMarksStore.setState({ version });
    }
}

/**
 * Keeps `useHeldMarksStore` current while `enabled` (timeline mode): one read per resolver or
 * display version. Mounted once, by `TimelineResolverHost`.
 */
export function useHeldMarksHost(
    database: DbConnection,
    enabled: boolean,
): void {
    const version = useTimelineResolverStore((s) => s.version);
    const display = useTimelineDisplayStore((s) => s.version);
    useEffect(() => {
        if (!enabled) {
            reads++;
            useHeldMarksStore.setState({ marks: [], version: null });
            return;
        }
        void refreshHeldMarks(database, version);
    }, [database, enabled, version, display]);
}

export const NO_HELD_BARS: readonly SelectionHeldBar[] = [];

/**
 * The selection's Held bars (`selectionHeldBars`), worked out once per selection and set of marks.
 *
 * @param marcherIds the selected marchers; keep the array stable while the selection is
 */
export function useSelectionHeldBars(
    marcherIds: readonly number[],
): readonly SelectionHeldBar[] {
    const marks = useHeldMarksStore((s) => s.marks);
    return useMemo(() => {
        const bars = selectionHeldBars(marks, marcherIds);
        return bars.length === 0 ? NO_HELD_BARS : bars;
    }, [marks, marcherIds]);
}
