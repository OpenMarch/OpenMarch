import { eq, inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { refuse, TimelineWriteError } from "./timelineErrors";
import {
    planTimelineRipple,
    readPageGrid,
    readRippleRows,
    timelineModeInTransaction,
    withTimelinePageRipple,
    type GridPage,
    type PageGrid,
    type RippleRows,
} from "./timelineRipple";
import {
    createPagesInTransaction,
    FIRST_PAGE_ID,
    realDatabasePageToDatabasePage,
    updateLastPageCounts,
    type DatabasePage,
} from "./page";
import { moveTagAppearancesOffPagesInTransaction } from "./tagAppearancePageDelete";

/**
 * Page flags in timeline mode (docs/timeline/ui.md UI-9 **+** and Deleting a flag; P8.13).
 *
 * A page is a cosmetic flag: it owns no motion (C-12). Page N is named by its **end** flag, where
 * marchers arrive, and its box is the range from the previous flag to its own. Pages still store
 * their **start** beat, so in rows a flag at beat `b` is the start beat of the page after it (or,
 * for the last page, its start plus `utility.last_page_counts`).
 *
 * **+** and Delete flag write only page rows, and `last_page_counts` when the last page changes.
 * They never run `withTimelinePageRipple` (P7.4): no timeline, transition or assignment is created,
 * moved or deleted, so motion is unchanged. Timelines track flags only when a flag moves, so
 * moving one does run it (`movePageFlagInTransaction`). Each is one undoable edit.
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
 * N's per-page data goes with its row, except its tag appearances, which move to the page after it
 * (`moveTagAppearancesOffPagesInTransaction`). No timeline row is written, so motion is unchanged.
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
        // Its tag appearances move to the next page first, which takes over its box
        await moveTagAppearancesOffPagesInTransaction({
            tx,
            pageIds: new Set([id]),
        });
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

// ---------------------------------------------------------------------------
// Moving a flag
// ---------------------------------------------------------------------------

/**
 * Why a page flag can't move any further (docs/timeline/research/move-page-flag, cases 1, 4, 6, 9
 * and 10):
 *
 * - `flag`: the neighboring flag (page `pageId`'s; home's is page 0). Every page keeps a count.
 * - `show-end`: the show's last beat, for the last flag.
 * - `move`: a timeline in the way. `timelineId` is set when one timeline is to blame: one with an
 *   edge on the flag that the flag would leave behind, or one whose range the page timeline would
 *   take (C-12). `message` is the ripple's own refusal otherwise.
 */
export type PageFlagMoveBlock =
    | { kind: "flag"; pageId: number }
    | { kind: "show-end" }
    | { kind: "move"; timelineId?: number; message: string };

/** Where page `pageId`'s flag can go: any beat in `[min, max]`, and what stops it at each end. */
export interface PageFlagMoveLimits {
    pageId: number;
    /** The flag's beat now */
    flag: number;
    min: number;
    max: number;
    minBlock: PageFlagMoveBlock;
    maxBlock: PageFlagMoveBlock;
    /**
     * Beats between `min` and `max` the flag can't land on, though it can pass them: say, the one
     * beat where the page's timeline would have a clip's range (C-12). In beat order.
     */
    holes: { beat: number; block: PageFlagMoveBlock }[];
}

/** The page grid with page `index`'s flag at `beat`: the page and the one after it change. */
const gridWithFlagAt = (
    grid: PageGrid,
    index: number,
    beat: number,
): PageGrid => ({
    beatIds: grid.beatIds,
    pages: grid.pages.map((p, i) =>
        i === index
            ? { ...p, end: beat }
            : i === index + 1
              ? { ...p, start: beat }
              : p,
    ),
});

/**
 * What stops the flag at `from` from moving to `to`, or null when nothing does. `after` is the grid
 * with it there. The ripple's own refusals (`planTimelineRipple`), plus two of its own:
 *
 * - every row edge on the flag must follow it. The ripple keeps an edge on its beat when following
 *   would empty the row, which would quietly leave a clip behind, off the flag (case 6);
 * - no two timelines may end up with one range (C-12, case 10).
 */
export function pageFlagMoveBlock(
    before: PageGrid,
    after: PageGrid,
    rows: RippleRows,
    from: number,
    to: number,
): PageFlagMoveBlock | null {
    let plan: ReturnType<typeof planTimelineRipple>;
    try {
        plan = planTimelineRipple(before, after, rows);
    } catch (error) {
        if (error instanceof TimelineWriteError)
            return { kind: "move", message: error.message };
        throw error;
    }
    const left = (
        row: { start_beat: number; end_beat: number },
        next: readonly [number, number] | undefined,
    ) =>
        next !== undefined &&
        ((row.start_beat === from && next[0] !== to) ||
            (row.end_beat === from && next[1] !== to));
    for (const l of rows.timelines)
        if (left(l, plan.newTimeline.get(l.id)))
            return {
                kind: "move",
                timelineId: l.id,
                message: "a move on the flag would be left behind",
            };
    for (const t of rows.transitions)
        if (left(t, plan.newTransition.get(t.id)))
            return {
                kind: "move",
                timelineId: t.timeline_id,
                message: "a move on the flag would be left behind",
            };
    const timelineOf = new Map(
        rows.transitions.map((t) => [t.id, t.timeline_id]),
    );
    for (const a of rows.assignments)
        if (left(a, plan.newAssignment.get(a.id)))
            return {
                kind: "move",
                timelineId: timelineOf.get(a.transition_id),
                message: "a move on the flag would be left behind",
            };
    // C-12: one timeline per range. Only a timeline that changed can newly share a range.
    for (const l of rows.timelines) {
        const r = plan.newTimeline.get(l.id);
        if (!r || (r[0] === l.start_beat && r[1] === l.end_beat)) continue;
        const other = [...plan.newTimeline].find(
            ([id, q]) => id !== l.id && q[0] === r[0] && q[1] === r[1],
        );
        if (other)
            return {
                kind: "move",
                timelineId: other[0],
                message: `two moves would share beats [${r[0]}, ${r[1]})`,
            };
    }
    return null;
}

/**
 * Where page `pageId`'s flag can go (`PageFlagMoveLimits`), from the grid and timeline rows read
 * once: the beats reachable from the flag, one at a time outward, before something stops it.
 * Null for home, a page that doesn't exist, and outside timeline mode's grid rules.
 */
export function planPageFlagMoveLimits(
    grid: PageGrid,
    rows: RippleRows,
    pageId: number,
): PageFlagMoveLimits | null {
    const index = grid.pages.findIndex((p) => p.id === pageId);
    if (index <= 0) return null;
    const page = grid.pages[index]!;
    const next = grid.pages[index + 1];
    const previous = grid.pages[index - 1]!;
    const from = page.end;
    const walk = (step: -1 | 1) => {
        const bound =
            step < 0
                ? page.start + 1
                : next
                  ? next.end - 1
                  : grid.beatIds.length;
        const edge: PageFlagMoveBlock =
            step < 0
                ? { kind: "flag", pageId: previous.id }
                : next
                  ? { kind: "flag", pageId: next.id }
                  : { kind: "show-end" };
        // Walk every beat to the neighbor: a refused beat with an allowed one past it is a hole
        // the flag passes over; the refused beats past the last allowed one stop it
        let reached = from;
        let stop: PageFlagMoveBlock | null = null;
        const refused: { beat: number; block: PageFlagMoveBlock }[] = [];
        const holes: { beat: number; block: PageFlagMoveBlock }[] = [];
        for (
            let beat = from + step;
            step < 0 ? beat >= bound : beat <= bound;
            beat += step
        ) {
            const block = pageFlagMoveBlock(
                grid,
                gridWithFlagAt(grid, index, beat),
                rows,
                from,
                beat,
            );
            if (block) {
                refused.push({ beat, block });
                stop ??= block;
                continue;
            }
            holes.push(...refused.splice(0));
            stop = null;
            reached = beat;
        }
        return { beat: reached, block: stop ?? edge, holes };
    };
    const down = walk(-1);
    const up = walk(1);
    return {
        pageId,
        flag: from,
        min: down.beat,
        max: up.beat,
        minBlock: down.block,
        maxBlock: up.block,
        holes: [...down.holes, ...up.holes].sort((a, b) => a.beat - b.beat),
    };
}

/** `planPageFlagMoveLimits` read from the database (`tx`). */
export async function pageFlagMoveLimitsInTransaction({
    tx,
    pageId,
}: {
    tx: DbTransaction;
    pageId: number;
}): Promise<PageFlagMoveLimits | null> {
    if (!(await timelineModeInTransaction(tx))) return null;
    return planPageFlagMoveLimits(
        await readPageGrid(tx),
        await readRippleRows(tx),
        pageId,
    );
}

/** Where page `pageId`'s flag can go now (`planPageFlagMoveLimits`), for a drag that starts. */
export async function pageFlagMoveLimits({
    db,
    pageId,
}: {
    db: DbConnection;
    pageId: number;
}): Promise<PageFlagMoveLimits | null> {
    return await db.transaction(
        async (tx) => await pageFlagMoveLimitsInTransaction({ tx, pageId }),
    );
}

/** A flag that moved: page `pageId`'s flag went from beat `from` to beat `to`. */
export interface MovedPageFlag {
    pageId: number;
    from: number;
    to: number;
}

/**
 * Moves page `pageId`'s flag to `beat` (a roll edit: docs/timeline/research/move-page-flag),
 * inside a `transactionWithHistory`. Page N gains what page N+1 loses; every other flag stays.
 * The page after it starts at `beat` instead (for the last page, `last_page_counts` changes), and
 * `last_page_counts` is rewritten when that page is the last, so the last flag stays where it was.
 *
 * Unlike **+** and Delete flag, this runs `withTimelinePageRipple`: timelines track a flag that
 * moves (ui.md U-Q5), so every row edge on the flag follows it and every other edge keeps its
 * beat. Refuses (`E-ARGS`) outside timeline mode, for home or a page that doesn't exist, and past
 * `planPageFlagMoveLimits` (a neighboring flag, the show's end, or a timeline in the way).
 */
export async function movePageFlagInTransaction({
    tx,
    pageId,
    beat,
}: {
    tx: DbTransaction;
    pageId: number;
    beat: number;
}): Promise<MovedPageFlag> {
    await refuseOutsideTimelineMode(tx, "Moving a page flag");
    if (pageId === FIRST_PAGE_ID) refuse("home's flag can't move");
    const grid = await readPageGrid(tx);
    const index = grid.pages.findIndex((p) => p.id === pageId);
    if (index < 0) refuse(`page ${pageId} doesn't exist`);
    const page = grid.pages[index]!;
    if (!Number.isInteger(beat))
        refuse(`page flags are on whole beats, not beat ${beat}`);
    const from = page.end;
    if (beat === from) return { pageId, from, to: beat };
    const limits = planPageFlagMoveLimits(
        grid,
        await readRippleRows(tx),
        pageId,
    )!;
    const hole = limits.holes.find((h) => h.beat === beat);
    if (beat < limits.min || beat > limits.max || hole) {
        const block =
            hole?.block ??
            (beat < limits.min ? limits.minBlock : limits.maxBlock);
        refuse(
            `page ${pageId}'s flag can't move to beat ${beat}: ${
                block.kind === "flag"
                    ? "it would pass the next flag"
                    : block.kind === "show-end"
                      ? "the show ends first"
                      : block.message
            }`,
        );
    }
    const next = grid.pages[index + 1];
    await withTimelinePageRipple(tx, async () => {
        if (next) {
            const nextIsLast = index + 1 === grid.pages.length - 1;
            const lastPageCounts = nextIsLast ? await lastPageCountsIn(tx) : 0;
            await tx
                .update(schema.pages)
                .set({ start_beat: grid.beatIds[beat]! })
                .where(eq(schema.pages.id, next.id));
            // The last flag is its page's start plus `last_page_counts`: keep it where it was
            if (nextIsLast)
                await updateLastPageCounts({
                    tx,
                    lastPageCounts: next.start + lastPageCounts - beat,
                });
        } else
            await updateLastPageCounts({
                tx,
                lastPageCounts: beat - page.start,
            });
    });
    return { pageId, from, to: beat };
}

/** Moves a page flag (`movePageFlagInTransaction`) as one undoable edit. */
export async function movePageFlag({
    db,
    pageId,
    beat,
}: {
    db: DbConnection;
    pageId: number;
    beat: number;
}): Promise<MovedPageFlag> {
    // A flag dropped where it was writes nothing, so it makes no history step
    const from = (
        await db.transaction(async (tx) => await readPageGrid(tx))
    ).pages.find((p) => p.id === pageId)?.end;
    if (from === beat && pageId !== FIRST_PAGE_ID)
        return { pageId, from, to: beat };
    return await transactionWithHistory(
        db,
        "movePageFlag",
        async (tx) => await movePageFlagInTransaction({ tx, pageId, beat }),
    );
}
