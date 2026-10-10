import { asc, eq } from "drizzle-orm";
import {
    createResolver,
    generatePageNames,
    type Resolver,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { readTimelineTables } from "@/timeline/timelineRows";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import {
    pageNumberOffsetInTransaction,
    readPageGrid,
    timelineModeInTransaction,
    withTimelinePageRipple,
    type GridPage,
    type PageGrid,
} from "./timelineRipple";
import {
    deletePageYankInTransaction,
    deletePagesInTransaction,
    ensureSecondBeatHasPage,
    FIRST_PAGE_ID,
    type DatabasePage,
} from "./page";

/**
 * Deletes that take a page's moves with them, as explicit commands (defined coordinates, owner
 * decision 3, 2026-10-08). In timeline mode the default **Delete page** is the flag delete
 * (`deletePageFlags`), which writes only page rows, so every later page keeps its look. These run
 * today's page-mode deletes through the timeline ripple instead: the deleted page's page moves go,
 * so marchers that only held on later pages fall back to where they were before. Each says which
 * of the pages left now look different, by comparing the resolved positions at every remaining
 * flag before and after.
 */

/** A page as named after the edit (`generatePageNames`), with its place in show order. */
export interface NamedPage {
    id: number;
    name: string;
    /** Its index in show order, page 0 included */
    order: number;
}

/**
 * A page left after the delete, named as it was before it (the numbers the user knew), and
 * whether that name changed.
 */
export interface PageAfterDelete extends NamedPage {
    /** Its name after the delete differs (a later page renumbered) */
    renamed: boolean;
}

/** A page left that the delete made longer (it took a deleted page's box). */
export interface GrownPage extends PageAfterDelete {
    /** Its length after the delete, in counts */
    counts: number;
}

export interface PageDeleteWithMovesResult {
    deleted: DatabasePage[];
    /** The deleted pages' names, as they were before the delete, in show order */
    deletedNames: string[];
    /** The pages left that are longer now, in show order */
    grownPages: GrownPage[];
    /**
     * The pages left whose flag shows any marcher somewhere else than it did, in show order.
     * Always empty outside timeline mode.
     */
    changedPages: PageAfterDelete[];
}

/** How far a position may move, in canvas pixels, and still count as unchanged */
const SAME_POSITION = 1e-6;

/** Every page's name, as `fromDatabasePages` gives it, by id. */
async function readPageNames(
    tx: DbTransaction,
): Promise<Map<number, NamedPage>> {
    const rows = await tx
        .select({ id: schema.pages.id, is_subset: schema.pages.is_subset })
        .from(schema.pages)
        .innerJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .orderBy(asc(schema.beats.position))
        .all();
    const names = generatePageNames(
        rows.map((r) => Boolean(r.is_subset)),
        await pageNumberOffsetInTransaction(tx),
    );
    return new Map(
        rows.map((r, order) => [
            r.id,
            { id: r.id, name: names[order]!, order },
        ]),
    );
}

/** The page grid and a resolver over the timeline rows, read together in `tx`. */
interface FlagLook {
    grid: PageGrid;
    resolver: Resolver;
}

async function readFlagLook(tx: DbTransaction): Promise<FlagLook> {
    const grid = await readPageGrid(tx);
    const { snapshot } = await readTimelineTables(tx);
    return { grid, resolver: createResolver(snapshot) };
}

/**
 * The ids of the pages in `after` whose flag shows a different position for any marcher than the
 * same flag did in `before`. `flagBefore` gives the beat a page's flag (its end beat) was at
 * before, or undefined for a flag that is new. Home (page 0) never changes.
 */
export function changedFlagPageIds(
    before: FlagLook,
    after: FlagLook,
    flagBefore: (page: GridPage) => number | undefined,
): number[] {
    const marcherIds = after.resolver.marcherIds();
    const known = new Set(before.resolver.marcherIds());
    const changed: number[] = [];
    for (const page of after.grid.pages) {
        if (page.id === FIRST_PAGE_ID) continue;
        const beat = flagBefore(page);
        const differs =
            beat === undefined ||
            marcherIds.some((id) => {
                if (!known.has(id)) return true;
                const [x0, y0] = before.resolver.positionAt(id, beat);
                const [x1, y1] = after.resolver.positionAt(id, page.end);
                return (
                    Math.abs(x0 - x1) > SAME_POSITION ||
                    Math.abs(y0 - y1) > SAME_POSITION
                );
            });
        if (differs) changed.push(page.id);
    }
    return changed;
}

/**
 * Runs `remove` (a delete inside `withTimelinePageRipple`) and reports what it changed: the pages
 * left that are longer now, from the page grid before and after, and in timeline mode the pages
 * whose flag looks different, sampling every remaining flag before and after; `flagBefore` maps a
 * page left after the delete to the beat its flag was at before. Pages are named as before.
 */
async function deleteAndCompare(
    tx: DbTransaction,
    remove: () => Promise<DatabasePage[]>,
    flagBefore: (before: PageGrid) => (page: GridPage) => number | undefined,
): Promise<PageDeleteWithMovesResult> {
    const timelineMode = await timelineModeInTransaction(tx);
    const namesBefore = await readPageNames(tx);
    const gridBefore = await readPageGrid(tx);
    const before = timelineMode ? await readFlagLook(tx) : null;
    const deleted = await withTimelinePageRipple(tx, remove);
    const deletedNames = deleted
        .map((p) => namesBefore.get(p.id))
        .filter((p) => p !== undefined)
        .sort((a, b) => a.order - b.order)
        .map((p) => p.name);

    const namesAfter = await readPageNames(tx);
    const asBefore = (id: number): PageAfterDelete | undefined => {
        const old = namesBefore.get(id);
        if (!old) return undefined;
        return { ...old, renamed: namesAfter.get(id)?.name !== old.name };
    };
    const countsBefore = new Map(
        gridBefore.pages.map((p) => [p.id, p.end - p.start]),
    );
    const gridAfter = await readPageGrid(tx);
    const grownPages = gridAfter.pages
        .filter(
            (p) =>
                p.id !== FIRST_PAGE_ID &&
                p.end - p.start > (countsBefore.get(p.id) ?? Infinity),
        )
        .flatMap((p) => {
            const page = asBefore(p.id);
            return page ? [{ ...page, counts: p.end - p.start }] : [];
        })
        .sort((a, b) => a.order - b.order);
    if (!before) return { deleted, deletedNames, grownPages, changedPages: [] };

    const after = await readFlagLook(tx);
    const changedPages = changedFlagPageIds(
        before,
        after,
        flagBefore(before.grid),
    )
        .map(asBefore)
        .filter((p) => p !== undefined)
        .sort((a, b) => a.order - b.order);
    return { deleted, deletedNames, grownPages, changedPages };
}

/**
 * Runs `change` (an edit that leaves every page flag where it is, such as **Delete move**) and
 * reports the pages whose own flag shows any marcher somewhere else after it, named as the app
 * shows them, in show order, from the timeline rows.
 */
export async function changedPagesAround<T>(
    tx: DbTransaction,
    change: () => Promise<T>,
): Promise<{ value: T; changedPages: NamedPage[] }> {
    const before = await readFlagLook(tx);
    const value = await change();
    const after = await readFlagLook(tx);
    const names = await readPageNames(tx);
    const changedPages = changedFlagPageIds(
        before,
        after,
        flagOfSamePage(before.grid),
    )
        .map((id) => names.get(id))
        .filter((p) => p !== undefined)
        .sort((a, b) => a.order - b.order);
    return { value, changedPages };
}

/**
 * **Delete page and its moves**: the page-mode delete (`deletePages`) as one undoable edit. Pages
 * that stay keep their beats; the page before a deleted page takes its box, and so ends at its flag.
 */
export async function deletePagesWithMoves({
    db,
    pageIds,
}: {
    db: DbConnection;
    pageIds: ReadonlySet<number>;
}): Promise<PageDeleteWithMovesResult> {
    const ids = new Set([...pageIds].filter((id) => id !== FIRST_PAGE_ID));
    if (ids.size === 0)
        return {
            deleted: [],
            deletedNames: [],
            grownPages: [],
            changedPages: [],
        };
    return await transactionWithHistory(
        db,
        "deletePages",
        async (tx) =>
            await deleteAndCompare(
                tx,
                async () => {
                    const deleted = await deletePagesInTransaction({
                        pageIds: ids,
                        tx,
                    });
                    await ensureSecondBeatHasPage({ tx });
                    return deleted;
                },
                flagOfSamePage,
            ),
    );
}

/**
 * Compares each page left with its own flag before the delete, so the page before a deleted one,
 * which now ends at the deleted page's flag, counts as changed only if it shows something else.
 */
function flagOfSamePage(
    before: PageGrid,
): (page: GridPage) => number | undefined {
    const endOf = new Map(before.pages.map((p) => [p.id, p.end]));
    return (page) => endOf.get(page.id);
}

/**
 * **Yank** with the same report: the page goes and every later page moves back by its length.
 */
export async function deletePageYankWithMoves({
    db,
    pageId,
}: {
    db: DbConnection;
    pageId: number;
}): Promise<PageDeleteWithMovesResult> {
    if (pageId === FIRST_PAGE_ID)
        return {
            deleted: [],
            deletedNames: [],
            grownPages: [],
            changedPages: [],
        };
    return await transactionWithHistory(
        db,
        "deletePageYank",
        async (tx) =>
            await deleteAndCompare(
                tx,
                async () => await deletePageYankInTransaction({ pageId, tx }),
                flagOfSamePage,
            ),
    );
}

/**
 * Runs of pages next to each other in show order, as "3–5", joined with commas: "2, 4–6".
 */
export function pageRunsLabel(pages: readonly NamedPage[]): string {
    const runs: NamedPage[][] = [];
    for (const page of pages) {
        const run = runs[runs.length - 1];
        const last = run?.[run.length - 1];
        if (run && last && page.order === last.order + 1) run.push(page);
        else runs.push([page]);
    }
    return runs
        .map((run) =>
            run.length === 1
                ? run[0]!.name
                : `${run[0]!.name}–${run[run.length - 1]!.name}`,
        )
        .join(", ");
}

/** "Page 3", or "old Page 3" when the delete renumbered it. */
const oldPageLabel = (page: PageAfterDelete) =>
    page.renamed ? `old Page ${page.name}` : `Page ${page.name}`;

/** "Pages 3–5" or "old Page 3", for pages that all were or all weren't renumbered. */
const pagesLabel = (pages: readonly PageAfterDelete[], renamed: boolean) =>
    `${renamed ? "old " : ""}${pages.length === 1 ? "Page" : "Pages"} ${pageRunsLabel(pages)}`;

/**
 * The toast after a delete with its moves, in set and count terms with the numbers the user knew
 * (defined-coordinates 08): "Deleted Page 2 · Page 1 is now 16 counts · old Pages 3–4 changed",
 * leaving out what doesn't apply, and "· No other page changed" when every page left looks the
 * same.
 */
export function pageDeleteWithMovesMessage({
    deletedNames,
    grownPages,
    changedPages,
}: Pick<
    PageDeleteWithMovesResult,
    "deletedNames" | "grownPages" | "changedPages"
>): string {
    const parts = [
        deletedNames.length === 1
            ? `Deleted Page ${deletedNames[0]}`
            : `Deleted Pages ${deletedNames.join(", ")}`,
        ...grownPages.map(
            (p) => `${oldPageLabel(p)} is now ${p.counts} counts`,
        ),
    ];
    const kept = changedPages.filter((p) => !p.renamed);
    const renamed = changedPages.filter((p) => p.renamed);
    const changed = [
        ...(kept.length > 0 ? [pagesLabel(kept, false)] : []),
        ...(renamed.length > 0 ? [pagesLabel(renamed, true)] : []),
    ];
    parts.push(
        changed.length > 0
            ? `${changed.join(" and ")} changed`
            : "No other page changed",
    );
    return parts.join(" · ");
}
