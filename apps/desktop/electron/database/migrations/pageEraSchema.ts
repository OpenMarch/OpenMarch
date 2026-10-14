/**
 * The page-era motion tables (ADR 0001 §1): positions per marcher per page, pathways, midsets
 * and the old page shapes. Timelines replaced them, and the post-conversion migration
 * (`0020_drop_page_era`) drops them. They are not in `schema.ts`, so nothing in the app can read
 * or write them; only the converter (`src/timeline/convert`) reads them, from a file that hasn't
 * been converted yet, in the conversion transaction.
 */
import {
    sqliteTable,
    integer,
    text,
    real,
    index,
    check,
    unique,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { appearance_columns, marchers, pages, timestamps } from "./schema";

export const pathways = sqliteTable("pathways", {
    id: integer().primaryKey(),
    path_data: text().notNull(),
    notes: text(),
    ...timestamps,
});

/**
 * A MarcherPage is used to represent a Marcher's position on a Page.
 * MarcherPages can/should not be created or deleted directly, but are created and deleted when a Marcher or Page is.
 * There should be a MarcherPage for every Marcher and Page combination (M * P).
 */
export const marcher_pages = sqliteTable(
    "marcher_pages",
    {
        /** The id of the MarcherPage in the database */
        id: integer().primaryKey(),
        /** The id of the Marcher the MarcherPage is associated with */
        marcher_id: integer()
            .notNull()
            .references(() => marchers.id, { onDelete: "cascade" }),
        /** The id of the Page the MarcherPage is associated with */
        page_id: integer()
            .notNull()
            .references(() => pages.id, { onDelete: "cascade" }),
        /** X coordinate of the MarcherPage in pixels */
        x: real().notNull(),
        /** Y coordinate of the MarcherPage in pixels */
        y: real().notNull(),
        ...timestamps,
        /** The ID of the pathway data */
        path_data_id: integer().references(() => pathways.id, {
            onDelete: "set null",
        }),
        /**
         * The position along the pathway (0-1).
         * This is the position in the pathway the marcher starts at for this coordinate.
         * If this is null, then it is assumed to be 0 (the start of the pathway).
         */
        path_start_position: real(),
        /**
         * The position along the pathway (0-1).
         * This is the position in the pathway the marcher ends up at for this coordinate.
         * If this is null, then it is assumed to be 1 (the end of the pathway).
         */
        path_end_position: real(),
        /** Any notes about the MarcherPage. Optional - currently not implemented */
        notes: text(),
        rotation_degrees: real().notNull().default(0),
        ...appearance_columns,
    },
    (table) => [
        check(
            "marcher_pages_path_data_position_check",
            sql`path_start_position >= 0 AND path_start_position <= 1 AND path_end_position >= 0 AND path_end_position <= 1`,
        ),
        index("index_marcher_pages_on_page_id").on(table.page_id),
        index("index_marcher_pages_on_marcher_id").on(table.marcher_id),
        unique().on(table.marcher_id, table.page_id),
    ],
);

export const midsets = sqliteTable(
    "midsets",
    {
        id: integer().primaryKey(),
        /** The ID of the marcher page this midset is going to */
        mp_id: integer()
            .notNull()
            .references(() => marcher_pages.id, { onDelete: "cascade" }),
        x: real().notNull(),
        y: real().notNull(),
        /** The progress placement of the midset on the marcher page */
        progress_placement: real().notNull(),
        ...timestamps,
        path_data_id: integer().references(() => pathways.id, {
            onDelete: "set null",
        }),
        path_start_position: real(),
        path_end_position: real(),
        notes: text(),
    },
    (table) => [
        check(
            "midsets_path_data_position_check",
            sql`path_start_position >= 0 AND path_start_position <= 1 AND path_end_position >= 0 AND path_end_position <= 1`,
        ),
        check(
            "placement_check",
            sql`progress_placement > 0 AND progress_placement < 1`,
        ),
        unique().on(table.mp_id, table.progress_placement),
    ],
);

export const shapes = sqliteTable("shapes", {
    id: integer().primaryKey(),
    name: text(),
    ...timestamps,
    notes: text(),
});

export const shape_pages = sqliteTable(
    "shape_pages",
    {
        id: integer().primaryKey(),
        shape_id: integer()
            .notNull()
            .references(() => shapes.id, { onDelete: "cascade" }),
        page_id: integer()
            .notNull()
            .references(() => pages.id, { onDelete: "cascade" }),
        svg_path: text().notNull(),
        ...timestamps,
        notes: text(),
    },
    (table) => [unique().on(table.page_id, table.shape_id)],
);

export const shape_page_marchers = sqliteTable(
    "shape_page_marchers",
    {
        id: integer().primaryKey(),
        shape_page_id: integer()
            .notNull()
            .references(() => shape_pages.id, { onDelete: "cascade" }),
        marcher_id: integer()
            .notNull()
            .references(() => marchers.id, { onDelete: "cascade" }),
        position_order: integer().notNull(),
        ...timestamps,
        notes: text(),
    },
    (table) => [
        index("idx-spm-marcher_id").on(table.marcher_id),
        index("idx-spm-shape_page_id").on(table.shape_page_id),
        unique().on(table.shape_page_id, table.marcher_id),
        unique().on(table.shape_page_id, table.position_order),
    ],
);
