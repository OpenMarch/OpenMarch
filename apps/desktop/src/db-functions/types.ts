import { schema } from "@/global/database/db";
import { RunResult } from "libsql";
import { SqliteRemoteResult } from "drizzle-orm/sqlite-proxy";
import { BaseSQLiteDatabase, SQLiteTransaction } from "drizzle-orm/sqlite-core";
import { ExtractTablesWithRelations } from "drizzle-orm/relations";

export type DbTransaction = SQLiteTransaction<
    "async",
    void | SqliteRemoteResult<unknown> | RunResult,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
>;

export type DbConnection = BaseSQLiteDatabase<
    "async",
    void | SqliteRemoteResult<unknown> | RunResult,
    typeof schema
>;

// export type DbTransaction = SQLiteTransaction<
//     "async",
//     SqliteRemoteResult<unknown>,
//     typeof schema,
//     ExtractTablesWithRelations<typeof schema>
// >;
// export type CustomSqlJsTransaction = SQLJsTransaction<typeof schema, any>;
