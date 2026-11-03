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
export const useHeldMarksStore = create<{ marks: readonly HeldMark[] }>(() => ({
    marks: [],
}));

let reads = 0;

/** Reads the Held marks again into `useHeldMarksStore`; a late older read is dropped. */
export async function refreshHeldMarks(database: DbConnection): Promise<void> {
    const read = ++reads;
    try {
        const marks = await readHeldMarks(database);
        if (read === reads) useHeldMarksStore.setState({ marks });
    } catch (error) {
        console.error("Couldn't read the Held marks", error);
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
            useHeldMarksStore.setState({ marks: [] });
            return;
        }
        void refreshHeldMarks(database);
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
