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
    primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import {
    ARTWORK_SLOT_ID_BAD_GLOB,
    ARTWORK_SLOT_ID_MAX_LENGTH,
} from "./artworkSlotId";

/*************** COMMON COLUMNS ***************/

export const timestamps = {
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
        /**
         * `marcher` for a performer, `item` for a prop or piece of equipment with an `items` row
         * (props-spec section 4). Every all-marchers loop filters on it. Migration 0024 adds it
         * with `ALTER TABLE … ADD COLUMN`; see the note there.
         */
        type: text().notNull().default("marcher"),
    },
    (table) => [
        unique().on(table.drill_prefix, table.drill_order),
        ...coordinateChecks("marchers", "home_x"),
        ...coordinateChecks("marchers", "home_y"),
        check("marchers_type_check", sql`type IN ('marcher', 'item')`),
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
            // Every page delete moves these to the next page first (`moveTagAppearancesOffPagesInTransaction`);
            // the cascade only clears what that drops
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

/**
 * The show's 3D View venue (ADR 0002 D-5). A single row with `id = 1` whose
 * `json_data` is validated by `venueSettingsSchema` in
 * `src/view3d/core/venueSettings.ts`. No row means "use the default for the
 * field"; the row is created on the first change.
 */
export const view3d_venue = sqliteTable(
    "view3d_venue",
    {
        id: integer().primaryKey(),
        json_data: text().notNull(),
    },
    (_table) => [check("view3d_venue_id_check", sql`id = 1`)],
);

/**
 * The show's 3D View cameras (ADR 0002 D-5, amended 2026-10-16). A single
 * row with `id = 1` whose `json_data` is validated by `showCamerasSchema` in
 * `src/view3d/core/cameraList.ts`: the show's own camera list for each venue
 * it changed, and the camera profile each one came from. No row means every
 * venue uses its default cameras. Not in the undo history: camera lists are
 * view setup, not drill.
 */
export const view3d_cameras = sqliteTable(
    "view3d_cameras",
    {
        id: integer().primaryKey(),
        json_data: text().notNull(),
    },
    (_table) => [check("view3d_cameras_id_check", sql`id = 1`)],
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
 * A **Held** hold (holds README decision 2; ADR 0001 amendment 2026-10-30): one marcher stands
 * still on purpose over `[start_beat, end_beat)`, where it has no move. Editing a count inside
 * it edits the move that arrives at `start_beat`, so the whole hold moves. App data, kept apart
 * from the motion tables: not in `timeline_change_log`, never read by the
 * resolver (the marcher holds there anyway, spec R-6). No move of the marcher overlaps a mark
 * (H-1) and one marcher's marks don't overlap (H-3), checked at commit
 * (`timeline_held_violations`). A rowid key, so undo restores the same row (C-2).
 */
export const timeline_held_marks = sqliteTable(
    "timeline_held_marks",
    {
        id: integer().primaryKey(),
        marcher_id: integer()
            .notNull()
            .references(() => marchers.id, { onDelete: "cascade" }),
        start_beat: integer().notNull(),
        end_beat: integer().notNull(),
    },
    (table) => [
        unique().on(table.marcher_id, table.start_beat),
        check(
            "timeline_held_marks_start_beat_check",
            sql`typeof(start_beat) = 'integer' AND start_beat >= 0`,
        ),
        check(
            "timeline_held_marks_end_beat_check",
            sql`typeof(end_beat) = 'integer' AND end_beat > start_beat`,
        ),
    ],
);

/**
 * A placed shape's **recipe** (ADR 0006): the Shape tool kind and parameters that laid out its
 * marchers at the end of a move (`timeline_id`), or their homes (`NULL`), so the shape can be
 * reopened and edited. The positions themselves are ordinary destinations; this row only
 * remembers how they were made. App data: not in `timeline_change_log`, never read by the
 * resolver. Deleted with its move.
 */
export const timeline_shape_recipes = sqliteTable(
    "timeline_shape_recipes",
    {
        id: integer().primaryKey(),
        timeline_id: integer().references(() => timelines.id, {
            onDelete: "cascade",
        }),
        /** The Shape tool kind's id: line, arc, circle, curve, block, ... */
        kind: text().notNull(),
        /** The kind's generator version when placed */
        kind_version: integer().notNull(),
        /** The kind's parameters, JSON, in field units */
        params: text().notNull(),
        /** Who goes where: keep, nearest or drill */
        order_mode: text().notNull(),
        reverse: integer({ mode: "boolean" }).notNull().default(false),
        created_at: text()
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
    },
    (_table) => [
        check("timeline_shape_recipes_params_check", sql`json_valid(params)`),
    ],
);

/**
 * A marcher placed by a recipe: its spot in the recipe's slot order and where the recipe put it
 * when last placed (ADR 0006). Where the marcher stands now, less this point, is its override.
 * A surrogate id, so undo restores the same row (ADR 0001 C-2).
 */
export const timeline_shape_recipe_marchers = sqliteTable(
    "timeline_shape_recipe_marchers",
    {
        id: integer().primaryKey(),
        recipe_id: integer()
            .notNull()
            .references(() => timeline_shape_recipes.id, {
                onDelete: "cascade",
            }),
        marcher_id: integer()
            .notNull()
            .references(() => marchers.id, { onDelete: "cascade" }),
        slot: integer().notNull(),
        x: real().notNull(),
        y: real().notNull(),
    },
    (table) => [
        unique().on(table.recipe_id, table.marcher_id),
        index("timeline_shape_recipe_marchers_marcher").on(table.marcher_id),
    ],
);

/**
 * The show's copies of the saved shapes it uses (ADR 0006, saved shapes; #353): a shape kind and
 * its intervals, kept in the user's library across shows and copied here so the show opens with
 * them on a machine without that library entry. App data, outside undo history like
 * `library_items`: saving a shape isn't a drill edit.
 */
export const saved_shapes = sqliteTable(
    "saved_shapes",
    {
        /** The saved shape's id, the same as in the user's library */
        id: text().primaryKey(),
        name: text().notNull(),
        /** The shape kind's id and generator version, as in `timeline_shape_recipes` */
        kind: text().notNull(),
        kind_version: integer().notNull(),
        /** JSON object, each interval parameter's key to its value in steps */
        intervals: text().notNull(),
        /** What the user wrote about it; NULL for nothing */
        description: text(),
        /**
         * JSON object, how a closed kind is filled, as in a recipe's `params.distribution` but
         * without its size or seed (ADR 0006); NULL for an open kind
         */
        distribution: text(),
        created_at: text()
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
        updated_at: text()
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
    },
    (_table) => [
        check("saved_shapes_intervals_check", sql`json_valid(intervals)`),
        check(
            "saved_shapes_distribution_check",
            sql`distribution IS NULL OR json_valid(distribution)`,
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

/* ======================= PERFORMER CUES ======================= */
/*
 * What performers do, count by count (ADR 0004, docs/3d/performer-behavior.md). Cues sit on beat
 * ids, so beat edits never rewrite them; deleting a beat deletes its cues. No trigger reads or
 * writes these tables. The compile step (`@openmarch/core` cues) reads them; storage keeps the
 * columns consistent, and compile applies the behavior rules (fits, states-only channels,
 * take-overs).
 */

/** The channels a cue can set (ADR 0004 D-1, and its 2026-10-11 amendment for the last three). */
export const CUE_CHANNELS = [
    "feet",
    "horn_equipment",
    "facing",
    "body",
    "carry",
    "silk",
    "uniform",
] as const;

/** Channels whose values name Library items (`library:<uuid>@<version hash>`; amendment 2026-10-11). */
const LIBRARY_VALUE_CHANNELS_SQL = "'carry', 'silk', 'uniform'";

/**
 * A show-stored phrase asset (ADR 0004 D-3). Built-ins aren't stored; cues name them by id.
 * `data_json` is the versioned phrase format (spec section 5); readers migrate older
 * `format_version`s on load and never write back silently.
 */
export const phrase_assets = sqliteTable(
    "phrase_assets",
    {
        id: integer().primaryKey(),
        name: text().notNull(),
        label: text().notNull(),
        /** copied_builtin, posed or imported; v1 writes only copied_builtin */
        source: text().notNull(),
        /** JSON array of the channels the phrase plays on and takes over */
        channels_json: text().notNull(),
        format_version: integer().notNull(),
        data_json: text().notNull(),
        ...timestamps,
    },
    (_table) => [
        check(
            "phrase_assets_source_check",
            sql`source IN ('copied_builtin', 'posed', 'imported')`,
        ),
        check(
            "phrase_assets_channels_json_check",
            sql`json_valid(channels_json) AND json_type(channels_json) = 'array'`,
        ),
        check(
            "phrase_assets_format_version_check",
            sql`typeof(format_version) = 'integer' AND format_version >= 1`,
        ),
        check(
            "phrase_assets_data_json_check",
            sql`json_valid(data_json) AND json_type(data_json) = 'object'`,
        ),
    ],
);

/**
 * A cue: on one channel, for one target, on one beat (ADR 0004 D-1). Same-count,
 * same-specificity ties go to the higher `id`. Hand-picked set members are in `cue_marchers`.
 */
export const cues = sqliteTable(
    "cues",
    {
        id: integer().primaryKey(),
        /** One of `CUE_CHANNELS` */
        channel: text().notNull(),
        /** state or phrase */
        kind: text().notNull(),
        /** band, section, tag or set */
        target_kind: text().notNull(),
        /** Set only for a section target */
        target_section: text(),
        /** Set only for a tag target. Deleting the tag deletes its cues. */
        target_tag_id: integer().references(() => tags.id, {
            onDelete: "cascade",
        }),
        /** The beat the cue sits on; its instant is the start of the beat (the count's click) */
        beat_id: integer()
            .notNull()
            .references(() => beats.id, { onDelete: "cascade" }),
        /**
         * `builtin:<channel>.<family>.<value>`, `show:<phrase_assets.id>`,
         * `library:<uuid>@<version hash>` (Carry, Silk, Uniform) or `none` (Carry)
         */
        value: text().notNull(),
        /** Set only for a show phrase; a phrase asset in use can't be deleted */
        phrase_asset_id: integer().references(() => phrase_assets.id, {
            onDelete: "restrict",
        }),
        /** Phrases only: the length in counts, inclusive, at least 2 */
        length: integer(),
        /** States only: the transition length in counts, at least 1; null is the library default */
        transition_length: integer(),
        /** The value's settings as a JSON object */
        settings_json: text().notNull().default("{}"),
        /** `{ version: 1, span, order }`, or null for no ripple. Never on Feet. */
        ripple_json: text(),
        notes: text(),
        ...timestamps,
    },
    (table) => [
        check(
            "cues_channel_check",
            sql.raw(
                `channel IN (${CUE_CHANNELS.map((c) => `'${c}'`).join(", ")})`,
            ),
        ),
        check("cues_kind_check", sql`kind IN ('state', 'phrase')`),
        check(
            "cues_target_check",
            sql`(target_kind IN ('band', 'set') AND target_section IS NULL AND target_tag_id IS NULL) OR (target_kind = 'section' AND target_section IS NOT NULL AND target_tag_id IS NULL) OR (target_kind = 'tag' AND target_tag_id IS NOT NULL AND target_section IS NULL)`,
        ),
        check(
            "cues_length_check",
            sql`(kind = 'phrase' AND typeof(length) = 'integer' AND length >= 2 AND transition_length IS NULL) OR (kind = 'state' AND length IS NULL AND (transition_length IS NULL OR (typeof(transition_length) = 'integer' AND transition_length >= 1)))`,
        ),
        check(
            "cues_value_check",
            sql.raw(
                `(value GLOB 'builtin:?*' AND phrase_asset_id IS NULL) OR (kind = 'phrase' AND phrase_asset_id IS NOT NULL AND value = 'show:' || phrase_asset_id) OR (channel IN (${LIBRARY_VALUE_CHANNELS_SQL}) AND kind = 'state' AND value GLOB 'library:?*@?*' AND phrase_asset_id IS NULL) OR (channel = 'carry' AND kind = 'state' AND value = 'none' AND phrase_asset_id IS NULL)`,
            ),
        ),
        check(
            "cues_settings_json_check",
            sql`json_valid(settings_json) AND json_type(settings_json) = 'object'`,
        ),
        check(
            "cues_ripple_json_check",
            sql`ripple_json IS NULL OR (channel <> 'feet' AND json_valid(ripple_json) AND json_type(ripple_json) = 'object' AND json_extract(ripple_json, '$.version') = 1 AND json_type(ripple_json, '$.span') = 'integer' AND json_extract(ripple_json, '$.span') >= 1 AND json_extract(ripple_json, '$.order') IN ('drill', 'left_right', 'right_left', 'down_form'))`,
        ),
        index("cues_beat_id_idx").on(table.beat_id),
        index("cues_channel_beat_id_idx").on(table.channel, table.beat_id),
    ],
);

/**
 * The marchers of a hand-picked set cue (ADR 0004 D-2). The marcher deletion write path deletes
 * a set cue left with no members, in the same transaction.
 *
 * Has a surrogate `id`, unique on (cue, marcher), rather than the ADR's two-column primary key:
 * history replays by rowid, so undo has to restore the same rowid (as `marcher_tags` does).
 */
export const cue_marchers = sqliteTable(
    "cue_marchers",
    {
        id: integer().primaryKey(),
        cue_id: integer()
            .notNull()
            .references(() => cues.id, { onDelete: "cascade" }),
        marcher_id: integer()
            .notNull()
            .references(() => marchers.id, { onDelete: "cascade" }),
    },
    (table) => [
        unique("cue_marchers_cue_marcher_unique").on(
            table.cue_id,
            table.marcher_id,
        ),
        index("cue_marchers_marcher_id_idx").on(table.marcher_id),
    ],
);

/** Per-set performer settings (ADR 0004 D-4). No row means the show default. */
export const page_performer_settings = sqliteTable(
    "page_performer_settings",
    {
        page_id: integer()
            .primaryKey()
            .references(() => pages.id, { onDelete: "cascade" }),
        /** What the set's dot marks: the landing foot or the body's center */
        dot_mode: text().notNull(),
    },
    (_table) => [
        check(
            "page_performer_settings_dot_mode_check",
            sql`dot_mode IN ('foot', 'body')`,
        ),
    ],
);

/* ======================= SHOW LIBRARY ======================== */
/*
 * The show's copies of the Library items it uses (ADR 0002 D-12, props-spec.md section 2,
 * package C1.11). Following `audio_files` and `field_properties.image`, the bytes live in the
 * show file, so a show renders on a machine whose local Library is empty. Neither table has
 * history triggers: embedding and pruning are not undoable edits.
 */

/** Content-addressed bytes, deduped across every embedded Version. */
export const library_blobs = sqliteTable(
    "library_blobs",
    {
        /** sha256 of `data`, lowercase hex */
        hash: text().primaryKey(),
        data: browserSafeBinaryBlob().notNull(),
    },
    (_table) => [
        check("library_blobs_hash_check", sql`length(hash) = 64`),
        check("library_blobs_data_type_check", sql`typeof(data) = 'blob'`),
    ],
);

/** One embedded Version of a Library item. A show may keep several Versions of one item. */
export const library_items = sqliteTable(
    "library_items",
    {
        item_id: text().notNull(),
        version_hash: text().notNull(),
        kind: text().notNull(),
        name: text().notNull(),
        /** Built-ins are embedded too, so app updates never change old shows */
        built_in: integer().notNull().default(0),
        /** JSON object, part role to `library_blobs.hash` */
        parts: text().notNull(),
        /** JSON array of `{ itemId, versionHash }` this Version pins, such as a Uniform's Garments */
        pins: text().notNull().default("[]"),
        /** JSON snapshot of the item's metadata (tags, license, dates) when it was embedded */
        metadata: text().notNull(),
        /** A model's sidecar JSON, so the show reads it at open without a blob read */
        sidecar: text(),
        embedded_at: text()
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
    },
    (table) => [
        primaryKey({ columns: [table.item_id, table.version_hash] }),
        check(
            "library_items_kind_check",
            sql`kind IN ('model', 'artwork', 'uniform')`,
        ),
        check("library_items_built_in_check", sql`built_in IN (0, 1)`),
        check(
            "library_items_version_hash_check",
            sql`length(version_hash) = 64`,
        ),
    ],
);

/* =========================== ITEMS =========================== */

export const ITEM_KINDS = ["prop", "equipment"] as const;
export const SURFACE_TYPES = ["floor", "platform", "obstacle"] as const;
export const OUTLINE_TYPES = [
    "rectangle",
    "circle",
    "arc",
    "polygon",
    "freehand",
] as const;
/** The Floor prop edge a roll-out reveals its Artwork from, in the item's own frame */
export const LEADING_EDGES = ["front", "back", "left", "right"] as const;

const sqlList = (values: readonly string[]) =>
    values.map((v) => `'${v}'`).join(", ");

/**
 * A prop or piece of equipment with its own identity in the show (ADR 0002 D-9, props-spec
 * section 4). Backed by a `marchers` row of type `item`, so its positions come from the timeline
 * resolver and its motion and undo are inherited.
 */
export const items = sqliteTable(
    "items",
    {
        id: integer().primaryKey(),
        marcher_id: integer()
            .notNull()
            .unique()
            .references(() => marchers.id, { onDelete: "cascade" }),
        /** prop or equipment */
        kind: text().$type<(typeof ITEM_KINDS)[number]>().notNull(),
        /** floor, platform or obstacle. Props only. */
        surface_type: text().$type<(typeof SURFACE_TYPES)[number]>(),
        /**
         * The Library model and the Version it pins, or both null for a plain Outline. No foreign
         * key: the show's Library is pruned separately and keeps what this names (D-12).
         */
        library_item_id: text(),
        library_version_hash: text(),
        ...timestamps,
    },
    (_table) => [
        check("items_kind_check", sql.raw(`kind IN (${sqlList(ITEM_KINDS)})`)),
        check(
            "items_surface_type_check",
            sql.raw(
                `(kind = 'prop' AND surface_type IS NOT NULL AND surface_type IN (${sqlList(SURFACE_TYPES)})) OR (kind = 'equipment' AND surface_type IS NULL)`,
            ),
        ),
        check(
            "items_library_check",
            sql`(library_item_id IS NULL AND library_version_hash IS NULL) OR (library_item_id IS NOT NULL AND library_version_hash IS NOT NULL AND length(library_item_id) = 36 AND length(library_version_hash) = 64)`,
        ),
    ],
);

/**
 * An item's Outline from a beat on (ADR 0002 D-10, props-spec section 5). Latest wins: the row
 * on beat B is fully in place on B's click and eases in from the click of B - L + 1, so a
 * transition of 1 is instant (ADR 0004's state counting). Independent of moves. Sizes are meters,
 * rotation degrees.
 */
export const item_geometry = sqliteTable(
    "item_geometry",
    {
        id: integer().primaryKey(),
        item_id: integer()
            .notNull()
            .references(() => items.id, { onDelete: "cascade" }),
        beat_id: integer()
            .notNull()
            .references(() => beats.id, { onDelete: "cascade" }),
        outline_type: text().$type<(typeof OUTLINE_TYPES)[number]>().notNull(),
        /** Footprint across, in meters */
        width: real().notNull(),
        /** Footprint front to back, in meters */
        depth: real().notNull(),
        /** Vertical size in meters; 0 for a flat Floor prop */
        height: real().notNull().default(0),
        /** Yaw on the field plane, in degrees */
        rotation: real().notNull().default(0),
        /** JSON points backing a polygon, freehand or arc Outline */
        custom_outline: text(),
        /** In counts, at least 1; 1 is instant */
        transition_length: integer().notNull().default(1),
        /** Floor props: reveal the Artwork from `leading_edge` instead of stretching it */
        rolls_out: integer().notNull().default(0),
        leading_edge: text().$type<(typeof LEADING_EDGES)[number]>(),
        ...timestamps,
    },
    (table) => [
        unique("item_geometry_item_beat_unique").on(
            table.item_id,
            table.beat_id,
        ),
        index("item_geometry_beat_id_idx").on(table.beat_id),
        check(
            "item_geometry_outline_type_check",
            sql.raw(`outline_type IN (${sqlList(OUTLINE_TYPES)})`),
        ),
        check(
            "item_geometry_size_check",
            sql`width > 0 AND depth > 0 AND height >= 0`,
        ),
        check(
            "item_geometry_transition_check",
            sql`typeof(transition_length) = 'integer' AND transition_length >= 1`,
        ),
        check(
            "item_geometry_custom_outline_check",
            sql`custom_outline IS NULL OR json_valid(custom_outline)`,
        ),
        check(
            "item_geometry_rolls_out_check",
            sql.raw(
                `(rolls_out = 0 AND leading_edge IS NULL) OR (rolls_out = 1 AND leading_edge IS NOT NULL AND leading_edge IN (${sqlList(LEADING_EDGES)}))`,
            ),
        ),
    ],
);

export const PLACEMENT_STATES = ["held", "placed", "off_field"] as const;
export const HANDS = ["left", "right", "both"] as const;
export const PLACEMENT_ROLES = ["holder", "crew"] as const;
/** The orders an item ripple runs in, as a cue ripple's (`cues.ripple_json`) */
export const ITEM_RIPPLE_ORDERS = [
    "drill",
    "left_right",
    "right_left",
    "down_form",
] as const;

/**
 * Where an item is from a beat on (ADR 0002 D-10, props-spec section 4): held by performers
 * (`item_placement_marchers`), placed at its own position with an optional crew, or Off field.
 * Latest wins and the change is instant on its beat's click. Before an item's first change it is
 * placed at its own position (Off field before its first Outline); an item that comes from a flag
 * gets an explicit held change on its first beat, so nothing about an item's origin is stored.
 *
 * Of two items' changes on one beat, the higher `beat_rank`, then the higher `id`, is newer: a
 * write makes its change the newest on its beat, and a beat deletion or replacement that lands
 * changes on a beat ranks them below the ones already there, so who holds what stays put.
 *
 * The changes of an item ripple, one per item at staggered counts, each with its own value, share
 * a `group_id` and the ripple they were spread by (`ripple_json`, `{ version: 1, span, order }`
 * as on a cue), so the group can be shown, re-timed and edited together. A held change keeps at
 * least one holder, and only a placed change has crew: the write path keeps both
 * (`itemPlacements.ts`).
 */
export const item_placements = sqliteTable(
    "item_placements",
    {
        id: integer().primaryKey(),
        item_id: integer()
            .notNull()
            .references(() => items.id, { onDelete: "cascade" }),
        beat_id: integer()
            .notNull()
            .references(() => beats.id, { onDelete: "cascade" }),
        /** held, placed or off_field */
        state: text().notNull(),
        /** Ties between items' changes on one beat: the higher is newer, then the higher id */
        beat_rank: integer().notNull().default(0),
        /** The item ripple this row is part of, or null */
        group_id: integer(),
        /** The group's ripple, `{ version: 1, span, order }`: set exactly when `group_id` is */
        ripple_json: text(),
        ...timestamps,
    },
    (table) => [
        unique("item_placements_item_beat_unique").on(
            table.item_id,
            table.beat_id,
        ),
        index("item_placements_beat_id_idx").on(table.beat_id),
        index("item_placements_group_id_idx").on(table.group_id),
        check(
            "item_placements_state_check",
            sql.raw(`state IN (${sqlList(PLACEMENT_STATES)})`),
        ),
        check(
            "item_placements_beat_rank_check",
            sql`typeof(beat_rank) = 'integer'`,
        ),
        check(
            "item_placements_group_check",
            sql.raw(
                `(group_id IS NULL AND ripple_json IS NULL) OR (typeof(group_id) = 'integer' AND group_id >= 1 AND ripple_json IS NOT NULL AND json_valid(ripple_json) AND json_type(ripple_json) = 'object' AND json_extract(ripple_json, '$.version') = 1 AND json_type(ripple_json, '$.span') = 'integer' AND json_extract(ripple_json, '$.span') >= 1 AND json_extract(ripple_json, '$.order') IN (${sqlList(ITEM_RIPPLE_ORDERS)}))`,
            ),
        ),
    ],
);

/**
 * The performers on a Placement change: its holders, each with a hand, or its crew. A surrogate
 * `id` unique on (placement, marcher), as `cue_marchers` has, so undo restores the same rowid.
 */
export const item_placement_marchers = sqliteTable(
    "item_placement_marchers",
    {
        id: integer().primaryKey(),
        placement_id: integer()
            .notNull()
            .references(() => item_placements.id, { onDelete: "cascade" }),
        marcher_id: integer()
            .notNull()
            .references(() => marchers.id, { onDelete: "cascade" }),
        /** holder or crew */
        role: text().notNull(),
        /** left, right or both: holders only */
        hand: text(),
    },
    (table) => [
        unique("item_placement_marchers_placement_marcher_unique").on(
            table.placement_id,
            table.marcher_id,
        ),
        index("item_placement_marchers_marcher_id_idx").on(table.marcher_id),
        check(
            "item_placement_marchers_role_check",
            sql.raw(
                `(role = 'holder' AND hand IS NOT NULL AND hand IN (${sqlList(HANDS)})) OR (role = 'crew' AND hand IS NULL)`,
            ),
        ),
    ],
);

export const ARTWORK_FITS = ["fill", "fit"] as const;

/**
 * Which Artwork sits on an item slot from a beat on (ADR 0002 D-10, props-spec section 4). Latest
 * wins per (item, slot), a hard cut on its beat's click. Both Library columns null leave the slot
 * bare from that beat. The slot is an id, not a foreign key: an item's slots come from its model's
 * declarations or its Outline, so a row whose slot an update drops stays stored but dormant and is
 * live again on revert. Fill or fit, pan and pad color sit on the row, so one Artwork can sit
 * differently on two slots.
 */
export const item_artwork_slots = sqliteTable(
    "item_artwork_slots",
    {
        id: integer().primaryKey(),
        item_id: integer()
            .notNull()
            .references(() => items.id, { onDelete: "cascade" }),
        beat_id: integer()
            .notNull()
            .references(() => beats.id, { onDelete: "cascade" }),
        /**
         * The slot id: `top`, `front` or `back` with no model, else one the model declares; 1 to
         * 64 letters, digits, underscores or dashes (`artworkSlotId.ts`)
         */
        slot: text().notNull(),
        /**
         * The Artwork and the Version it pins, or both null for a bare slot. No foreign key, as on
         * `items`: the show's Library is pruned separately and keeps what this names (D-12).
         */
        library_item_id: text(),
        library_version_hash: text(),
        /** fill (crop to cover, centered unless panned) or fit (pad) */
        fit: text().notNull().default("fill"),
        /** A filled crop's offset from center, -1 to 1 of the overflow on each axis */
        pan_x: real().notNull().default(0),
        pan_y: real().notNull().default(0),
        /** `#rrggbb` padding for fit, or null: transparent where the surface allows, else its base color */
        pad_color: text(),
        ...timestamps,
    },
    (table) => [
        unique("item_artwork_slots_item_slot_beat_unique").on(
            table.item_id,
            table.slot,
            table.beat_id,
        ),
        index("item_artwork_slots_beat_id_idx").on(table.beat_id),
        check(
            "item_artwork_slots_slot_check",
            sql.raw(
                `slot IS NOT NULL AND length(slot) BETWEEN 1 AND ${ARTWORK_SLOT_ID_MAX_LENGTH} AND slot NOT GLOB '${ARTWORK_SLOT_ID_BAD_GLOB}'`,
            ),
        ),
        check(
            "item_artwork_slots_library_check",
            sql`(library_item_id IS NULL AND library_version_hash IS NULL) OR (library_item_id IS NOT NULL AND library_version_hash IS NOT NULL AND length(library_item_id) = 36 AND length(library_version_hash) = 64)`,
        ),
        check(
            "item_artwork_slots_fit_check",
            sql.raw(`fit IS NOT NULL AND fit IN (${sqlList(ARTWORK_FITS)})`),
        ),
        check(
            "item_artwork_slots_pan_check",
            sql`pan_x IS NOT NULL AND pan_y IS NOT NULL AND typeof(pan_x) IN ('real', 'integer') AND typeof(pan_y) IN ('real', 'integer') AND pan_x BETWEEN -1 AND 1 AND pan_y BETWEEN -1 AND 1`,
        ),
        check(
            "item_artwork_slots_pad_color_check",
            sql`pad_color IS NULL OR (length(pad_color) = 7 AND pad_color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]')`,
        ),
    ],
);

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
