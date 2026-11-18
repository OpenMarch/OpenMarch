import { desc, sql } from "drizzle-orm";
import path from "path";
import { schema } from "@/../electron/database/db";
import { migrationQueriesAfter } from "@/../electron/database/services/DrizzleMigrationService";
import { addedColumn } from "@/../electron/database/migrations/addColumnGuard";
import { TIMELINE_MODEL_USER_VERSION } from "@/../electron/database/fileVersion";
import { transactionWithHistory } from "@/db-functions/history";
import type { DbConnection } from "@/db-functions/types";
import { triggerStatements } from "@/../electron/database/migrations/triggers";
import { createAllUndoTriggers } from "@/db-functions/historyTriggers";
import {
    convertPagesToTimelineInTransaction,
    type ConvertPagesOptions,
    type PageConversionResult,
} from "@/timeline/convert/convertPagesInTransaction";

/** The app's migrations folder. */
export const migrationsFolder = path.resolve(
    __dirname,
    "../../electron/database/migrations",
);

/**
 * Finishes a test file's conversion the way convert on open does: applies the timeline-only
 * migrations (they drop the page-era tables) and sets `user_version` to 8. As the app's runner
 * does, it skips an `ADD COLUMN` the table already has: the page-era test file took the later
 * migrations' columns when it was built (`pageEraBlankPath`). Writes outside the history wrapper,
 * so undo never brings the tables back.
 */
export async function finishTestConversion(db: DbConnection): Promise<void> {
    const last = await db
        .select({ createdAt: sql<number>`created_at` })
        .from(sql`__drizzle_migrations`)
        .orderBy(desc(sql`created_at`))
        .get();
    const queries = migrationQueriesAfter(
        migrationsFolder,
        last ? Number(last.createdAt) : undefined,
        "timeline",
    );
    // As convert on open does: foreign keys off outside the transaction (inside one SQLite ignores
    // the pragma), so a migration that rebuilds a parent table (0024) can drop it
    await db.run(sql`PRAGMA foreign_keys = OFF`);
    try {
        await db.transaction(async (tx) => {
            // And, as the migration service does, the triggers and views come off first and back
            // after, so a table rebuild neither trips over them nor loses them
            const names = async (query: string) =>
                new Set(
                    (await tx.all(sql.raw(query))).map((r) =>
                        Array.isArray(r)
                            ? String(r[0])
                            : String((r as { name: string }).name),
                    ),
                );
            for (const s of triggerStatements(new Set(), false).drop)
                await tx.run(sql.raw(s));
            // As the migration service runs them: an ADD COLUMN the table already has is skipped.
            // 0026's already ran before the conversion (`CONVERTER_SCHEMA_MIGRATION_TAGS`), and the
            // page-era test file took the later migrations' columns when it was built
            for (const query of queries) {
                if (!query.trim()) continue;
                const added = addedColumn(query);
                const has =
                    added !== null &&
                    (
                        await names(
                            `SELECT lower(name) FROM pragma_table_info('${added.table}')`,
                        )
                    ).has(added.column.toLowerCase());
                if (!has) await tx.run(sql.raw(query));
            }
            const tables = await names(
                "SELECT name FROM sqlite_schema WHERE type = 'table'",
            );
            const route = await names(
                "SELECT name FROM pragma_table_info('timeline_transitions') WHERE name = 'route_id'",
            );
            for (const s of triggerStatements(tables, route.size > 0).create)
                await tx.run(sql.raw(s));
            await tx.run(
                sql.raw(`PRAGMA user_version = ${TIMELINE_MODEL_USER_VERSION}`),
            );
        });
        await createAllUndoTriggers(db);
    } finally {
        await db.run(sql`PRAGMA foreign_keys = ON`);
    }
}

/**
 * Test helper: converts the page show a test built (with the page-era fixtures kept, see
 * `keepFixturesInPageMode`) into timeline rows as one undoable edit, then finishes the conversion
 * like convert on open, dropping the page-era tables. With `keepPageTables`, the tables stay, for
 * tests of the converter that convert twice (`replace`).
 */
export async function convertPagesToTimeline(
    db: DbConnection,
    {
        keepPageTables = false,
        ...options
    }: ConvertPagesOptions & { keepPageTables?: boolean } = {},
): Promise<PageConversionResult> {
    const result = await transactionWithHistory(
        db,
        "convertPagesToTimeline",
        (tx) => convertPagesToTimelineInTransaction(tx, options),
    );
    if (!keepPageTables) await finishTestConversion(db);
    return result;
}

/** Whether the page-era tables are still in the file (a test kept its page-era fixtures). */
export async function hasPageEraTables(db: DbConnection): Promise<boolean> {
    const row = await db
        .select({ n: sql<number>`count(*)` })
        .from(sql`sqlite_schema`)
        .where(sql`type = 'table' AND name = 'marcher_pages'`)
        .get();
    return (row?.n ?? 0) > 0;
}
