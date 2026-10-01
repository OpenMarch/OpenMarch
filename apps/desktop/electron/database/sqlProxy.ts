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
export async function handleSqlProxyWithDb(
    db: DatabaseSync,
    sql: string,
    params: any[],
    method: "all" | "run" | "get" | "values",
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
