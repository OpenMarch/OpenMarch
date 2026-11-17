import { drizzle, SQLiteProxyTransaction } from "drizzle-orm/sqlite-proxy";
import * as schema from "../../../electron/database/migrations/schema";
import { ExtractTablesWithRelations } from "drizzle-orm/relations";
import { createRendererSqlCallbacks } from "./rendererSql";

// The 3D View window has no `window.electron`; it reads through its read-only
// preload's snapshot batch (#243), so the editor's query options work there unchanged.
const { proxy: queuedSqlProxy, batch: sqlReadBatch } =
    createRendererSqlCallbacks(() =>
        window.electron
            ? {
                  kind: "editor",
                  sqlProxy: window.electron.sqlProxy,
                  sqlReadBatch: window.electron.sqlReadBatch,
              }
            : {
                  kind: "view3d",
                  sqlReadBatch: window.view3d.sqlReadBatch,
              },
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
    sqlReadBatch,
    { schema, casing: "snake_case" },
);

export type DB = typeof db;
export type DBTransaction = SQLiteProxyTransaction<
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
>;
export { schema };
