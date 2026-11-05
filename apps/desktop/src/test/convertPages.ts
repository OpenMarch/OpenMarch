import { desc, sql } from "drizzle-orm";
import path from "path";
import { schema } from "@/../electron/database/db";
import { migrationQueriesAfter } from "@/../electron/database/services/DrizzleMigrationService";
import { TIMELINE_MODEL_USER_VERSION } from "@/../electron/database/fileVersion";
import { transactionWithHistory } from "@/db-functions/history";
import type { DbConnection } from "@/db-functions/types";
import { LATER_COLUMNS } from "./timelineMode";
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
 * migrations (they drop the page-era tables) and sets `user_version` to 8. Writes outside the
 * history wrapper, so undo never brings the tables back.
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
    // A page-mode fixture has the columns later migrations add already
    const has = new Set<string>();
    for (const table of new Set(LATER_COLUMNS.map((c) => c.table)))
        for (const c of await db
            .select({ name: sql<string>`name` })
            .from(sql`pragma_table_info(${table})`)
            .all())
            has.add(`${table}.${c.name}`);
    const addsExisting = (query: string) =>
        LATER_COLUMNS.some(
            (c) =>
                has.has(`${c.table}.${c.name}`) &&
                (query.includes(
                    `ALTER TABLE \`${c.table}\` ADD COLUMN \`${c.name}\``,
                ) ||
                    query.includes(
                        `ALTER TABLE \`${c.table}\` ADD \`${c.name}\``,
                    )),
        );
    await db.transaction(async (tx) => {
        for (const query of queries)
            if (query.trim() && !addsExisting(query))
                await tx.run(sql.raw(query));
        await tx.run(
            sql.raw(`PRAGMA user_version = ${TIMELINE_MODEL_USER_VERSION}`),
        );
    });
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
