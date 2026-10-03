import { eq, inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { refuse } from "./timelineErrors";
import {
    readPageGrid,
    timelineModeInTransaction,
    type GridPage,
    type PageGrid,
} from "./timelineRipple";
import {
    createPagesInTransaction,
    FIRST_PAGE_ID,
    realDatabasePageToDatabasePage,
    updateLastPageCounts,
    type DatabasePage,
} from "./page";

/**
 * Page flags in timeline mode (docs/timeline/ui.md UI-9 **+** and Deleting a flag; P8.13).
 *
 * A page is a cosmetic flag: it owns no motion (C-12). Page N is named by its **end** flag, where
 * marchers arrive, and its box is the range from the previous flag to its own. Pages still store
 * their **start** beat, so in rows a flag at beat `b` is the start beat of the page after it (or,
 * for the last page, its start plus `utility.last_page_counts`).
 *
 * These edits write only page rows, and `last_page_counts` when the last page changes. They never
 * run `withTimelinePageRipple` (P7.4): no timeline, transition or assignment is created, moved or
 * deleted, so motion is unchanged. Timelines track flags only when a flag moves; adding or
 * deleting one moves no other flag. Each is one undoable edit.
 *
 * Beats here are ordinals (resolver beats), the same as timeline rows and `readPageGrid`: page 0
 * holds the zero-length beat 0 and its flag is at beat 1 (show time 0).
 */

/** What **+** at a beat does, or null where it isn't offered. */
export type PageFlagInsertion =
    /** Split `page` at `beat`: the new page takes `[page.start, beat)`; `page` keeps its flag */
    | { kind: "split"; beat: number; page: GridPage; last: boolean }
    /** Past the last flag: a new last page `[lastPage.end, beat)` */
    | { kind: "append"; beat: number; lastPage: GridPage };

/** The page grid's shape the plan needs. `readPageGrid` returns one, and so does `pageFlagGrid`. */
export interface PageFlagGrid {
    /** How many beats the show has, beat 0 included */
    beatCount: number;
    /** Pages in show order with their ordinal range `[start, end)` */
    pages: readonly GridPage[];
}

/**
 * Builds a `PageFlagGrid` from the renderer's pages (`useTimingObjects`), for deciding whether to
 * show **+**: a page's range is its first beat's index to `pageEndBeat` (the same as `readPageGrid`).
 */
export function pageFlagGrid(
    pages: readonly {
        readonly id: number;
        readonly beats: readonly { readonly index: number }[];
    }[],
    beatCount: number,
): PageFlagGrid {
    const out: GridPage[] = [];
    for (const page of pages) {
        const first = page.beats[0];
        const last = page.beats[page.beats.length - 1];
        if (!first || !last) continue;
        out.push({ id: page.id, start: first.index, end: last.index + 1 });
    }
    out.sort((a, b) => a.start - b.start);
    return { beatCount, pages: out };
}

/**
 * What **+** does at `beat` (UI-9): inside a page (strictly between its start and its flag) it
 * splits that page; past the last flag, while the show still has beats up to `beat`, it appends a
 * page ending there. On a flag, at or before home's flag (beat 1), past the show's beats, or at a
 * fractional beat, there's nothing to add (null).
 */
export function planPageFlagInsertion(
    grid: PageFlagGrid,
    beat: number,
): PageFlagInsertion | null {
    if (!Number.isInteger(beat) || grid.pages.length === 0) return null;
    const pages = grid.pages;
    const lastPage = pages[pages.length - 1]!;
    if (beat > lastPage.end)
        return beat <= grid.beatCount
            ? { kind: "append", beat, lastPage }
            : null;
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i]!;
        if (page.start < beat && beat < page.end)
            return page.id === FIRST_PAGE_ID
                ? null
                : { kind: "split", beat, page, last: i === pages.length - 1 };
    }
    return null;
}

const gridOf = (grid: PageGrid): PageFlagGrid => ({
    beatCount: grid.beatIds.length,
    pages: grid.pages,
});

const lastPageCountsIn = async (tx: DbTransaction): Promise<number> => {
    const utility = await tx
        .select({ lastPageCounts: schema.utility.last_page_counts })
        .from(schema.utility)
        .get();
    if (!utility) refuse("the file has no utility record");
    return utility.lastPageCounts;
};

const refuseOutsideTimelineMode = async (tx: DbTransaction, what: string) => {
    if (!(await timelineModeInTransaction(tx)))
        refuse(`${what} is only for timeline mode`);
};

/** A page added by **+**: the new page row and its page timeline's range `[startBeat, endBeat)`. */
export interface AddedPageFlag {
    page: DatabasePage;
    startBeat: number;
    endBeat: number;
}

/**
 * **+** (UI-9) at `beat`, inside a `transactionWithHistory`. Refuses (`E-ARGS`) outside timeline
 * mode and where `planPageFlagInsertion` offers nothing.
 *
 * - **Split:** the split page's `start_beat` moves to `beat`, and a new page row takes its old
 *   start, so the split page keeps its flag, id and data (notes, appearance) and the new page comes
 *   before it. Later pages renumber; no `is_subset` page is made. Splitting the last page also
 *   rewrites `last_page_counts` so its flag stays where it was.
 * - **Append:** a new page starts at the last flag and ends at `beat` (`last_page_counts`).
 *
 * Returns the new page and its range, which is the page timeline the UI selects.
 */
