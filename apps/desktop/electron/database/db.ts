import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./migrations/schema";
import Database from "libsql";

export type DB = BetterSQLite3Database<typeof schema>;

export function getOrm(db: Database.Database): DB {
    // libsql is API compatible with better-sqlite3
    // Do this any cast as better-sqlite3 is uninstalled
    return drizzle({
        client: db as any,
        schema,
        casing: "snake_case",
        logger: true,
    });
}

export { schema };
