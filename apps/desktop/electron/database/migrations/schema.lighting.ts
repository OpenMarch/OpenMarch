import { sql } from "drizzle-orm";
import {
    check,
    integer,
    real,
    sqliteTable,
    text,
    unique,
} from "drizzle-orm/sqlite-core";
import { marchers, pages } from "./schema.core";
import { LightingEffectType } from "@openmarch/core";

export const lighting_scenes = sqliteTable("lighting_scenes", {
    id: integer().primaryKey(),
    start_page_id: integer()
        .notNull()
        .references(() => pages.id, { onDelete: "cascade" }),
    name: text(),
});

export const lighting_groups = sqliteTable("lighting_groups", {
    id: integer().primaryKey(),
    scene_id: integer()
        .notNull()
        .references(() => lighting_scenes.id, { onDelete: "cascade" }),
    name: text(),
});

export const lighting_group_marchers = sqliteTable(
    "lighting_group_marchers",
    {
        id: integer().primaryKey(),
        group_id: integer()
            .notNull()
            .references(() => lighting_groups.id, { onDelete: "cascade" }),
        marcher_id: integer()
            .notNull()
            .references(() => marchers.id, { onDelete: "cascade" }),
        /** Denormalized from `lighting_groups.scene_id` for uniqueness in SQLite. */
        scene_id: integer()
            .notNull()
            .references(() => lighting_scenes.id, { onDelete: "cascade" }),
    },
    (table) => [
        unique("lighting_group_marchers_group_id_marcher_id_unique").on(
            table.group_id,
            table.marcher_id,
        ),
        unique("lighting_group_marchers_scene_id_marcher_id_unique").on(
            table.scene_id,
            table.marcher_id,
        ),
    ],
);

export const lighting_effects = sqliteTable(
    "lighting_effects",
    {
        id: integer().primaryKey(),
        scene_id: integer()
            .notNull()
            .references(() => lighting_scenes.id, { onDelete: "cascade" }),
        type: text().notNull().$type<LightingEffectType>(),
        args: text()
            .notNull()
            .default(sql`'{}'`),
        name: text(),
        /** Beats from the scene start page (inclusive). */
        start_offset_beats: integer().notNull().default(0),
        /** Effect length in beats (>= 0). */
        duration_beats: integer().notNull().default(1),
    },
    (table) => [
        check(
            "lighting_effect_type_check",
            sql`${table.type} IN ('solid', 'strobe', 'fade', 'wipe')`,
        ),
        check(
            "lighting_effect_start_offset_beats_check",
            sql`${table.start_offset_beats} >= 0`,
        ),
        check(
            "lighting_effect_duration_beats_check",
            sql`${table.duration_beats} >= 0`,
        ),
    ],
);

export const lighting_effect_groups = sqliteTable(
    "lighting_effect_groups",
    {
        id: integer().primaryKey(),
        lighting_effect_id: integer()
            .notNull()
            .references(() => lighting_effects.id, { onDelete: "cascade" }),
        lighting_group_id: integer()
            .notNull()
            .references(() => lighting_groups.id, { onDelete: "cascade" }),
    },
    (table) => [
        unique("lighting_effect_groups_effect_group_unique").on(
            table.lighting_effect_id,
            table.lighting_group_id,
        ),
    ],
);

export const lighting_effect_layers = sqliteTable(
    "lighting_effect_layers",
    {
        id: integer().primaryKey(),
        lighting_effect_id: integer()
            .notNull()
            .references(() => lighting_effects.id, { onDelete: "cascade" }),
        top: real().notNull(),
        left: real().notNull(),
        height: real().notNull(),
        width: real().notNull(),
    },
    (table) => [
        check("lighting_effect_layer_top_check", sql`${table.top} >= 0`),
        check("lighting_effect_layer_left_check", sql`${table.left} >= 0`),
        check("lighting_effect_layer_height_check", sql`${table.height} >= 0`),
        check("lighting_effect_layer_width_check", sql`${table.width} >= 0`),
    ],
);
