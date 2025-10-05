import Database from "better-sqlite3";
import type { Database as SQLJsDatabase } from "sql.js";

export async function handleSqlProxyWithDbBetterSqlite(
    db: Database.Database,
    sql: string,
    params: any[],
    method: "all" | "run" | "get" | "values",
) {
    try {
        // prevent multiple queries
        const sqlBody = sql.replace(/;/g, "");

        const result = db.prepare(sqlBody);

        let rows: any;

        switch (method) {
            case "all":
                rows = result.all(...params);
                return {
                    rows: rows
                        ? rows.map((row: { [key: string]: any }) =>
                              Object.values(row),
                          )
                        : [],
                };
            case "get":
                rows = result.get(...params);
                return {
                    rows: rows
                        ? Object.values(rows as Record<string, any>)
                        : undefined,
                };
            case "run":
                rows = result.run(...params);

                return {
                    rows: [], // no data returned for run
                };
            default:
                throw new Error(`Unknown method: ${method}`);
        }
    } catch (error: any) {
        console.error("Error from SQL proxy:", error);
        throw error;
    }
}

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
