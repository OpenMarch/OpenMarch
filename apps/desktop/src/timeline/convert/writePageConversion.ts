import { asc, count } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbConnection, DbTransaction } from "@/db-functions/types";
import { transactionWithHistory } from "@/db-functions/history";
import { realDatabasePageToDatabasePage } from "@/db-functions/page";
import { realDatabaseBeatToDatabaseBeat } from "@/db-functions/beat";
import { updateMarcherHomesInTransaction } from "@/db-functions/marcherHome";
import {
    createTimelinesInTransaction,
    deleteTimelinesInTransaction,
} from "@/db-functions/timelines";
import { deleteTimelineShapesInTransaction } from "@/db-functions/timelineShapes";
import { createTimelineTransitionsInTransaction } from "@/db-functions/timelineTransitions";
import { createTimelineAssignmentsInTransaction } from "@/db-functions/timelineAssignments";
import { refuse } from "@/db-functions/timelineErrors";
import type Page from "@/global/classes/Page";
import { fromDatabasePages } from "@/global/classes/Page";
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
 * the timeline db-functions as ONE undoable edit. The page-era tables are only read.
 */

/** `utility.last_page_counts` when the file has no utility row (the column's default). */
const DEFAULT_LAST_PAGE_COUNTS = 8;

export interface ConvertPagesOptions {
    /**
     * Delete every existing timeline and timeline shape first, in the same edit. Without it, a
     * file that already has timeline rows is refused (E-ARGS).
     */
    replace?: boolean;
}

export interface PageConversionResult {
    readonly report: PageConversionReport;
    readonly timelineId: number;
    /** The new transition of each converted page, by page id */
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

/** Writes `plan` inside `tx`. */
export async function writePageConversionPlanInTransaction(
    tx: DbTransaction,
    plan: PageConversionPlan,
): Promise<PageConversionResult> {
    await updateMarcherHomesInTransaction({
        tx,
        modifiedHomes: plan.homes,
    });
    const [timeline] = await createTimelinesInTransaction({
        tx,
        newTimelines: [plan.timeline],
    });
    const transitions = await createTimelineTransitionsInTransaction({
        tx,
        newTransitions: plan.transitions.map((t) => ({
            timelineId: timeline!.id,
            startBeat: t.startBeat,
            endBeat: t.endBeat,
            slotCount: t.marcherIds.length,
            destination: { kind: "individual", points: [...t.points] },
            pathStyle: "direct",
            pathParams: null,
        })),
    });
    const transitionIds = new Map<number, number>();
    plan.transitions.forEach((t, i) =>
        transitionIds.set(t.pageId, transitions[i]!.id),
    );
    const assignments = await createTimelineAssignmentsInTransaction({
        tx,
        newAssignments: plan.transitions.flatMap((t, i) =>
            t.marcherIds.map((marcherId, slotIndex) => ({
                marcherId,
                transitionId: transitions[i]!.id,
                slotIndex,
                startBeat: t.startBeat,
                endBeat: t.endBeat,
                layer: 0,
            })),
        ),
    });
    return {
        report: plan.report,
        timelineId: timeline!.id,
        transitionIds,
        assignmentCount: assignments.length,
        homeCount: plan.homes.length,
    };
}

/**
 * Converts the page show inside `tx`. Refuses (E-ARGS) a file that already has timeline rows,
 * unless `replace` is set.
 */
export async function convertPagesToTimelineInTransaction(
    tx: DbTransaction,
    { replace = false }: ConvertPagesOptions = {},
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
    return writePageConversionPlanInTransaction(tx, planPageConversion(input));
}

/** Converts the open file's page show as one undoable edit. */
export function convertPagesToTimeline(
    db: DbConnection,
    options: ConvertPagesOptions = {},
): Promise<PageConversionResult> {
    return transactionWithHistory(db, "convertPagesToTimeline", (tx) =>
        convertPagesToTimelineInTransaction(tx, options),
    );
}
