import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "./migrations/schema";
import type { Database } from "libsql";
import { handleSqlProxyWithDb } from "./database.services";

export type DB = SqliteRemoteDatabase<typeof schema>;

export const getOrm = (db: Database): DB =>
    drizzle(
        async (sql, params, method) => {
            try {
                const result = await handleSqlProxyWithDb(
                    db,
                    sql,
                    params,
                    method,
                );
                return result;
            } catch (error: any) {
                console.error("Error from SQLite proxy:", error);
                throw error;
            }
        },
        { schema, casing: "snake_case" },
    );

export { schema };
