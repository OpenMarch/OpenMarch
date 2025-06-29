import {
    sqliteTable,
    integer,
    text,
    real,
    index,
    blob,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

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

export const history_stats = sqliteTable("history_stats", {
    id: integer().primaryKey(),
    cur_undo_group: integer().notNull(),
    cur_redo_group: integer().notNull(),
    group_limit: integer().notNull(),
});

export const beats = sqliteTable("beats", {
    id: integer().primaryKey(),
    duration: real().notNull(),
    position: integer().notNull(),
    include_in_measure: integer().default(1).notNull(),
    notes: text(),
    created_at: text().default("sql`(CURRENT_TIMESTAMP)`").notNull(),
    updated_at: text()
        .default("sql`(CURRENT_TIMESTAMP)`")
        .notNull()
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
});

export const measures = sqliteTable("measures", {
    id: integer().primaryKey(),
    start_beat: integer()
        .notNull()
        .references(() => beats.id),
    rehearsal_mark: text(),
    notes: text(),
    created_at: text().default("sql`(CURRENT_TIMESTAMP)`").notNull(),
    updated_at: text()
        .default("sql`(CURRENT_TIMESTAMP)`")
        .notNull()
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
});

export const pages = sqliteTable("pages", {
    id: integer().primaryKey(),
    is_subset: integer().default(0).notNull(),
    notes: text(),
    created_at: text().default("sql`(CURRENT_TIMESTAMP)`").notNull(),
    updated_at: text()
        .default("sql`(CURRENT_TIMESTAMP)`")
        .notNull()
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
    start_beat: integer()
        .notNull()
        .references(() => beats.id),
});

export const marchers = sqliteTable("marchers", {
    id: integer().primaryKey(),
    name: text(),
    section: text().notNull(),
    year: text(),
    notes: text(),
    drill_prefix: text().notNull(),
    drill_order: integer().notNull(),
    created_at: text().notNull(),
    updated_at: text()
        .notNull()
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
});

export const marcher_pages = sqliteTable(
    "marcher_pages",
    {
        id: integer().primaryKey(),
        id_for_html: text(),
        marcher_id: integer()
            .notNull()
            .references(() => marchers.id, { onDelete: "cascade" }),
        page_id: integer()
            .notNull()
            .references(() => pages.id, { onDelete: "cascade" }),
        x: real(),
        y: real(),
        created_at: text().notNull(),
        updated_at: text()
            .notNull()
            .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
        notes: text(),
    },
    (table) => [
        index("index_marcher_pages_on_page_id").on(table.page_id),
        index("index_marcher_pages_on_marcher_id").on(table.marcher_id),
    ],
);

export const field_properties = sqliteTable("field_properties", {
    id: integer().primaryKey(),
    json_data: text().notNull(),
    image: blob(),
});

export const audio_files = sqliteTable("audio_files", {
    id: integer().primaryKey(),
    path: text().notNull(),
    nickname: text(),
    data: blob(),
    selected: integer().default(0).notNull(),
    created_at: text().notNull(),
    updated_at: text()
        .notNull()
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
});

export const music_xml_files = sqliteTable("music_xml_files", {
    id: integer().primaryKey(),
    path: text().notNull(),
    nickname: text(),
    data: blob(),
    selected: integer().default(0).notNull(),
    created_at: text().notNull(),
    updated_at: text()
        .notNull()
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
});

export const shapes = sqliteTable("shapes", {
    id: integer().primaryKey(),
    name: text(),
    created_at: text().default("sql`(CURRENT_TIMESTAMP)`").notNull(),
    updated_at: text()
        .default("sql`(CURRENT_TIMESTAMP)`")
        .notNull()
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
    notes: text(),
});

export const shape_pages = sqliteTable("shape_pages", {
    id: integer().primaryKey(),
    shape_id: integer()
        .notNull()
        .references(() => shapes.id, { onDelete: "cascade" }),
    page_id: integer()
        .notNull()
        .references(() => pages.id, { onDelete: "cascade" }),
    svg_path: text().notNull(),
    created_at: text().default("sql`(CURRENT_TIMESTAMP)`").notNull(),
    updated_at: text()
        .default("sql`(CURRENT_TIMESTAMP)`")
        .notNull()
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
    notes: text(),
});

export const shape_page_marchers = sqliteTable(
    "shape_page_marchers",
    {
        id: integer().primaryKey(),
        shape_page_id: integer()
            .notNull()
            .references(() => shape_pages.id),
        marcher_id: integer()
            .notNull()
            .references(() => marchers.id),
        position_order: integer(),
        created_at: text().default("sql`(CURRENT_TIMESTAMP)`").notNull(),
        updated_at: text()
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull()
            .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
        notes: text(),
    },
    (table) => [
        index("idx-spm-marcher_id").on(table.marcher_id),
        index("idx-spm-shape_page_id").on(table.shape_page_id),
    ],
);

export const section_appearances = sqliteTable("section_appearances", {
    id: integer().primaryKey(),
    section: text().notNull(),
    fill_color: text().default("rgba(0, 0, 0, 1)").notNull(),
    outline_color: text().default("rgba(0, 0, 0, 1)").notNull(),
    shape_type: text().default("circle").notNull(),
    created_at: text().default("sql`(CURRENT_TIMESTAMP)`").notNull(),
    updated_at: text()
        .default("sql`(CURRENT_TIMESTAMP)`")
        .notNull()
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
});

export const utility = sqliteTable("utility", {
    id: integer().primaryKey(),
    last_page_counts: integer(),
});