export async function addPageFlagInTransaction({
    tx,
    beat,
}: {
    tx: DbTransaction;
    beat: number;
}): Promise<AddedPageFlag> {
    await refuseOutsideTimelineMode(tx, "Adding a page flag");
    const grid = await readPageGrid(tx);
    const plan = planPageFlagInsertion(gridOf(grid), beat);
    if (!plan)
        refuse(
            `no page can be added at beat ${beat}: it is on a flag, at home, or past the show's beats`,
        );

    if (plan.kind === "split") {
        const { page } = plan;
        const lastPageCounts = plan.last ? await lastPageCountsIn(tx) : 0;
        // The split page moves off its start first: `pages.start_beat` is unique
        await tx
            .update(schema.pages)
            .set({ start_beat: grid.beatIds[beat]! })
            .where(eq(schema.pages.id, page.id));
        const [created] = await createPagesInTransaction({
            tx,
            newPages: [
                { start_beat: grid.beatIds[page.start]!, is_subset: false },
            ],
        });
        // Keep the last flag where it was, even where the show's beats end before it
        if (plan.last)
            await updateLastPageCounts({
                tx,
                lastPageCounts: page.start + lastPageCounts - beat,
            });
        return { page: created!, startBeat: page.start, endBeat: beat };
    }

    const start = plan.lastPage.end;
    const [created] = await createPagesInTransaction({
        tx,
        newPages: [{ start_beat: grid.beatIds[start]!, is_subset: false }],
    });
    await updateLastPageCounts({ tx, lastPageCounts: beat - start });
    return { page: created!, startBeat: start, endBeat: beat };
}

/** **+** (UI-9) at `beat` as one undoable edit. See `addPageFlagInTransaction`. */
export async function addPageFlag({
    db,
    beat,
}: {
    db: DbConnection;
    beat: number;
}): Promise<AddedPageFlag> {
    return await transactionWithHistory(
        db,
        "addPageFlag",
        async (tx) => await addPageFlagInTransaction({ tx, beat }),
    );
}

/**
 * Deletes page flags (UI-9 Deleting a flag), inside a `transactionWithHistory`. Refuses (`E-ARGS`)
 * outside timeline mode and for a page that doesn't exist. Page 0 (home) is skipped, as page mode
 * skips it.
 *
 * Deleting page N's flag removes only that flag; every other flag stays. Page N's row is deleted
 * and the page after it takes N's start, so it keeps its own flag, id and data, and its box now
 * covers N's too (the inverse of **+**). For the last page there is no page after it: its row is
 * deleted and the page before becomes the last one, ending at its own flag (`last_page_counts`).
 * N's per-page data goes with its row. No timeline row is written, so motion is unchanged.
 *
 * Returns the deleted pages.
 */
export async function deletePageFlagsInTransaction({
    tx,
    pageIds,
}: {
    tx: DbTransaction;
    pageIds: ReadonlySet<number>;
}): Promise<DatabasePage[]> {
    await refuseOutsideTimelineMode(tx, "Deleting a page flag");
    const ids = [...pageIds].filter((id) => id !== FIRST_PAGE_ID);
    if (ids.length === 0) return [];
    const initial = await readPageGrid(tx);
    const order = new Map(initial.pages.map((p, i) => [p.id, i]));
    for (const id of ids)
        if (!order.has(id)) refuse(`page ${id} doesn't exist`);
    // Latest first, re-reading the grid each time, so each delete sees the pages it leaves
    ids.sort((a, b) => order.get(b)! - order.get(a)!);

    const deleted: DatabasePage[] = [];
    for (const id of ids) {
        const grid = await readPageGrid(tx);
        const index = grid.pages.findIndex((p) => p.id === id);
        const page = grid.pages[index]!;
        const next = grid.pages[index + 1];
        const previous = grid.pages[index - 1]!;

        const row = await tx
            .select()
            .from(schema.pages)
            .where(eq(schema.pages.id, id))
            .get();
        // The page goes before the next one takes its start: `pages.start_beat` is unique.
        // Its marcher pages are frozen in timeline mode (P9.5) and may go only once it's gone; they
        // follow through the cascade, or the delete after it where foreign keys are off.
        await tx.delete(schema.pages).where(eq(schema.pages.id, id));
        await tx
            .delete(schema.marcher_pages)
            .where(inArray(schema.marcher_pages.page_id, [id]));

        if (next) {
            await tx
                .update(schema.pages)
                .set({ start_beat: grid.beatIds[page.start]! })
                .where(eq(schema.pages.id, next.id));
            // The last page's flag is its start plus `last_page_counts`: keep it where it was
            if (index + 1 === grid.pages.length - 1)
                await updateLastPageCounts({
                    tx,
                    lastPageCounts:
                        next.start + (await lastPageCountsIn(tx)) - page.start,
                });
        } else if (previous.id !== FIRST_PAGE_ID)
            // The page before keeps its flag (this page's start) as the show's last flag
            await updateLastPageCounts({
                tx,
                lastPageCounts: page.start - previous.start,
            });

        if (row) deleted.push(realDatabasePageToDatabasePage(row));
    }
    return deleted;
}

/** Deletes page flags (UI-9) as one undoable edit. See `deletePageFlagsInTransaction`. */
export async function deletePageFlags({
    db,
    pageIds,
}: {
    db: DbConnection;
    pageIds: ReadonlySet<number>;
}): Promise<DatabasePage[]> {
    if (![...pageIds].some((id) => id !== FIRST_PAGE_ID)) return [];
    return await transactionWithHistory(
        db,
        "deletePageFlags",
        async (tx) => await deletePageFlagsInTransaction({ tx, pageIds }),
    );
}
