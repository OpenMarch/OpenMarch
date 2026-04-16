import { sql } from "drizzle-orm";
import {
    check,
    integer,
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
    },
    (table) => [
        check(
            "lighting_effect_type_check",
            sql`${table.type} IN ('solid', 'strobe', 'fade')`,
        ),
    ],
);

export const marcher_lighting_effects = sqliteTable(
    "marcher_lighting_effects",
    {
        id: integer().primaryKey(),
        lighting_effect_id: integer()
            .notNull()
            .references(() => lighting_effects.id, { onDelete: "cascade" }),
        marcher_id: integer()
            .notNull()
            .references(() => marchers.id, { onDelete: "cascade" }),
    },
    (table) => [unique().on(table.lighting_effect_id, table.marcher_id)],
);
