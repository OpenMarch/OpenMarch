import { asc } from "drizzle-orm";
import { generatePageNames } from "@openmarch/core";
import * as schema from "@om-electron/database/migrations/schema";
import { workspaceSettingsSchema } from "@/settings/workspaceSettings";
import type { DbTransaction } from "./types";

/**
 * The page grid as the timeline commands read it: every beat and page by ordinal. Apart from the
 * page ripple (`timelineRipple`, which re-exports it) so the commit check's refusal messages
 * (`timelineHeldConflict`) can name pages without loading the ripple's writers, which the main
 * process's open and convert path must not load.
 */

const DEFAULT_LAST_PAGE_COUNTS = 8;

/** A page's beats as ordinals: `[start, end)`, the same range `pageEndBeat` gives. */
export interface GridPage {
    id: number;
    start: number;
    end: number;
    /** The page's name ("2", "2A"), for refusals; absent where only the range matters */
    name?: string;
}

/** Where every beat and page sits, by ordinal. */
export interface PageGrid {
    /** Beat ids in position order: the ordinal of a beat is its index here */
    beatIds: number[];
    /** Pages in show order */
    pages: GridPage[];
}

/**
 * Reads the page grid. It mirrors `fromDatabasePages` (`src/global/classes/Page.ts`): pages in
 * start-beat order; page 0 is its one beat; a page runs to the next page's start, and the last
 * page runs `last_page_counts` beats (fewer if the show ends first); a page with no room keeps its
 * start beat.
 */
export async function readPageGrid(tx: DbTransaction): Promise<PageGrid> {
    const beats = await tx
        .select({ id: schema.beats.id })
        .from(schema.beats)
        .orderBy(asc(schema.beats.position), asc(schema.beats.id))
        .all();
    const beatIds = beats.map((b) => b.id);
    const ordinal = new Map(beatIds.map((id, i) => [id, i]));
    const pageRows = await tx
        .select({
            id: schema.pages.id,
            start_beat: schema.pages.start_beat,
            is_subset: schema.pages.is_subset,
        })
        .from(schema.pages)
        .all();
    const utility = await tx
        .select({ lastPageCounts: schema.utility.last_page_counts })
        .from(schema.utility)
        .get();
    const lastPageCounts = utility?.lastPageCounts ?? DEFAULT_LAST_PAGE_COUNTS;
    const placed = pageRows
        .filter((p) => ordinal.has(p.start_beat))
        .map((p) => ({
            id: p.id,
            start: ordinal.get(p.start_beat)!,
            isSubset: p.is_subset,
        }))
        .sort((a, b) => a.start - b.start);
    // Named as `fromDatabasePages` names them, in show order
    const names = generatePageNames(
        placed.map((p) => !!p.isSubset),
        await pageNumberOffsetInTransaction(tx),
    );
    const n = beatIds.length;
    const pages = placed.map((p, i): GridPage => {
        const next = placed[i + 1];
        const name = names[i]!;
        if (p.id === 0)
            return { id: p.id, start: p.start, end: p.start + 1, name };
        const last = next ? next.start : Math.min(p.start + lastPageCounts, n);
        return {
            id: p.id,
            start: p.start,
            end: last > p.start ? last : p.start + 1,
            name,
        };
    });
    return { beatIds, pages };
}

/** The file's first page number (`pageNumberOffset`), read inside `tx` from `workspace_settings`. */
export async function pageNumberOffsetInTransaction(
    tx: DbTransaction,
): Promise<number> {
    const row = await tx
        .select({ json: schema.workspace_settings.json_data })
        .from(schema.workspace_settings)
        .get();
    if (!row) return 0;
    try {
        const parsed = workspaceSettingsSchema.safeParse(JSON.parse(row.json));
        return parsed.success ? parsed.data.pageNumberOffset : 0;
    } catch {
        return 0;
    }
}
