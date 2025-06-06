import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import * as OpenMarchSchema from "./schema/schema";
import { Database } from "better-sqlite3";

export type DB = BetterSQLite3Database<typeof OpenMarchSchema>;

export function getOrm(db: Database): DB {
    return drizzle({
        client: db,
        schema: OpenMarchSchema,
        casing: "snake_case",
        logger: true,
    });
}

export const getSchema = () => OpenMarchSchema;
