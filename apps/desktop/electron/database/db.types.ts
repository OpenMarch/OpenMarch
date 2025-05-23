import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./migrations/schema";

export type DB = BetterSQLite3Database<typeof schema>;
