import { asc, count } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import type { DbConnection, DbTransaction } from "@/db-functions/types";
// Light modules, not `@/db-functions/page`, `beat` or `Page`, so the main process can load the
// converter (convert on open, P9.3).
import {
    realDatabaseBeatToDatabaseBeat,
    realDatabasePageToDatabasePage,
} from "@/db-functions/rowMappers";
import { updateMarcherHomesInTransaction } from "@/db-functions/marcherHome";
import {
    createTimelinesInTransaction,
    deleteTimelinesInTransaction,
} from "@/db-functions/timelines";
import { deleteTimelineShapesInTransaction } from "@/db-functions/timelineShapesInTransaction";
import { createTimelineTransitionsInTransaction } from "@/db-functions/timelineTransitionsInTransaction";
import { insertTimelineAssignmentsBulkInTransaction } from "@/db-functions/timelineAssignments";
import { refuse } from "@/db-functions/timelineErrors";
import type Page from "@/global/classes/Page";
import { fromDatabasePages } from "@/global/classes/Page.fromDatabase";
import type Beat from "@/global/classes/Beat";
import { calculateTimestamps, fromDatabaseBeat } from "@/global/classes/Beat";
import {
    planPageConversion,
    type PageConversionInput,
    type PageConversionPlan,
    type PageConversionReport,
} from "./planPageConversion";

/**
 * Converts the open file's page show into timeline rows (docs/timeline/phases/06-converter.md
 * P6.2, P6.4): reads the page model, plans with `planPageConversion`, and writes the plan through
 * the timeline db-functions inside the caller's transaction. The page-era tables are only read.
 *
 * This module doesn't load the history module or any renderer module, so the main process and
 * the convert-on-open worker (P9.8) can load it. `writePageConversion.ts` adds the undoable
 * `convertPagesToTimeline` on top and re-exports this module.
 */

/** `utility.last_page_counts` when the file has no utility row (the column's default). */
const DEFAULT_LAST_PAGE_COUNTS = 8;

export interface ConvertPagesOptions {
    /**
     * Delete every existing timeline and timeline shape first, in the same edit. Without it, a
     * file that already has timeline rows is refused (E-ARGS).
     */
    replace?: boolean;
    /** Called after each page's timeline, transition and assignments are written. */
    onProgress?: ConversionProgress;
}

/** Pages written so far, out of the pages that get a timeline. */
export type ConversionProgress = (
    pagesDone: number,
    pagesTotal: number,
) => void;

export interface PageConversionResult {
    readonly report: PageConversionReport;
    /** The new timeline of each converted page (its page move, C-11), by page id */
    readonly timelineIds: Map<number, number>;
    /** The new transition of each converted page, the one spanning its timeline, by page id */
    readonly transitionIds: Map<number, number>;
    readonly assignmentCount: number;
    readonly homeCount: number;
}

/** The show's beats (0-based `index`, cumulative `timestamp`) and pages, as the app builds them. */
export async function readShowTiming(
    tx: DbTransaction | DbConnection,
): Promise<{ beats: Beat[]; pages: Page[] }> {
    const beatRows = await tx
        .select()
        .from(schema.beats)
        .orderBy(asc(schema.beats.position))
        .all();
    const beats = calculateTimestamps(
        beatRows.map((b, i) =>
            fromDatabaseBeat(realDatabaseBeatToDatabaseBeat(b), i),
        ),
    );
    const pageRows = await tx.select().from(schema.pages).all();
    const utility = await tx.select().from(schema.utility).get();
    const pages = fromDatabasePages({
        databasePages: pageRows.map(realDatabasePageToDatabasePage),
        allMeasures: [],
        allBeats: [...beats],
        lastPageCounts: utility?.last_page_counts ?? DEFAULT_LAST_PAGE_COUNTS,
    });
    return { beats, pages };
}

/** Reads what the planner needs, inside `tx` so the read and the write see the same rows. */
export async function readPageConversionInput(
    tx: DbTransaction | DbConnection,
): Promise<PageConversionInput> {
    const { pages } = await readShowTiming(tx);
    const marchers = await tx
        .select({ id: schema.marchers.id })
        .from(schema.marchers)
        .all();
    const marcherPages = await tx
        .select({
            id: schema.marcher_pages.id,
            marcher_id: schema.marcher_pages.marcher_id,
            page_id: schema.marcher_pages.page_id,
            x: schema.marcher_pages.x,
            y: schema.marcher_pages.y,
            path_data_id: schema.marcher_pages.path_data_id,
            path_start_position: schema.marcher_pages.path_start_position,
            path_end_position: schema.marcher_pages.path_end_position,
            rotation_degrees: schema.marcher_pages.rotation_degrees,
            notes: schema.marcher_pages.notes,
            fill_color: schema.marcher_pages.fill_color,
            outline_color: schema.marcher_pages.outline_color,
            shape_type: schema.marcher_pages.shape_type,
            visible: schema.marcher_pages.visible,
            label_visible: schema.marcher_pages.label_visible,
            equipment_name: schema.marcher_pages.equipment_name,
            equipment_state: schema.marcher_pages.equipment_state,
        })
        .from(schema.marcher_pages)
        .all();
    const midsets = await tx
        .select({
            id: schema.midsets.id,
            mp_id: schema.midsets.mp_id,
            progress_placement: schema.midsets.progress_placement,
        })
        .from(schema.midsets)
        .all();
    const shapePages = await tx
        .select({
            id: schema.shape_pages.id,
            shape_id: schema.shape_pages.shape_id,
            page_id: schema.shape_pages.page_id,
            svg_path: schema.shape_pages.svg_path,
        })
        .from(schema.shape_pages)
        .all();
    const pathways = await tx
        .select({
            id: schema.pathways.id,
            path_data: schema.pathways.path_data,
        })
        .from(schema.pathways)
        .all();
    return {
        pages: pages.map((p) => ({
            id: p.id,
            name: p.name,
            order: p.order,
            beats: p.beats,
        })),
        marcherIds: marchers.map((m) => m.id),
        marcherPages,
        midsets,
        shapePages,
        pathways,
    };
}

