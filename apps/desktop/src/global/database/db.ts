import { drizzle, SQLiteProxyTransaction } from "drizzle-orm/sqlite-proxy";
import * as schema from "../../../electron/database/migrations/schema";
import { ExtractTablesWithRelations } from "drizzle-orm/relations";
import { createRendererSqlProxyQueue } from "./sqlProxyQueue";

const queuedSqlProxy = createRendererSqlProxyQueue(
    async (sql, params, method) =>
        window.electron.sqlProxy(sql, params, method),
);

// Create the Drizzle database instance using the SQLite proxy
export const db = drizzle(
    async (sql, params, method) => {
        try {
            const result = await queuedSqlProxy(sql, params, method);
            return result;
        } catch (error: any) {
            // Don't log errors when database path is empty - this is expected on launch page
            if (!error?.message?.includes("Database path is empty")) {
                console.error("Error from SQLite proxy:", error);
            }
            throw error;
        }
    },
    { schema, casing: "snake_case" },
);

export type DB = typeof db;
export type DBTransaction = SQLiteProxyTransaction<
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
>;
export { schema };
