import { drizzle, SQLiteProxyTransaction } from "drizzle-orm/sqlite-proxy";
import * as schema from "../../../electron/database/migrations/schema";
import { ExtractTablesWithRelations } from "drizzle-orm/relations";
import {
    createRendererSqlProxyQueue,
    createSerialQueue,
} from "./sqlProxyQueue";
import { createSqlReadBatch } from "./sqlReadBatch";

// One queue for statements and batches, so each runs after the calls made before it
const serially = createSerialQueue();

// The 3D View window has no `window.electron`; it reads through its
// read-only proxy, so the editor's query options work there unchanged.
const queuedSqlProxy = createRendererSqlProxyQueue(
    async (sql, params, method) =>
        window.electron
            ? window.electron.sqlProxy(sql, params, method)
            : window.view3d.sqlRead(sql, params, method),
    serially,
);

// `db.batch` reads several tables as one snapshot (`readTimelineTablesSnapshot`)
const sqlReadBatch = createSqlReadBatch(
    (queries) =>
        window.electron
            ? window.electron.sqlReadBatch(queries)
            : window.view3d.sqlReadBatch(queries),
    serially,
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
