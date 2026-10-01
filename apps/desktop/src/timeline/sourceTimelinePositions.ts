import { createResolver } from "@openmarch/core";
import { asc, sql } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import type { DbConnection } from "@/db-functions/types";
import {
    isTimelineModeEnabled,
    workspaceSettingsSchema,
} from "@/settings/workspaceSettings";
import { readTimelineTables } from "./timelineRows";

/**
 * Where marchers end up in another `.dots` file, read from its timeline (docs/timeline/phases/
 * 07-page-parity.md P7.16). The new-show wizard's "import from a previous show" starts the new
 * show from the source's last page. In a timeline-mode source the `marcher_pages` rows are frozen
 * page-era data, so the positions come from the source's resolver at the last page's end beat
 * (each marcher's home when it has no assignment there) instead.
 *
 * This runs in the main process on a read-only connection to the source file, which is never
 * migrated, so it checks that the timeline tables exist before reading them.
 */

/** The tables `readTimelineTables` reads, added together by migration 0017 with marcher homes. */
const TIMELINE_TABLES = [
    "timeline_shapes",
    "timeline_transitions",
    "timeline_assignments",
    "timeline_slot_destinations",
] as const;

/** Mirrors the default of `utility.last_page_counts`. */
const DEFAULT_LAST_PAGE_COUNTS = 8;

/** Mirrors `FIRST_PAGE_ID` in `src/db-functions/page.ts`: the first page, which holds only beat 0. */
const FIRST_PAGE_ID = 0;

/** The source file is in timeline mode, but its timeline couldn't be read or resolved. */
export class SourceTimelineReadError extends Error {
    constructor(cause: unknown) {
        super("Couldn't read the timeline of this file", { cause });
        this.name = "SourceTimelineReadError";
    }
}

/** One marcher's position in the source file, in canvas pixels (the `marcher_pages` x/y units). */
export interface SourceMarcherPosition {
    marcher_id: number;
    x: number;
    y: number;
}

/**
 * Whether the source file is in timeline mode: its `workspace_settings` parse and turn the flag
 * on. A missing row or settings that fail to parse mean page mode, as in `readTimelineFlag`.
 */
export function isSourceInTimelineMode(
    workspaceSettingsJson: string | null | undefined,
): boolean {
    if (!workspaceSettingsJson) return false;
    try {
        const parsed = workspaceSettingsSchema.safeParse(
            JSON.parse(workspaceSettingsJson),
        );
        return parsed.success && isTimelineModeEnabled(parsed.data);
    } catch {
        return false;
    }
}

/** Whether the file has every table the resolver's cold build reads. */
export async function hasTimelineTables(db: DbConnection): Promise<boolean> {
    const rows = await db.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${sql.join(
            TIMELINE_TABLES.map((name) => sql`${name}`),
            sql`, `,
        )})`,
    );
    return rows.length === TIMELINE_TABLES.length;
}

/**
 * The last page's end beat in resolver beats, computed the way `fromDatabasePages` and
 * `pageEndBeat` do (without loading those renderer classes into the main process). The last page
 * spans `lastPageCounts` beats from its start beat, clipped to the end of the show, and always
 * covers at least its start beat. When the first page is also the last, it holds only its start
 * beat.
 *
 * @param startBeatIndex the last page's start beat, as an index into the beats sorted by position
 * @param beatCount how many beats the show has
 * @param isFirstPage whether the last page is the first page (`FIRST_PAGE_ID`)
 */
export function lastPageEndBeat({
    startBeatIndex,
    beatCount,
    lastPageCounts,
    isFirstPage,
}: {
    startBeatIndex: number;
    beatCount: number;
    lastPageCounts: number;
    isFirstPage: boolean;
}): number {
    if (isFirstPage) return startBeatIndex + 1;
    const end = Math.min(startBeatIndex + lastPageCounts, beatCount);
    return startBeatIndex < end ? end : startBeatIndex + 1;
}

/**
 * Every marcher's position at the source's last page end beat, sampled from a resolver
 * cold-built from the source's timeline tables, in marcher id order. `null` when the source is in
 * page mode or has no timeline tables: the caller then reads the last page's `marcher_pages` rows
 * as before. Also `null` when the source has no pages.
 */
export async function readSourceTimelinePositions({
    db,
    workspaceSettingsJson,
}: {
    db: DbConnection;
    workspaceSettingsJson: string | null | undefined;
}): Promise<SourceMarcherPosition[] | null> {
    if (!isSourceInTimelineMode(workspaceSettingsJson)) return null;
    if (!(await hasTimelineTables(db))) return null;

    const beats = await db
        .select({ id: schema.beats.id })
        .from(schema.beats)
        .orderBy(asc(schema.beats.position))
        .all();
    const beatIndex = new Map(beats.map((beat, i) => [beat.id, i]));
    const pages = (
        await db
            .select({
                id: schema.pages.id,
                start_beat: schema.pages.start_beat,
            })
            .from(schema.pages)
            .all()
    ).filter((page) => beatIndex.has(page.start_beat));
    if (pages.length === 0) return null;
    let last = pages[0]!;
    for (const page of pages)
        if (beatIndex.get(page.start_beat)! > beatIndex.get(last.start_beat)!)
            last = page;
    const utility = await db
        .select({ last_page_counts: schema.utility.last_page_counts })
        .from(schema.utility)
        .get();
    const endBeat = lastPageEndBeat({
        startBeatIndex: beatIndex.get(last.start_beat)!,
        isFirstPage: last.id === FIRST_PAGE_ID,
        beatCount: beats.length,
        lastPageCounts: utility?.last_page_counts ?? DEFAULT_LAST_PAGE_COUNTS,
    });

    try {
        const { snapshot } = await readTimelineTables(db);
        const resolver = createResolver(snapshot);
        const marcherIds = resolver.marcherIds();
        const buffer = new Float64Array(2 * marcherIds.length);
        resolver.positionsAt(endBeat, buffer);
        return marcherIds.map((marcher_id, i) => ({
            marcher_id,
            x: buffer[2 * i]!,
            y: buffer[2 * i + 1]!,
        }));
    } catch (error) {
        // Never fall back to the frozen page-era rows: they are stale in a timeline-mode file
        throw new SourceTimelineReadError(error);
    }
}
