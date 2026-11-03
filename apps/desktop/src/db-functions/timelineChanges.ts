import type { ChangeBatch, RowImage } from "@openmarch/core";
import { asc, count, sql } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import { assert } from "../utilities/assert";
import type { DbTransaction } from "./types";
import { hasHeldMarksTable } from "./timelineHeldArrival";
import {
    heldConflictInTransaction,
    type HeldConflict,
} from "./timelineHeldConflict";

/**
 * The timeline change-log listener contract (ADR 0001 §5, spec §6 and §10.2).
 *
 * The write wrapper (`transactionWithHistory`, and undo and redo in `executeHistoryAction`) checks
 * `timeline_commit_violations` and drains `timeline_change_log` inside each transaction, then hands
 * the drained batch to the listeners registered here once the transaction has committed. The
 * registry is renderer-local; it is not an IPC channel.
 */

/** What a listener receives. */
export type TimelineChangeEvent =
    | { kind: "batch"; batch: ChangeBatch }
    /** Discard derived state and cold-build from the tables */
    | { kind: "reset" };

export type TimelineChangeListener = (event: TimelineChangeEvent) => void;

type ChangeTable = ChangeBatch["changes"][number]["table"];

const CHANGE_TABLES: ReadonlySet<string> = new Set<ChangeTable>([
    "marchers",
    "shapes",
    "transitions",
    "assignments",
    "slot_destinations",
]);

const listeners = new Set<TimelineChangeListener>();

/**
 * Registers a listener for committed timeline changes.
 *
 * @returns a function that unsubscribes the listener
 */
export function subscribeTimelineChanges(
    listener: TimelineChangeListener,
): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** How many listeners are registered, for tests and debug checks. */
export function timelineChangeListenerCount(): number {
    return listeners.size;
}

/**
 * Delivers an event to every listener. A listener that throws is logged and skipped; the others
 * still run, and the commit that produced the event stands.
 */
export function emitTimelineChange(event: TimelineChangeEvent): void {
    for (const listener of Array.from(listeners)) {
        try {
            listener(event);
        } catch (error) {
            console.error("A timeline change listener failed", error);
        }
    }
}

/** Delivers a committed batch. A batch with no changes is not delivered. */
export function notifyTimelineBatch(batch: ChangeBatch | undefined): void {
    if (!batch || batch.changes.length === 0) return;
    emitTimelineChange({ kind: "batch", batch });
}

/** One row of the `timeline_commit_violations` view. */
export interface TimelineCommitViolation {
    code: string;
    /** The transition at fault; null for a Held mark's (`E-H1`, `E-H3`), whose detail says who */
    transitionId: number | null;
    detail: string;
}

/**
 * An edit left the timeline tables in a state that only a complete edit can be judged on (spec
 * §6, I-T6), so the whole edit is rolled back.
 */
export class TimelineCommitViolationError extends Error {
    readonly code: string;
    readonly violations: readonly TimelineCommitViolation[];
    /** For an E-H1, who has a move inside their Held hold, and where, for the message */
    readonly held: HeldConflict | undefined;

    constructor(
        violations: readonly TimelineCommitViolation[],
        held?: HeldConflict,
    ) {
        const [first] = violations;
        super(
            violations
                .map((v) =>
                    v.transitionId === null
                        ? `${v.code}: ${v.detail}`
                        : `${v.code}: transition ${v.transitionId}: ${v.detail}`,
                )
                .join("; "),
        );
        this.name = "TimelineCommitViolationError";
        this.code = first?.code ?? "E-T6";
        this.violations = violations;
        this.held = held;
    }
}

/** `tx.all` returns rows as objects or, through the proxy, as arrays in SELECT order. */
const rowValue = (row: unknown, index: number, key: string): unknown =>
    Array.isArray(row) ? row[index] : (row as Record<string, unknown>)[key];

/**
 * Throws `TimelineCommitViolationError` if `timeline_commit_violations`, or
 * `timeline_held_violations` once the file has Held marks (a page-era file being converted
 * doesn't yet), returns any row.
 */
export async function assertNoTimelineCommitViolationsInTransaction(
    tx: DbTransaction,
): Promise<void> {
    const rows = (await tx.all(
        sql`SELECT code, transition_id, detail FROM timeline_commit_violations`,
    )) as unknown[];
    if (await hasHeldMarksTable(tx))
        rows.push(
            ...((await tx.all(
                sql`SELECT code, transition_id, detail FROM timeline_held_violations`,
            )) as unknown[]),
        );
    if (rows.length === 0) return;
    const violations = rows.map((row): TimelineCommitViolation => {
        const transitionId = rowValue(row, 1, "transition_id");
        return {
            code: String(rowValue(row, 0, "code")),
            transitionId:
                transitionId === null || transitionId === undefined
                    ? null
                    : Number(transitionId),
            detail: String(rowValue(row, 2, "detail")),
        };
    });
    throw new TimelineCommitViolationError(
        violations,
        violations.some((v) => v.code === "E-H1")
            ? await heldConflictInTransaction(tx)
            : undefined,
    );
}

const parseImage = (image: string | null): RowImage | null =>
    image === null ? null : (JSON.parse(image) as RowImage);

/** Debug builds (dev and tests) check that a drain leaves the log empty (ADR 0001 §5). */
const isDebugBuild = () => process.env.NODE_ENV !== "production";

/**
 * Reads `timeline_change_log` in `seq` order and deletes its rows, inside the caller's
 * transaction. The log's triggers already write the spec's logical table names and JSON row
 * images, so the rows only need parsing.
 *
 * @returns the drained batch, in raw log order (the resolver coalesces it)
 */
export async function drainTimelineChangeLogInTransaction(
    tx: DbTransaction,
): Promise<ChangeBatch> {
    const log = schema.timeline_change_log;
    const rows = await tx.select().from(log).orderBy(asc(log.seq)).all();
    if (rows.length === 0) return { changes: [] };

    await tx.delete(log).run();
    if (isDebugBuild()) {
        const remaining = await tx.select({ count: count() }).from(log).get();
        assert(
            (remaining?.count ?? 0) === 0,
            `timeline_change_log still holds ${remaining?.count} rows after a drain`,
        );
    }

    return {
        changes: rows.map((row) => {
            assert(
                CHANGE_TABLES.has(row.tbl),
                `Unknown table in timeline_change_log: ${row.tbl}`,
            );
            return {
                table: row.tbl as ChangeTable,
                rowId: row.row_id,
                before: parseImage(row.before),
                after: parseImage(row.after),
            };
        }),
    };
}

/**
 * The part of the spec §6 write wrapper that runs inside the transaction, after the edit's
 * statements: the commit-time check, then the drain.
 */
export async function checkAndDrainTimelineChangesInTransaction(
    tx: DbTransaction,
): Promise<ChangeBatch> {
    await assertNoTimelineCommitViolationsInTransaction(tx);
    return drainTimelineChangeLogInTransaction(tx);
}
