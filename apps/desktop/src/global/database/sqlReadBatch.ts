import type { AsyncBatchRemoteCallback } from "drizzle-orm/sqlite-proxy";
import type {
    SqlBatchQuery,
    SqlReadBatchResult,
} from "@om-electron/database/sqlProxy";
import { createSerialQueue } from "./sqlProxyQueue";

/** How long to wait before asking again when a transaction was open. */
export const READ_BATCH_RETRY_MS = 10;
/** A batch that finds a transaction open for this long fails, as a stuck read would. */
export const READ_BATCH_TIMEOUT_MS = 30_000;

/**
 * Drizzle's batch callback for a renderer: `db.batch([...])` runs its reads as one consistent
 * snapshot in main (`sqlReadBatch`, #224). While the shared connection is inside a transaction
 * main runs nothing and answers `busy`; this waits and asks again, outside `serially`, so the
 * transaction's own statements (which may come from this renderer) keep going.
 *
 * @param serially the renderer's SQL queue, so a batch runs after the statements sent before it
 */
export function createSqlReadBatch(
    invoke: (queries: SqlBatchQuery[]) => Promise<SqlReadBatchResult>,
    serially: ReturnType<typeof createSerialQueue> = createSerialQueue(),
    {
        retryMs = READ_BATCH_RETRY_MS,
        timeoutMs = READ_BATCH_TIMEOUT_MS,
    }: { retryMs?: number; timeoutMs?: number } = {},
): AsyncBatchRemoteCallback {
    return async (queries) => {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const result = await serially(() => invoke(queries));
            if (!result.busy) return result.results;
            if (Date.now() >= deadline)
                throw new Error(
                    "The show was busy for too long to read a snapshot",
                );
            await new Promise((resolve) => setTimeout(resolve, retryMs));
        }
    };
}
