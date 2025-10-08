import { handleSqlProxyWithDb } from "@/../electron/database/database.services";
import type { Database as SQLJsDatabase } from "sql.js";

export const handleSqlProxyWithDbBetterSqlite = handleSqlProxyWithDb;

export async function handleSqlProxyWithDbSqlJs(
    db: SQLJsDatabase,
    sql: string,
    params: any[],
    method: "all" | "run" | "get" | "values",
): Promise<{ rows: any[] }> {
    try {
        // prevent multiple queries
        const sqlBody = sql.replace(/;/g, "");

        // Prepare the statement for proper parameter binding
        const stmt = db.prepare(sqlBody);

        switch (method) {
            case "all": {
                // Bind parameters and collect all rows
                stmt.bind(params);
                const allRows: any[][] = [];
                while (stmt.step()) {
                    const row = stmt.get();
                    allRows.push(row);
                }
                stmt.free();

                return {
                    rows: allRows,
                };
            }
            case "get": {
                // Bind parameters and get single row
                stmt.bind(params);
                let singleRow: any[] | undefined;
                if (stmt.step()) {
                    singleRow = stmt.get();
                }
                stmt.free();

                return {
                    rows: singleRow || [],
                };
            }
            case "run": {
                // Bind parameters and execute
                stmt.bind(params);
                stmt.step();
                stmt.free();

                return {
                    rows: [], // no data returned for run
                };
            }
            case "values": {
                // Bind parameters and collect all rows (same as all for SQL.js)
                stmt.bind(params);
                const allRows: any[][] = [];
                while (stmt.step()) {
                    const row = stmt.get();
                    allRows.push(row);
                }
                stmt.free();

                return {
                    rows: allRows,
                };
            }
            default:
                throw new Error(`Unknown method: ${method}`);
        }
    } catch (error: any) {
        console.error("Error from SQL proxy:", error);
        throw error;
    }
}
