import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../../../electron/database/schema/schema";

// Create the Drizzle database instance using the SQLite proxy
export const db = drizzle(
    async (sql, params, method) => {
        try {
            const result = await window.electron.sqlProxy(sql, params, method);
            return result;
        } catch (error: any) {
            console.error("Error from SQLite proxy:", error);
            return { rows: [] };
        }
    },
    { schema, casing: "snake_case" },
);

export type DB = typeof db;
