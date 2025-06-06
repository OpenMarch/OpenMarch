import {
    sqliteTable,
    check,
    integer,
    text,
    real,
    blob,
    index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const historyUndo = sqliteTable(
    "history_undo",
    {
        sequence: integer().primaryKey(),
        historyGroup: integer("history_group").notNull(),
        sql: text().notNull(),
    },
    (table) => [],
);

export const historyRedo = sqliteTable(
    "history_redo",
    {
        sequence: integer().primaryKey(),
        historyGroup: integer("history_group").notNull(),
        sql: text().notNull(),
    },
    (table) => [],
);

export const historyStats = sqliteTable(
    "history_stats",
    {
        id: integer().primaryKey(),
        curUndoGroup: integer("cur_undo_group").notNull(),
        curRedoGroup: integer("cur_redo_group").notNull(),
        groupLimit: integer("group_limit").notNull(),
    },
    (table) => [check("history_stats_check_1", sql`id = 1`)],
);

export const beats = sqliteTable(
    "beats",
    {
        id: integer().primaryKey(),
        duration: real().notNull(),
        position: integer().notNull(),
        includeInMeasure: integer("include_in_measure", { mode: "boolean" })
            .default(true)
            .notNull(),
        notes: text(),
        createdAt: text("created_at")
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull(),
        updatedAt: text("updated_at")
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull(),
    },
    (table) => [
        check("beats_check_2", sql`duration >= 0`),
        check("beats_check_3", sql`position >= 0`),
    ],
);

export const measures = sqliteTable(
    "measures",
    {
        id: integer().primaryKey(),
        startBeat: integer("start_beat")
            .notNull()
            .references(() => beats.id),
        rehearsalMark: text("rehearsal_mark"),
        notes: text(),
        createdAt: text("created_at")
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull(),
        updatedAt: text("updated_at")
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull(),
    },
    (table) => [],
);

export const pages = sqliteTable(
    "pages",
    {
        id: integer().primaryKey(),
        isSubset: integer("is_subset", { mode: "boolean" })
            .default(false)
            .notNull(),
        notes: text(),
        createdAt: text("created_at")
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull(),
        updatedAt: text("updated_at")
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull(),
        startBeat: integer("start_beat")
            .notNull()
            .references(() => beats.id),
    },
    (table) => [],
);

export const marchers = sqliteTable(
    "marchers",
    {
        id: integer().primaryKey(),
        name: text(),
        section: text().notNull(),
        year: text(),
        notes: text(),
        drillPrefix: text("drill_prefix").notNull(),
        drillOrder: integer("drill_order").notNull(),
        createdAt: text("created_at").default("sql`(CURRENT_TIMESTAMP)`"),
        updatedAt: text("updated_at").default("sql`(CURRENT_TIMESTAMP)`"),
    },
    (table) => [],
);

export const marcherPages = sqliteTable(
    "marcher_pages",
    {
        id: integer().primaryKey(),
        idForHtml: text("id_for_html"),
        marcherId: integer("marcher_id")
            .notNull()
            .references(() => marchers.id, { onDelete: "cascade" }),
        pageId: integer("page_id")
            .notNull()
            .references(() => pages.id, { onDelete: "cascade" }),
        x: real(),
        y: real(),
        createdAt: text("created_at").default("sql`(CURRENT_TIMESTAMP)`"),
        updatedAt: text("updated_at").default("sql`(CURRENT_TIMESTAMP)`"),
        notes: text(),
    },
    (table) => [
        index("index_marcher_pages_on_page_id").on(table.pageId),
        index("index_marcher_pages_on_marcher_id").on(table.marcherId),
    ],
);

export const fieldProperties = sqliteTable(
    "field_properties",
    {
        id: integer().primaryKey(),
        jsonData: text("json_data").notNull(),
        image: blob(),
    },
    (table) => [check("field_properties_check_6", sql`id = 1`)],
);

export const audioFiles = sqliteTable(
    "audio_files",
    {
        id: integer().primaryKey(),
        path: text().notNull(),
        nickname: text(),
        data: blob(),
        selected: integer().default(0).notNull(),
        createdAt: text("created_at").default("sql`(CURRENT_TIMESTAMP)`"),
        updatedAt: text("updated_at").default("sql`(CURRENT_TIMESTAMP)`"),
    },
    (table) => [],
);

export const shapes = sqliteTable(
    "shapes",
    {
        id: integer().primaryKey(),
        name: text(),
        createdAt: text("created_at")
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull(),
        updatedAt: text("updated_at")
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull(),
        notes: text(),
    },
    (table) => [],
);

export const shapePages = sqliteTable(
    "shape_pages",
    {
        id: integer().primaryKey(),
        shapeId: integer("shape_id")
            .notNull()
            .references(() => shapes.id, { onDelete: "cascade" }),
        pageId: integer("page_id")
            .notNull()
            .references(() => pages.id, { onDelete: "cascade" }),
        svgPath: text("svg_path").notNull(),
        createdAt: text("created_at")
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull(),
        updatedAt: text("updated_at")
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull(),
        notes: text(),
    },
    (table) => [],
);

export const shapePageMarchers = sqliteTable(
    "shape_page_marchers",
    {
        id: integer().primaryKey(),
        shapePageId: integer("shape_page_id")
            .notNull()
            .references(() => shapePages.id),
        marcherId: integer("marcher_id")
            .notNull()
            .references(() => marchers.id),
        positionOrder: integer("position_order"),
        createdAt: text("created_at")
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull(),
        updatedAt: text("updated_at")
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull(),
        notes: text(),
    },
    (table) => [
        index("idx-spm-marcher_id").on(table.marcherId),
        index("idx-spm-shape_page_id").on(table.shapePageId),
    ],
);

export const sectionAppearances = sqliteTable(
    "section_appearances",
    {
        id: integer().primaryKey(),
        section: text().notNull(),
        fillColor: text("fill_color").default("rgba(0, 0, 0, 1)").notNull(),
        outlineColor: text("outline_color")
            .default("rgba(0, 0, 0, 1)")
            .notNull(),
        shapeType: text("shape_type").default("circle").notNull(),
        createdAt: text("created_at")
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull(),
        updatedAt: text("updated_at")
            .default("sql`(CURRENT_TIMESTAMP)`")
            .notNull(),
    },
    (table) => [],
);

export const utility = sqliteTable(
    "utility",
    {
        id: integer().primaryKey(),
        lastPageCounts: integer("last_page_counts"),
    },
    (table) => [
        check("utility_check_7", sql`id = 0`),
        check("utility_check_8", sql`last_page_counts >= 1`),
    ],
);
