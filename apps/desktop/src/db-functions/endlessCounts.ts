import { asc, count } from "drizzle-orm";
import { schema } from "@/global/database/db";
import {
    continuedCounts,
    countContinuation,
    type CountContinuation,
} from "@/timeline/countsPastEnd";
import { endlessBeatOfId } from "@/timeline/endlessTimeline";
import { createBeatsInTransaction } from "./beat";
import { createMeasuresInTransaction } from "./measures";
import {
    ensureSecondBeatHasPage,
    FIRST_PAGE_ID,
    updateLastPageCounts,
} from "./page";
import { afterHistoryCommit } from "./history";
import { readPageGrid, withTimelinePageRipple } from "./timelineRipple";
import { refuse } from "./timelineErrors";
import { text } from "@/timeline/timelineText";
import type { DbTransaction } from "./types";

/**
 * Storing counts past the last one (docs/timeline/endless-counts.md). The timeline draws counts on
 * forever (`timeline/countGrid.ts`), but pages and measures point at `beats` rows, so a write that
 * lands at or past the last stored count stores the counts up to it first, in its own transaction
 * and undo step (`ensureCountsInTransaction`). Looking, scrolling and playing store nothing.
 *
 * Appended counts continue the show's last measure as it sounds (`countContinuation`), the same
 * counts the grid draws there, so storing one changes nothing on screen. Measure lines carry on
 * with them. The append runs inside `withTimelinePageRipple`, like every beat edit: timeline rows
 * hold plain count numbers, and counts appended after the last one move none of them, even moves
 * that run past the show's end.
 *
 * A last page whose `last_page_counts` runs past the stored counts is drawn ending at the last
 * stored count (`fromDatabasePages`, `readPageGrid` clamp it there). Storing counts would let it
 * grow into them, moving its flag and every row ending on it, so the append first shortens
 * `last_page_counts` to the length the page is drawn with (`keepLastPageAsDrawn`).
 */

/**
 * Sets `last_page_counts` to the last page's drawn length where it runs past the stored counts, so
 * appending counts leaves the last flag where it is drawn. Every reader then agrees on that flag.
 */
async function keepLastPageAsDrawn(tx: DbTransaction): Promise<void> {
    const grid = await readPageGrid(tx);
    const last = grid.pages[grid.pages.length - 1];
    if (!last || last.id === FIRST_PAGE_ID) return;
    const utility = await tx
        .select({ lastPageCounts: schema.utility.last_page_counts })
        .from(schema.utility)
        .get();
    if (!utility || last.start + utility.lastPageCounts <= last.end) return;
    await updateLastPageCounts({ tx, lastPageCounts: last.end - last.start });
}

/** `countContinuation` for the show in `tx`, and its beat count (beat 0 included) */
async function readContinuation(tx: DbTransaction): Promise<{
    continuation: CountContinuation;
    beatCount: number;
}> {
    const beats = await tx
        .select({ id: schema.beats.id, duration: schema.beats.duration })
        .from(schema.beats)
        .orderBy(asc(schema.beats.position), asc(schema.beats.id))
        .all();
    const ordinal = new Map(beats.map((b, i) => [b.id, i]));
    const measures = await tx
        .select({ startBeat: schema.measures.start_beat })
        .from(schema.measures)
        .all();
    const measureStarts = measures.flatMap((m) => {
        const index = ordinal.get(m.startBeat);
        return index === undefined ? [] : [index];
    });
    return {
        continuation: countContinuation({ beats, measureStarts }),
        beatCount: beats.length,
    };
}

/**
 * Appends `counts` counts after the show's last count, continuing its tempo and meter, with a
 * measure line on each appended count that starts a measure. Call it inside a
 * `transactionWithHistory`. Returns the show's beat count afterwards (beat 0 included).
 */
