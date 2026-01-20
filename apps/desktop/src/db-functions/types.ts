import { schema } from "@/global/database/db";
import { DbConnection } from "@/test/base";
import { RunResult } from "libsql";
import { SqliteRemoteResult } from "drizzle-orm/sqlite-proxy";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import { ExtractTablesWithRelations } from "drizzle-orm/relations";

export type DbTransaction = SQLiteTransaction<
    "async",
    void | SqliteRemoteResult<unknown> | RunResult,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
>;

// Don't ask
type DbConnectionJeff = DbConnection;
export type { DbConnectionJeff as DbConnection };

// export type DbTransaction = SQLiteTransaction<
//     "async",
//     SqliteRemoteResult<unknown>,
//     typeof schema,
//     ExtractTablesWithRelations<typeof schema>
// >;
// export type CustomSqlJsTransaction = SQLJsTransaction<typeof schema, any>;
