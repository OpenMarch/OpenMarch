import { schema } from "@/global/database/db";
import { ExtractTablesWithRelations } from "drizzle-orm";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import { SqliteRemoteResult } from "drizzle-orm/sqlite-proxy";

export type DatabaseTransaction = SQLiteTransaction<
    "async",
    SqliteRemoteResult<unknown>,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
>;
