import { DatabaseSync } from "node:sqlite";
import { sql } from "drizzle-orm";
import * as pageEra from "@om-electron/database/migrations/pageEraSchema";
import type { DbConnection } from "@/test/base";
import { pageEraBlankPath } from "@/test/timelineMode";

/**
 * Building page shows for the converter's tests (docs/timeline/phases/06-converter.md). The app
 * can't write the page-era tables any more, so these helpers write them directly
 * (`pageEraSchema.ts`), the way an older file holds them.
 */

const PAGE_ERA_TABLES = [
    "pathways",
    "marcher_pages",
    "midsets",
    "shapes",
    "shape_pages",
    "shape_page_marchers",
] as const;

let pageEraDdl: string[] | undefined;

/** The page-era tables' and indexes' DDL, read once from a blank page-era file. */
async function readPageEraDdl(): Promise<string[]> {
    if (pageEraDdl) return pageEraDdl;
    const file = new DatabaseSync(await pageEraBlankPath(), { readOnly: true });
    try {
        const tables = new Set<string>(PAGE_ERA_TABLES);
        const rows = file
            .prepare(
                "SELECT type, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid",
            )
            .all() as { type: string; tbl_name: string; sql: string }[];
        const ddl = (type: string) =>
            rows
                .filter((r) => r.type === type && tables.has(r.tbl_name))
                .map((r) =>
                    r.sql
                        .replace(
                            /^CREATE TABLE /i,
                            "CREATE TABLE IF NOT EXISTS ",
                        )
                        .replace(
                            /^CREATE (UNIQUE )?INDEX /i,
                            (_, unique: string | undefined) =>
                                `CREATE ${unique ?? ""}INDEX IF NOT EXISTS `,
                        ),
                );
        pageEraDdl = [...ddl("table"), ...ddl("index")];
    } finally {
        file.close();
    }
    return pageEraDdl;
}

/**
 * Adds the page-era tables to a file that has none (the blank `db` fixture is a timeline file), so
 * a test can build a page show and convert it. Does nothing to tables a file already has.
 */
export async function addPageEraTables(db: DbConnection): Promise<void> {
    for (const statement of await readPageEraDdl())
        await db.run(sql.raw(statement));
}

/** A page-era `marcher_pages` row to write */
export interface PageEraRow {
    marcher_id: number;
    page_id: number;
    x: number;
    y: number;
    path_data_id?: number | null;
    path_start_position?: number | null;
    path_end_position?: number | null;
}

/** Writes `marcher_pages` rows, replacing the position of a row that is already there. */
export async function writeMarcherPages(
    db: DbConnection,
    rows: readonly PageEraRow[],
): Promise<void> {
    for (const row of rows)
        await db
            .insert(pageEra.marcher_pages)
            .values(row)
            .onConflictDoUpdate({
                target: [
                    pageEra.marcher_pages.marcher_id,
                    pageEra.marcher_pages.page_id,
                ],
                set: {
                    x: row.x,
                    y: row.y,
                    ...(row.path_data_id !== undefined
                        ? { path_data_id: row.path_data_id }
                        : {}),
                },
            });
}

/**
 * Writes a page shape as page mode stored it: the shape, its page row, its marchers in order, and
 * their `marcher_pages` positions along it.
 */
export async function writeShapePage(
    db: DbConnection,
    {
        page_id,
        svg_path,
        marcher_coordinates,
    }: {
        page_id: number;
        svg_path: string;
        marcher_coordinates: readonly {
            marcher_id: number;
            x: number;
            y: number;
        }[];
    },
): Promise<void> {
    const [shape] = await db.insert(pageEra.shapes).values({}).returning();
    const [shapePage] = await db
        .insert(pageEra.shape_pages)
        .values({ shape_id: shape!.id, page_id, svg_path })
        .returning();
    if (marcher_coordinates.length === 0) return;
    await db.insert(pageEra.shape_page_marchers).values(
        marcher_coordinates.map((c, position_order) => ({
            shape_page_id: shapePage!.id,
            marcher_id: c.marcher_id,
            position_order,
        })),
    );
    await writeMarcherPages(
        db,
        marcher_coordinates.map((c) => ({ ...c, page_id })),
    );
}