/** True when the file has any timeline or timeline shape (transitions live under timelines). */
export async function hasTimelineRows(
    tx: DbTransaction | DbConnection,
): Promise<boolean> {
    const timelines = await tx
        .select({ n: count() })
        .from(schema.timelines)
        .get();
    const shapes = await tx
        .select({ n: count() })
        .from(schema.timeline_shapes)
        .get();
    return (timelines?.n ?? 0) + (shapes?.n ?? 0) > 0;
}

/** Deletes every timeline (with its transitions, assignments and destinations) and shape. */
async function deleteAllTimelineRows(tx: DbTransaction): Promise<void> {
    const timelines = await tx
        .select({ id: schema.timelines.id })
        .from(schema.timelines)
        .all();
    await deleteTimelinesInTransaction({
        tx,
        timelineIds: new Set(timelines.map((t) => t.id)),
    });
    const shapes = await tx
        .select({ id: schema.timeline_shapes.id })
        .from(schema.timeline_shapes)
        .all();
    await deleteTimelineShapesInTransaction({
        tx,
        shapeIds: new Set(shapes.map((s) => s.id)),
    });
}

/**
 * Writes `plan` inside `tx`: the homes, then, page by page, the page's timeline over exactly its
 * range and the one transition spanning it (C-11), through the checked write functions.
 */
export async function writePageConversionPlanInTransaction(
    tx: DbTransaction,
    plan: PageConversionPlan,
    onProgress?: ConversionProgress,
): Promise<PageConversionResult> {
    await updateMarcherHomesInTransaction({
        tx,
        modifiedHomes: plan.homes,
    });
    // One page at a time (its timeline, transition, destinations and assignments), so progress
    // can be reported. Ids come out in plan order. The assignments go in as chunked multi-row
    // inserts (P9.8); the row triggers still run for every row, and each sees the rows inserted
    // before it.
    const timelineIds = new Map<number, number>();
    const transitionIds = new Map<number, number>();
    let assignmentCount = 0;
    const total = plan.transitions.length;
    for (const [i, t] of plan.transitions.entries()) {
        const [timeline] = await createTimelinesInTransaction({
            tx,
            newTimelines: [{ startBeat: t.startBeat, endBeat: t.endBeat }],
        });
        const [transition] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: timeline!.id,
                    slotCount: t.marcherIds.length,
                    destination: { kind: "individual", points: [...t.points] },
                    pathStyle: "direct",
                    pathParams: null,
                },
            ],
        });
        timelineIds.set(t.pageId, timeline!.id);
        transitionIds.set(t.pageId, transition!.id);
        assignmentCount += await insertTimelineAssignmentsBulkInTransaction({
            tx,
            newAssignments: t.marcherIds.map((marcherId, slotIndex) => ({
                marcherId,
                transitionId: transition!.id,
                slotIndex,
                startBeat: t.startBeat,
                endBeat: t.endBeat,
                layer: 0,
            })),
        });
        onProgress?.(i + 1, total);
    }
    return {
        report: plan.report,
        timelineIds,
        transitionIds,
        assignmentCount,
        homeCount: plan.homes.length,
    };
}

/**
 * Converts the page show inside `tx`. Refuses (E-ARGS) a file that already has timeline rows,
 * unless `replace` is set.
 */
export async function convertPagesToTimelineInTransaction(
    tx: DbTransaction,
    { replace = false, onProgress }: ConvertPagesOptions = {},
): Promise<PageConversionResult> {
    if (await hasTimelineRows(tx)) {
        if (!replace)
            refuse(
                "the file already has timeline rows; pass { replace: true } to delete them and convert again",
            );
        await deleteAllTimelineRows(tx);
    }
    const input = await readPageConversionInput(tx);
    if (input.pages.length === 0) refuse("the show has no pages to convert");
    return writePageConversionPlanInTransaction(
        tx,
        planPageConversion(input),
        onProgress,
    );
}
