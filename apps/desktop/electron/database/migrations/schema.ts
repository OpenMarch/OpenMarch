import {
    sqliteTable,
    integer,
    text,
    real,
    index,
    blob,
    check,
    unique,
    customType,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Drizzle defaults to using Buffer for "blob", which does not exist in the browser
// Uint8Array is available on both Node and the browser
const browserSafeBinaryBlob = customType<{
    data: Uint8Array;
    driverData: Uint8Array;
}>({
    dataType: () => "blob",
    fromDriver: (value) => new Uint8Array(value),
    toDriver: (value) => value,
});

export const history_undo = sqliteTable("history_undo", {
    sequence: integer().primaryKey(),
    history_group: integer().notNull(),
    sql: text().notNull(),
});

export const history_redo = sqliteTable("history_redo", {
    sequence: integer().primaryKey(),
    history_group: integer().notNull(),
    sql: text().notNull(),
});

export const history_stats = sqliteTable(
    "history_stats",
    {
        id: integer().primaryKey(),
        cur_undo_group: integer().notNull(),
        cur_redo_group: integer().notNull(),
        group_limit: integer().notNull(),
    },
    (_table) => [check("history_stats_id_check", sql`id = 1`)],
);

export const beats = sqliteTable(
    "beats",
    {
        id: integer().primaryKey(),
        /** Duration from this beat to the next in second. */
        duration: real().notNull(),
        /** The position of this beat in the show. Integer and unique */
        position: integer().notNull(),
        /** Whether this beat is included in a measure. 0 = false, 1 = true. */
        include_in_measure: integer().default(1).notNull(),
        /** Human readable notes. */
        notes: text(),
        created_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull(),
        updated_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull()
            .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
    },
    (_table) => [
        check("beats_duration_check", sql`duration >= 0`),
        check("beats_position_check", sql`position >= 0`),
        check("beats_include_in_measure", sql`include_in_measure IN (0, 1)`),
    ],
);

export const measures = sqliteTable("measures", {
    id: integer().primaryKey(),
    start_beat: integer()
        .notNull()
        .references(() => beats.id),
    rehearsal_mark: text(),
    notes: text(),
    created_at: text()
        .default(sql`(CURRENT_TIMESTAMP)`)
        .notNull(),
    updated_at: text()
        .default(sql`(CURRENT_TIMESTAMP)`)
        .notNull()
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
});

export const pages = sqliteTable(
    "pages",
    {
        id: integer().primaryKey(),
        /** Indicates if this page is a subset of another page */
        is_subset: integer().default(0).notNull(),
        /** Optional notes or description for the page */
        notes: text(),
        created_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull(),
        updated_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull()
            .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
        /** The ID of the beat this page starts on */
        start_beat: integer()
            .notNull()
            .references(() => beats.id),
    },
    (table) => [
        check("pages_is_subset_check", sql`is_subset IN (0, 1)`),
        unique().on(table.start_beat),
    ],
);

export const marchers = sqliteTable(
    "marchers",
    {
        id: integer().primaryKey(),
        /** The name of the marcher. Optional */
        name: text(),
        /** The section the marcher is in. E.g. "Color Guard" */
        section: text().notNull(),
        /** The year of the marcher. First year, freshman, etc.. Optional */
        year: text(),
        /** Any notes about the marcher. Optional */
        notes: text(),
        /** The drill prefix of the marcher's drill number. E.g. "BD" if the drill number is "BD1" */
        drill_prefix: text().notNull(),
        /** The drill order of the marcher's drill number. E.g. 12 if the drill number is "T12" */
        drill_order: integer().notNull(),
        created_at: text()
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
        updated_at: text()
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
    },
    (table) => [unique().on(table.drill_prefix, table.drill_order)],
);

export const pathways = sqliteTable("pathways", {
    id: integer().primaryKey(),
    path_data: text().notNull(),
    notes: text(),
    created_at: text()
        .default(sql`(CURRENT_TIMESTAMP)`)
        .notNull(),
    updated_at: text()
        .default(sql`(CURRENT_TIMESTAMP)`)
        .notNull()
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
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
        created_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull(),
        updated_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull()
            .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
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
        created_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull(),
        updated_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull()
            .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
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

export const field_properties = sqliteTable(
    "field_properties",
    {
        id: integer().primaryKey(),
        json_data: text().notNull(),
        image: browserSafeBinaryBlob(),
    },
    (_table) => [check("field_properties_id_check", sql`id = 1`)],
);

export const audio_files = sqliteTable("audio_files", {
    id: integer().primaryKey(),
    path: text().notNull(),
    nickname: text(),
    data: blob(),
    selected: integer().default(0).notNull(),
    created_at: text()
        .notNull()
        .default(sql`(CURRENT_TIMESTAMP)`),
    updated_at: text()
        .notNull()
        .default(sql`(CURRENT_TIMESTAMP)`)
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
});

export const shapes = sqliteTable("shapes", {
    id: integer().primaryKey(),
    name: text(),
    created_at: text()
        .default(sql`(CURRENT_TIMESTAMP)`)
        .notNull(),
    updated_at: text()
        .default(sql`(CURRENT_TIMESTAMP)`)
        .notNull()
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
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
        created_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull(),
        updated_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull()
            .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
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
        created_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull(),
        updated_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull()
            .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
        notes: text(),
    },
    (table) => [
        index("idx-spm-marcher_id").on(table.marcher_id),
        index("idx-spm-shape_page_id").on(table.shape_page_id),
        unique().on(table.shape_page_id, table.marcher_id),
        unique().on(table.shape_page_id, table.position_order),
    ],
);

export const section_appearances = sqliteTable("section_appearances", {
    id: integer().primaryKey(),
    section: text().notNull(),
    fill_color: text().default("rgba(0, 0, 0, 1)").notNull(),
    outline_color: text().default("rgba(0, 0, 0, 1)").notNull(),
    shape_type: text().default("circle").notNull(),
    created_at: text()
        .default(sql`(CURRENT_TIMESTAMP)`)
        .notNull(),
    updated_at: text()
        .default(sql`(CURRENT_TIMESTAMP)`)
        .notNull()
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
});

export const utility = sqliteTable(
    "utility",
    {
        id: integer().primaryKey(),
        last_page_counts: integer().notNull().default(8),
        updated_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull()
            .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
    },
    (_table) => [
        check("utility_last_page_counts_check", sql`last_page_counts > 0`),
        check("utility_id_check", sql`id = 0`),
    ],
);
