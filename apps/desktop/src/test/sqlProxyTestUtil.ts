import { handleSqlProxyWithDb } from "@/../electron/database/database.services";
import type { Database as SQLJsDatabase } from "sql.js";

export const handleSqlProxyWithDbBetterSqlite = handleSqlProxyWithDb;

export async function handleSqlProxyWithDbSqlJs(
    db: SQLJsDatabase,
    sql: string,
    params: any[],
    method: "all" | "run" | "get" | "values",
) {
    try {
        // SQL.js uses exec() method for running queries
        let rows: any;
        let result: any;

        switch (method) {
            case "all":
                result = db.exec(sql, params);
                if (result.length > 0 && result[0]) {
                    rows = result[0].values || [];
                    return {
                        rows: rows,
                    };
                }
                return { rows: [] };
            case "get":
                result = db.exec(sql, params);
                if (
                    result.length > 0 &&
                    result[0] &&
                    result[0].values &&
                    result[0].values.length > 0
                ) {
                    rows = result[0].values[0];
                    return {
                        rows: rows,
                    };
                }
                return { rows: undefined };
            case "run":
                result = db.exec(sql, params);
                return {
                    rows: [], // no data returned for run
                };
            case "values":
                result = db.exec(sql, params);
                if (result.length > 0 && result[0]) {
                    rows = result[0].values || [];
                    return {
                        rows: rows,
                    };
                }
                return { rows: [] };
            default:
                throw new Error(`Unknown method: ${method}`);
        }
    } catch (error: any) {
        console.error("Error from SQL proxy:", error);
        throw error;
    }
}
