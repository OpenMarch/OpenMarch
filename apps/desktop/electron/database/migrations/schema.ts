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
    sqliteView,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/*************** COMMON COLUMNS ***************/

const timestamps = {
    created_at: text()
        .notNull()
        .default(sql`(CURRENT_TIMESTAMP)`),
    updated_at: text()
        .notNull()
        .default(sql`(CURRENT_TIMESTAMP)`)
        .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
};

// APPEARANCE

/** Columns that define how a marcher looks */
export const appearance_columns = {
    fill_color: text(),
    outline_color: text(),
    shape_type: text(),
    visible: integer().default(1).notNull(),
    label_visible: integer().default(1).notNull(),
    equipment_name: text(),
    equipment_state: text(),
};

/*************** TABLES ***************/

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
        ...timestamps,
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
        ...timestamps,
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
        /** "marcher" or "prop" */
        type: text().notNull().default("marcher"),
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
        ...timestamps,
    },
    (table) => [unique().on(table.drill_prefix, table.drill_order)],
);

export const props = sqliteTable(
    "props",
    {
        id: integer().primaryKey(),
        marcher_id: integer()
            .notNull()
            .unique()
            .references(() => marchers.id, { onDelete: "cascade" }),
        /** "floor" (marched over), "platform" (stand on), "obstacle" (blocks) */
        surface_type: text().notNull().default("obstacle"),
        asset_url: text(),
        prop_category: text(),
        default_width: real(),
        default_height: real(),
        image: browserSafeBinaryBlob(),
        image_opacity: real().notNull().default(1),
        ...timestamps,
    },
    (table) => [index("idx_props_marcher_id").on(table.marcher_id)],
);

export const prop_page_geometry = sqliteTable(
    "prop_page_geometry",
    {
        id: integer().primaryKey(),
        marcher_page_id: integer()
            .notNull()
            .unique()
            .references(() => marcher_pages.id, { onDelete: "cascade" }),
        /** "rectangle", "circle", or "custom" */
        shape_type: text().notNull().default("rectangle"),
        /** Width in feet/meters */
        width: real().notNull(),
        /** Height in feet/meters */
        height: real().notNull(),
        /** Radius for circles */
        radius: real(),
        /** JSON for custom shapes (Phase 2) */
        custom_geometry: text(),
        /** 2D rotation in degrees (yaw - rotation on canvas plane) */
        rotation: real().notNull().default(0),
        /** Whether the prop is visible on this page */
        visible: integer({ mode: "boolean" }).notNull().default(true),
        ...timestamps,
    },
    (table) => [
        check("prop_page_geometry_width_check", sql`width > 0`),
        check("prop_page_geometry_height_check", sql`height > 0`),
        check(
            "prop_page_geometry_radius_check",
            sql`radius IS NULL OR radius > 0`,
        ),
        index("idx_prop_page_geometry_mp_id").on(table.marcher_page_id),
    ],
);

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
    ...timestamps,
});

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

export const section_appearances = sqliteTable("section_appearances", {
    id: integer().primaryKey(),
    section: text().notNull(),
    ...appearance_columns,
    ...timestamps,
});

export const tags = sqliteTable("tags", {
    id: integer().primaryKey(),
    name: text(),
    description: text(),
    icon: text(),
    color_hex: text(),
    ...timestamps,
});

/**
 * What a tag looks like on a page and onward.
 */
export const tag_appearances = sqliteTable(
    "tag_appearances",
    {
        id: integer().primaryKey(),
        tag_id: integer()
            .notNull()
            .references(() => tags.id, { onDelete: "cascade" }),
        start_page_id: integer()
            .notNull()
            // TODO: Restrict deletion so that when a page is deleted, we ensure the tag is moved to another page
            .references(() => pages.id, { onDelete: "cascade" }),
        priority: integer().default(0).notNull(),
        ...appearance_columns,
        ...timestamps,
    },
    (table) => [unique().on(table.tag_id, table.start_page_id)],
);

export const marcher_tags = sqliteTable(
    "marcher_tags",
    {
        id: integer().primaryKey(),
        marcher_id: integer()
            .notNull()
            .references(() => marchers.id, { onDelete: "cascade" }),
        tag_id: integer()
            .notNull()
            .references(() => tags.id, { onDelete: "cascade" }),
        ...timestamps,
    },
    (table) => [unique().on(table.marcher_id, table.tag_id)],
);

export const utility = sqliteTable(
    "utility",
    {
        id: integer().primaryKey(),
        last_page_counts: integer().notNull().default(8),
        default_beat_duration: real().notNull().default(0.5), // 120 bpm
        updated_at: text()
            .default(sql`(CURRENT_TIMESTAMP)`)
            .notNull()
            .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
    },
    (_table) => [
        check("utility_last_page_counts_check", sql`last_page_counts > 0`),
        check("utility_id_check", sql`id = 0`),
        check(
            "utility_default_beat_duration_check",
            sql`default_beat_duration > 0`,
        ),
    ],
);

export const workspace_settings = sqliteTable(
    "workspace_settings",
    {
        id: integer().primaryKey(),
        json_data: text().notNull(),
        ...timestamps,
    },
    (_table) => [check("workspace_settings_id_check", sql`id = 1`)],
);

/* =========================== VIEWS =========================== */
export const timing_objects = sqliteView("timing_objects", {
    position: integer("position").notNull(),
    duration: real("duration").notNull(),
    timestamp: real("timestamp").notNull(),
    beat_id: integer("beat_id").notNull(),
    page_id: integer("page_id"),
    measure_id: integer("measure_id"),
}).as(
    sql`
    SELECT
        beats.position AS position,
        beats.duration AS duration,
        SUM(duration) OVER (
            ORDER BY position
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS timestamp,
        beats.id AS beat_id,
        pages.id AS page_id,
        measures.id AS measure_id
    FROM beats
    LEFT JOIN pages
        ON beats.id = pages.start_beat
    LEFT JOIN measures
        ON beats.id = measures.start_beat
    ORDER BY beats.position ASC`,
);
