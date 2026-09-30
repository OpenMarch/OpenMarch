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

/** CHECKs that a coordinate column holds a number within the authored bound (I-N2, I-D2). */
const coordinateChecks = (tableName: string, column: string) => [
    check(
        `${tableName}_${column}_type_check`,
        sql.raw(`typeof(${column}) IN ('integer', 'real')`),
    ),
    check(`${tableName}_${column}_check`, sql.raw(`abs(${column}) <= 1e6`)),
];

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
        ...timestamps,
        /**
         * Where the marcher stands before its first timeline assignment (spec §5.1, C-5).
         * Migration 0017 adds these with `ALTER TABLE … ADD COLUMN`; see the note there.
         */
        home_x: real().notNull().default(0),
        home_y: real().notNull().default(0),
    },
    (table) => [
        unique().on(table.drill_prefix, table.drill_order),
        ...coordinateChecks("marchers", "home_x"),
        ...coordinateChecks("marchers", "home_y"),
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

/* ========================= TIMELINES ========================= */
/*
 * The timeline motion model (docs/timeline/spec.md §5.1, ADR 0001). Column names follow the
 * spec; tables carry a `timeline_` prefix (C-4). Drizzle can't declare STRICT tables, so every
 * column the spec's I-N1 covers has a `typeof` CHECK instead (C-3). Invariant triggers, the
 * `timeline_commit_violations` view and the change-log triggers live in `triggers.ts`.
 *
 * Foreign keys from a timeline to its transitions, and from a transition to its assignments and
 * destinations, are ON DELETE RESTRICT (C-1): delete children explicitly first.
 */

/** Largest beat a timeline row may hold (2^31 - 1, spec I-N2). */
const TIMELINE_MAX_BEAT = 2147483647;

/** CHECK that an integer column holds an integer (spec I-N1, C-3). */
const integerTypeCheck = (tableName: string, column: string) =>
    check(
        `${tableName}_${column}_type_check`,
        sql.raw(`typeof(${column}) = 'integer'`),
    );

/** CHECKs on a `start_beat`/`end_beat` pair: integers, in range, positive length (I-N1, I-N2, I-A6). */
const beatRangeChecks = (tableName: string) => [
    integerTypeCheck(tableName, "start_beat"),
    integerTypeCheck(tableName, "end_beat"),
    check(
        `${tableName}_start_beat_check`,
        sql.raw(`start_beat BETWEEN 0 AND ${TIMELINE_MAX_BEAT}`),
    ),
    check(
        `${tableName}_end_beat_check`,
        sql.raw(`end_beat BETWEEN 0 AND ${TIMELINE_MAX_BEAT}`),
    ),
    check(`${tableName}_range_check`, sql`end_beat > start_beat`),
];

/** A track that groups transitions over a beat range (spec §5.1 `timelines`). */
export const timelines = sqliteTable(
    "timelines",
    {
        id: integer().primaryKey(),
        name: text(),
        start_beat: integer().notNull(),
        end_beat: integer().notNull(),
    },
    (_table) => [...beatRangeChecks("timelines")],
);

/** A formation that transitions move marchers into (spec §5.1 `shapes`, §5.2 geometry). */
export const timeline_shapes = sqliteTable(
    "timeline_shapes",
    {
        id: integer().primaryKey(),
        name: text(),
        /** line, freehand, circle, box or block */
        kind: text().notNull(),
        /** JSON geometry, by kind (spec §5.2) */
        geometry: text().notNull(),
    },
    (_table) => [
        check(
            "timeline_shapes_kind_check",
            sql`kind IN ('line', 'freehand', 'circle', 'box', 'block')`,
        ),
        check("timeline_shapes_geometry_check", sql`json_valid(geometry)`),
        // I-S1 (partial): a numeric circle radius in (0, 1e6] and start_angle in [0, 2π)
        check(
            "timeline_shapes_circle_check",
            sql`kind <> 'circle' OR (coalesce(json_type(geometry, '$.radius'), '') IN ('integer', 'real') AND json_extract(geometry, '$.radius') > 0 AND json_extract(geometry, '$.radius') <= 1e6 AND coalesce(json_type(geometry, '$.start_angle'), '') IN ('integer', 'real') AND json_extract(geometry, '$.start_angle') >= 0 AND json_extract(geometry, '$.start_angle') < 6.283185307179586)`,
        ),
    ],
);

/** Motion into a destination over a beat range (spec §5.1 `transitions`). */
export const timeline_transitions = sqliteTable(
    "timeline_transitions",
    {
        id: integer().primaryKey(),
        timeline_id: integer()
            .notNull()
            .references(() => timelines.id, { onDelete: "restrict" }),
        /** NULL: slots are placed individually in `timeline_slot_destinations` (D-16) */
        dest_shape_id: integer().references(() => timeline_shapes.id, {
            onDelete: "restrict",
        }),
        /** direct, arc or follow_the_leader */
        path_style: text().notNull().default("direct"),
        /** JSON path parameters, by path_style (spec §5.2) */
        path_params: text(),
        /** inherit or slot */
        order_mode: text().notNull().default("inherit"),
        slot_count: integer().notNull(),
        start_beat: integer().notNull(),
        end_beat: integer().notNull(),
    },
    (table) => [
        integerTypeCheck("timeline_transitions", "timeline_id"),
        check(
            "timeline_transitions_dest_shape_id_type_check",
            sql`dest_shape_id IS NULL OR typeof(dest_shape_id) = 'integer'`,
        ),
        check(
            "timeline_transitions_path_style_check",
            sql`path_style IN ('direct', 'arc', 'follow_the_leader')`,
        ),
        check(
            "timeline_transitions_path_params_check",
            sql`path_params IS NULL OR json_valid(path_params)`,
        ),
        check(
            "timeline_transitions_order_mode_check",
            sql`order_mode IN ('inherit', 'slot')`,
        ),
        integerTypeCheck("timeline_transitions", "slot_count"),
        check(
            "timeline_transitions_slot_count_check",
            sql`slot_count BETWEEN 1 AND 10000`,
        ),
        ...beatRangeChecks("timeline_transitions"),
        // I-T5: follow-the-leader follows a path, so it needs a destination shape
        check(
            "timeline_transitions_ftl_shape_check",
            sql`dest_shape_id IS NOT NULL OR path_style <> 'follow_the_leader'`,
        ),
        // I-T2 (partial): an arc carries a numeric bulge with |bulge| <= 0.5 (minor arcs only)
        check(
            "timeline_transitions_arc_bulge_check",
            sql`path_style <> 'arc' OR (coalesce(json_type(path_params, '$.bulge'), '') IN ('integer', 'real') AND abs(json_extract(path_params, '$.bulge')) <= 0.5)`,
        ),
        index("timeline_idx_tr_shape").on(table.dest_shape_id),
        index("timeline_idx_tr_timeline").on(table.timeline_id),
    ],
);

/** A marcher filling one slot of a transition over a beat range, at a layer (spec §5.1 `assignments`). */
export const timeline_assignments = sqliteTable(
    "timeline_assignments",
    {
        id: integer().primaryKey(),
        marcher_id: integer()
            .notNull()
            .references(() => marchers.id, { onDelete: "cascade" }),
        transition_id: integer()
            .notNull()
            .references(() => timeline_transitions.id, {
                onDelete: "restrict",
            }),
        slot_index: integer().notNull(),
        start_beat: integer().notNull(),
        end_beat: integer().notNull(),
        layer: integer().notNull().default(0),
    },
    (table) => [
        integerTypeCheck("timeline_assignments", "marcher_id"),
        integerTypeCheck("timeline_assignments", "transition_id"),
        integerTypeCheck("timeline_assignments", "slot_index"),
        check("timeline_assignments_slot_index_check", sql`slot_index >= 0`),
        ...beatRangeChecks("timeline_assignments"),
        integerTypeCheck("timeline_assignments", "layer"),
        check(
            "timeline_assignments_layer_check",
            sql`layer BETWEEN -1000 AND 1000`,
        ),
        unique("timeline_assignments_transition_slot_unique").on(
            table.transition_id,
            table.slot_index,
        ),
        unique("timeline_assignments_transition_marcher_unique").on(
            table.transition_id,
            table.marcher_id,
        ),
        index("timeline_idx_asn_marcher").on(
            table.marcher_id,
            table.start_beat,
        ),
    ],
);

/**
 * An individually placed destination for one slot of a shapeless transition (spec §5.1
 * `slot_destinations`, D-16). Has a surrogate `id` so undo restores the same rowid (C-2).
 */
export const timeline_slot_destinations = sqliteTable(
    "timeline_slot_destinations",
    {
        id: integer().primaryKey(),
        transition_id: integer()
            .notNull()
            .references(() => timeline_transitions.id, {
                onDelete: "restrict",
            }),
        slot_index: integer().notNull(),
        x: real().notNull(),
        y: real().notNull(),
    },
    (table) => [
        integerTypeCheck("timeline_slot_destinations", "transition_id"),
        integerTypeCheck("timeline_slot_destinations", "slot_index"),
        check(
            "timeline_slot_destinations_slot_index_check",
            sql`slot_index >= 0`,
        ),
        ...coordinateChecks("timeline_slot_destinations", "x"),
        ...coordinateChecks("timeline_slot_destinations", "y"),
        unique("timeline_slot_destinations_transition_slot_unique").on(
            table.transition_id,
            table.slot_index,
        ),
    ],
);

/**
 * Bookkeeping, not data: one row per changed timeline row, written by triggers and drained by
 * the write wrapper inside each transaction (spec §10.2). Has no history triggers.
 */
export const timeline_change_log = sqliteTable("timeline_change_log", {
    seq: integer().primaryKey(),
    /** The spec's logical table name: marchers, shapes, transitions, assignments or slot_destinations */
    tbl: text().notNull(),
    row_id: integer().notNull(),
    /** JSON row image; NULL on insert */
    before: text(),
    /** JSON row image; NULL on delete */
    after: text(),
});

/* =========================== VIEWS =========================== */
/**
 * An ordered list of the beats, pages, and measures in the app.
 *
 * This view should be used when needing to sort by page order.
 */
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
