import { eq } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import { readShowTiming } from "@/timeline/convert/convertPagesInTransaction";
import { pageFlags } from "@/timeline/timelinePlayhead";
import { autoMoveNumber, moveLabels } from "@/timeline/timelineViewModel";
import type { DbConnection, DbTransaction } from "./types";
import {
    createTimelinesInTransaction,
    type DatabaseTimeline,
} from "./timelines";

/**
 * Stable move numbers (docs/timeline/ui.md UI-14, round-2 review). A move, a stored timeline off
 * the page boxes, stores its "Move N" as its name when it is made, so its number survives deletes,
 * undo, redo and reload: nothing renumbers it, and SQLite reusing a deleted id doesn't matter.
 * A new move takes one more than the highest stored "Move N". Moves from before this (unnamed,
 * labelled by `moveLabels`) get the number they show the first time a new move is made, so the
 * new one never takes a number already on screen.
 */

/** The page boxes, previous flag to flag (UI-9), as `[start, end)` spec beats. */
export const readPageBoxes = async (
    db: DbConnection | DbTransaction,
): Promise<{ start: number; end: number }[]> => {
    const { pages } = await readShowTiming(db);
    return pageFlags([...pages].sort((a, b) => a.order - b.order)).flatMap(
        (f) => (f.range ? [{ start: f.range.start, end: f.range.end }] : []),
    );
};

type PageBoxes = readonly { start: number; end: number }[];

/**
 * Whether `[start, end)` is exactly a page box: a page's timeline, not a move. `pageBoxes`, when
 * the caller has read them already, saves reading them again.
 */
export const isPageBoxRange = async (
    db: DbConnection | DbTransaction,
    { start, end }: { start: number; end: number },
    pageBoxes?: PageBoxes,
): Promise<boolean> =>
    (pageBoxes ?? (await readPageBoxes(db))).some(
        (b) => b.start === start && b.end === end,
    );

/**
 * The name for a move being made now: "Move N", one more than any stored. Unnamed moves first
 * store the label they show (`moveLabels`), so their numbers stay put. `pageBoxes`, when the
 * caller has read them already, saves reading them again.
 */
export const nextMoveNameInTransaction = async (
    tx: DbTransaction,
    pageBoxes?: PageBoxes,
): Promise<string> => {
    const rows = await tx
        .select({
            id: schema.timelines.id,
            name: schema.timelines.name,
            start: schema.timelines.start_beat,
            end: schema.timelines.end_beat,
        })
        .from(schema.timelines)
        .all();
    const labels = moveLabels(rows, pageBoxes ?? (await readPageBoxes(tx)));
    let highest = 0;
    for (const row of rows) {
        const label = row.name ?? labels.get(row.id);
        if (row.name === null && label !== undefined)
            await tx
                .update(schema.timelines)
                .set({ name: label })
                .where(eq(schema.timelines.id, row.id));
        highest = Math.max(highest, autoMoveNumber(label) ?? 0);
    }
    return `Move ${highest + 1}`;
};

/**
 * Creates the timeline over `[startBeat, endBeat)`: a move gets its number
 * (`nextMoveNameInTransaction`), a page box's timeline stays unnamed.
 */
export const createRangeTimelineInTransaction = async (
    tx: DbTransaction,
    { startBeat, endBeat }: { startBeat: number; endBeat: number },
): Promise<DatabaseTimeline> => {
    // The beats and pages read once, for both
    const pageBoxes = await readPageBoxes(tx);
    const name = (await isPageBoxRange(
        tx,
        { start: startBeat, end: endBeat },
        pageBoxes,
    ))
        ? null
        : await nextMoveNameInTransaction(tx, pageBoxes);
    const [timeline] = await createTimelinesInTransaction({
        tx,
        newTimelines: [{ name, startBeat, endBeat }],
    });
    return timeline!;
};
