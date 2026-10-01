import type { ChangeBatch, RowImage } from "@openmarch/core";
import { asc, count, sql } from "drizzle-orm";
import { schema } from "../global/database/db";
import { assert } from "../utilities/utils";
import type { DbTransaction } from "./types";

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
    transitionId: number;
    detail: string;
}

/**
 * An edit left the timeline tables in a state that only a complete edit can be judged on (spec
 * §6, I-T6), so the whole edit is rolled back.
 */
export class TimelineCommitViolationError extends Error {
    readonly code: string;
    readonly violations: readonly TimelineCommitViolation[];

    constructor(violations: readonly TimelineCommitViolation[]) {
        const [first] = violations;
        super(
            violations
                .map(
                    (v) =>
                        `${v.code}: transition ${v.transitionId}: ${v.detail}`,
                )
                .join("; "),
        );
        this.name = "TimelineCommitViolationError";
        this.code = first?.code ?? "E-T6";
        this.violations = violations;
    }
}

/** `tx.all` returns rows as objects or, through the proxy, as arrays in SELECT order. */
const rowValue = (row: unknown, index: number, key: string): unknown =>
    Array.isArray(row) ? row[index] : (row as Record<string, unknown>)[key];

/** Throws `TimelineCommitViolationError` if `timeline_commit_violations` returns any row. */
export async function assertNoTimelineCommitViolationsInTransaction(
    tx: DbTransaction,
): Promise<void> {
    const rows = (await tx.all(
        sql`SELECT code, transition_id, detail FROM timeline_commit_violations`,
    )) as unknown[];
    if (rows.length === 0) return;
    throw new TimelineCommitViolationError(
        rows.map((row) => ({
            code: String(rowValue(row, 0, "code")),
            transitionId: Number(rowValue(row, 1, "transition_id")),
            detail: String(rowValue(row, 2, "detail")),
        })),
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
