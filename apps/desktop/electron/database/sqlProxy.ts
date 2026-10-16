/* eslint-disable no-console */
/**
 * Runs Drizzle's proxy queries on a `node:sqlite` connection. Apart from
 * `database.services.ts` (which imports Electron) so the convert-on-open
 * worker (P9.8) can build an ORM on its own connection; `database.services.ts`
 * re-exports it.
 */
import type { DatabaseSync } from "node:sqlite";

/**
 * Core SQL proxy logic with dependency injection for Drizzle ORM
 *
 * Per Drizzle documentation:
 * - When method is "get", return {rows: string[]}
 * - Otherwise, return {rows: string[][]}
 *
 * https://orm.drizzle.team/docs/connect-drizzle-proxy
 */
export type SqlProxyMethod = "all" | "run" | "get" | "values";

/** One statement of a batch, as Drizzle's `sqlite-proxy` batch callback passes it. */
export interface SqlBatchQuery {
    sql: string;
    params: any[];
    method: SqlProxyMethod;
}

/**
 * A batch of reads: `busy` when the connection was inside a transaction, so nothing ran and the
 * caller tries again.
 */
export type SqlReadBatchResult =
    | { busy: true }
    | { busy: false; results: { rows: any }[] };

export async function handleSqlProxyWithDb(
    db: DatabaseSync,
    sql: string,
    params: any[],
    method: SqlProxyMethod,
) {
    return runSqlProxyStatement(db, sql, params, method);
}

/**
 * Runs reads as one consistent snapshot (#224): every statement runs synchronously in this call,
 * with `PRAGMA query_only` on, so no other IPC call can commit a write between two of them. When
 * the connection is inside a transaction (the editor's writes run one statement per IPC call, on
 * this same connection), the reads would see its uncommitted rows, so nothing runs and the result
 * is `busy`: try again once the transaction has ended.
 */
export function handleSqlReadBatchWithDb(
    db: DatabaseSync,
    queries: readonly SqlBatchQuery[],
): SqlReadBatchResult {
    if (db.isTransaction) return { busy: true };
    db.exec("PRAGMA query_only = ON");
    try {
        return {
            busy: false,
            results: queries.map((query) =>
                runSqlProxyStatement(db, query.sql, query.params, query.method),
            ),
        };
    } finally {
        db.exec("PRAGMA query_only = OFF");
    }
}

/** {@link handleSqlProxyWithDb}, synchronously. */
function runSqlProxyStatement(
    db: DatabaseSync,
    sql: string,
    params: any[],
    method: SqlProxyMethod,
) {
    try {
        // node:sqlite rejects `undefined` bind values while previous drivers
        // tolerated them. Coerce to null for compatibility.
        const normalizedParams = params.map((param) =>
            param === undefined ? null : param,
        );

        // prevent multiple queries
        // const sqlBody = sql.replace(/;/g, "");

        const statement = db.prepare(sql);

        let rows: any;

        switch (method) {
            case "all": {
                // Drizzle's mapResultRow expects all results to be arrays
                statement.setReturnArrays(true);
                const rawValues = statement.all(
                    ...normalizedParams,
                ) as unknown as any[][];
                // Return the raw arrays directly - Drizzle's mapResultRow expects arrays
                rows = rawValues;

                const resultObj = {
                    rows: rows || [],
                };
                return resultObj;
            }
            case "get": {
                // Drizzle's mapResultRow expects all results to be arrays
                statement.setReturnArrays(true);
                const rawValues = statement.get(...normalizedParams) as
                    | any[]
                    | undefined;
                // Return the raw array directly - Drizzle's mapResultRow expects an array
                rows = rawValues;

                const resultObj2 = {
                    rows: rows || undefined,
                };
                return resultObj2;
            }
            case "run":
                rows = statement.run(...normalizedParams);

                return {
                    rows: [], // no data returned for run
                };
            case "values": {
                // values() returns raw array values, similar to all() but used by migrator
                statement.setReturnArrays(true);
                const rawValues = statement.all(
                    ...normalizedParams,
                ) as unknown as any[][];
                rows = rawValues;

                return {
                    rows: rows || [],
                };
            }
            default:
                throw new Error(`Unknown method: ${method}`);
        }
    } catch (error: any) {
        const describeParam = (value: unknown): string => {
            if (value === null) return "null";
            if (value === undefined) return "undefined";
            if (value instanceof Uint8Array) return "Uint8Array";
            if (value instanceof Date) return "Date";
            if (Array.isArray(value)) return "Array";
            return typeof value;
        };

        console.error("Error from SQL proxy:", error);
        console.error("SQL proxy context:", {
            method,
            sql,
            params: params.map((param) => (param === undefined ? null : param)),
            paramTypes: params.map(describeParam),
        });
        throw error;
    }
}