export async function appendCountsInTransaction({
    tx,
    counts,
}: {
    tx: DbTransaction;
    counts: number;
}): Promise<number> {
    if (!Number.isInteger(counts) || counts < 0)
        refuse(`can't add ${counts} counts: it must be a whole number`);
    const { continuation, beatCount } = await readContinuation(tx);
    if (counts === 0) return beatCount;
    const appended = continuedCounts(continuation, counts);
    await keepLastPageAsDrawn(tx);
    const anchorFirstPage = await secondBeatHasPageOrNone(tx);
    // Only once the edit commits: a refused one stores nothing
    afterHistoryCommit(() => {
        storedCounts = true;
    });
    await withTimelinePageRipple(tx, async () => {
        const created = await createBeatsInTransaction({
            tx,
            newBeats: appended.map((count) => ({
                duration: count.duration,
                include_in_measure: true,
            })),
        });
        const downbeats = appended.flatMap((count, k) =>
            count.downbeat && created[k] ? [created[k].id] : [],
        );
        if (downbeats.length > 0)
            await createMeasuresInTransaction({
                tx,
                newItems: downbeats.map((start_beat) => ({
                    start_beat,
                    rehearsal_mark: null,
                    notes: null,
                })),
            });
        // A show with no counts gets its first page with its first count. A count-in before the
        // first page stays (#1055).
        if (anchorFirstPage) await ensureSecondBeatHasPage({ tx });
    });
    return beatCount + counts;
}

let storedCounts = false;

/** True if the show has no second count yet, or a page starts on it */
async function secondBeatHasPageOrNone(tx: DbTransaction): Promise<boolean> {
    const second = await tx
        .select({ page_id: schema.timing_objects.page_id })
        .from(schema.timing_objects)
        .orderBy(asc(schema.timing_objects.position))
        .limit(1)
        .offset(1)
        .get();
    return !second || second.page_id != null;
}

/**
 * Whether a committed edit has stored counts since the last call (which clears it); a refused one
 * never counts (`afterHistoryCommit`). Any write can store counts now, a move or a measure line
 * too, so the app refreshes the beats and measures after a write that did
 * (`refreshAfterStoredCounts`), whatever queries the write itself refreshes.
 */
export const takeStoredCounts = (): boolean => {
    const stored = storedCounts;
    storedCounts = false;
    return stored;
};

/**
 * The most counts one edit stores (docs/timeline/endless-counts.md EC-1): about an hour at 300 BPM, far
 * past any show, so a bad beat number can't make a runaway show.
 */
export const MAX_COUNTS_PER_EDIT = 20_000;

/**
 * Stores counts up to `through` (a spec beat ordinal; beat 0 included) when the show has fewer,
 * continuing its last measure (`appendCountsInTransaction`). Call it first in a write that can
 * name a count past the stored end, inside its `transactionWithHistory`, so one undo removes the
 * counts with the edit. A no-op when the counts are already there. Returns the beat count after.
 *
 * What a write needs: a page flag at `b` that ends the last page needs `through: b`; a page or a
 * measure starting at `b` needs the beat itself, `through: b + 1`; a move ending at `b` needs
 * `through: b`. Refuses (`E-ARGS`) past `MAX_COUNTS_PER_EDIT` new counts.
 */
export async function ensureCountsInTransaction({
    tx,
    through,
}: {
    tx: DbTransaction;
    through: number;
}): Promise<number> {
    if (!Number.isFinite(through))
        refuse(`can't store counts up to beat ${through}`);
    const beatCount =
        (await tx.select({ n: count() }).from(schema.beats).get())?.n ?? 0;
    const need = Math.ceil(through);
    if (need <= beatCount) return beatCount;
    if (need - beatCount > MAX_COUNTS_PER_EDIT)
        refuse(
            text.t("timeline.refusals.tooFarPastEnd", {
                count: need - beatCount,
                max: MAX_COUNTS_PER_EDIT,
            }),
        );
    return await appendCountsInTransaction({ tx, counts: need - beatCount });
}

/**
 * The stored id for a beat id a write names: a stored one as it is; an endless one (`endlessIdOf`,
 * past the stored counts) has the counts up to it stored first, in the same edit, and becomes that
 * stored beat's id.
 */
export async function storedBeatIdInTransaction({
    tx,
    beatId,
}: {
    tx: DbTransaction;
    beatId: number;
}): Promise<number> {
    const beat = endlessBeatOfId(beatId);
    if (beat === null) return beatId;
    await ensureCountsInTransaction({ tx, through: beat + 1 });
    const row = await tx
        .select({ id: schema.beats.id })
        .from(schema.beats)
        .orderBy(asc(schema.beats.position))
        .limit(1)
        .offset(beat)
        .get();
    if (!row) refuse(`no count ${beat} to write on`);
    return row.id;
}
