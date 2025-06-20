import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./migrations/schema";
import { Database } from "better-sqlite3";

export type DB = BetterSQLite3Database<typeof schema>;

export function getOrm(db: Database): DB {
    return drizzle({ client: db, schema, casing: "snake_case", logger: true });
}

export { schema };
