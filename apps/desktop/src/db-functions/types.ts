import { schema } from "@/global/database/db";
import { DbConnection } from "@/test/base";
import { RunResult } from "better-sqlite3";
import { SqliteRemoteResult } from "drizzle-orm/sqlite-proxy";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";

export type DbTransaction = SQLiteTransaction<
    "async",
    RunResult | void | SqliteRemoteResult<unknown>,
    typeof schema,
    any
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
