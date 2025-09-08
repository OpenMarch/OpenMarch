import type { Database } from "sql.js";
import { DefaultLogger } from "drizzle-orm/logger";
import {
    createTableRelationsHelpers,
    extractTablesRelationalConfig,
    type RelationalSchemaConfig,
    type TablesRelationalConfig,
} from "drizzle-orm/relations";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core/db";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core/dialect";
import type { DrizzleConfig } from "drizzle-orm/utils";
import { SQLJsSession } from "drizzle-orm/sql-js/session";

export type SQLJsDatabase<
    TSchema extends Record<string, unknown> = Record<string, never>,
> = BaseSQLiteDatabase<"sync", void, TSchema>;

export function drizzle<
    TSchema extends Record<string, unknown> = Record<string, never>,
>(
    client: Database,
    config: DrizzleConfig<TSchema> = {},
): SQLJsDatabase<TSchema> {
    const dialect = new SQLiteSyncDialect({ casing: config.casing });
    let logger;
    if (config.logger === true) {
        logger = new DefaultLogger();
    } else if (config.logger !== false) {
        logger = config.logger;
    }

    let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
    if (config.schema) {
        const tablesConfig = extractTablesRelationalConfig(
            config.schema,
            createTableRelationsHelpers,
        );
        schema = {
            fullSchema: config.schema,
            schema: tablesConfig.tables,
            tableNamesMap: tablesConfig.tableNamesMap,
        };
    }

    const session = new SQLJsSession(client, dialect, schema, { logger });
    return new BaseSQLiteDatabase(
        "sync",
        dialect,
        session,
        schema,
    ) as SQLJsDatabase<TSchema>;
}
