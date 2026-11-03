/**
 * Turns a fully migrated test file back into one from before a migration. Drizzle applies only
 * migrations newer than the last one a file records, so a test of migration N on a file from
 * before it has to undo N and every later one; opening the file then applies them all again, as
 * it would for a real older file.
 *
 * Each migration from 0022 on registers how a test rolls it back here.
 */
import type { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as path from "path";
import { migrationsFolder, withDb } from "./convertOnOpenFixtures";

type Journal = { entries: { idx: number; tag: string; when: number }[] };
export const journal: Journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf-8"),
);
export const migrationAt = (idx: number) =>
    journal.entries.find((e) => e.idx === idx)!;

const dropTables = (db: DatabaseSync, tables: readonly string[]) => {
    for (const table of tables) db.exec(`DROP TABLE ${table}`);
};

/** Rebuilds `marchers` from its stored DDL with `fragment` removed, keeping its rows and index. */
const dropMarchersColumn = (
    db: DatabaseSync,
    column: string,
    fragment: string,
) => {
    const { sql } = db
        .prepare("SELECT sql FROM sqlite_schema WHERE name = 'marchers'")
        .get() as { sql: string };
    if (!sql.includes(fragment)) {
        throw new Error(`marchers has no ${column} column to roll back`);
    }
    const columns = (
        db.prepare("SELECT name FROM pragma_table_info('marchers')").all() as {
            name: string;
        }[]
    )
        .map((c) => c.name)
        .filter((name) => name !== column)
        .map((name) => `\`${name}\``)
        .join(", ");
    db.exec(
        sql
            .replace(fragment, "")
            .replace('CREATE TABLE "marchers"', 'CREATE TABLE "marchers_old"'),
    );
    db.exec(
        `INSERT INTO marchers_old (${columns}) SELECT ${columns} FROM marchers`,
    );
    // Triggers on other tables name `marchers`; the migration service recreates every trigger
    db.exec("PRAGMA legacy_alter_table = ON");
    db.exec("DROP TABLE marchers");
    db.exec("ALTER TABLE marchers_old RENAME TO marchers");
    db.exec("PRAGMA legacy_alter_table = OFF");
    db.exec(
        "CREATE UNIQUE INDEX `marchers_drill_prefix_drill_order_unique` ON `marchers` (`drill_prefix`,`drill_order`)",
    );
};

const ROLLBACKS: Record<number, (db: DatabaseSync) => void> = {
    // Performer cues (ADR 0004)
    22: (db) =>
        dropTables(db, [
            "cue_marchers",
            "cues",
            "page_performer_settings",
            "phrase_assets",
        ]),
    // 3D View cameras
    23: (db) => dropTables(db, ["view3d_cameras"]),
    // Items and Outline geometry (C2.1)
    24: (db) => {
        dropTables(db, ["item_geometry", "items"]);
        dropMarchersColumn(
            db,
            "type",
            `, \`type\` text DEFAULT 'marcher' NOT NULL CONSTRAINT "marchers_type_check" CHECK(type IN ('marcher', 'item'))`,
        );
    },
    // Item Placement (C2.3)
    25: (db) => dropTables(db, ["item_placement_marchers", "item_placements"]),
    // Artwork slot assignments (C2.4)
    26: (db) => dropTables(db, ["item_artwork_slots"]),
    // Shape recipes (ADR 0006)
    27: (db) =>
        dropTables(db, [
            "timeline_shape_recipe_marchers",
            "timeline_shape_recipes",
        ]),
    // Saved shapes, the show's copies (ADR 0006, saved shapes)
    28: (db) => dropTables(db, ["saved_shapes"]),
    // Kept spots removed (holds, #467): the table comes back empty, as 0018 made it
    29: (db) =>
        db.exec(`CREATE TABLE \`timeline_kept_assignments\` (
	\`assignment_id\` integer PRIMARY KEY NOT NULL,
	\`created_at\` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (\`assignment_id\`) REFERENCES \`timeline_assignments\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`),
    // Held marks (ADR 0001 amendment 2026-10-30)
    30: (db) => dropTables(db, ["timeline_held_marks"]),
};

/**
 * Undoes migration `idx` and every later one the file has taken, newest first. A page-era file
 * hasn't taken the timeline-only migrations until it converts, so those are left alone.
 */
export function rollBackMigrationsFrom(filePath: string, idx: number) {
    withDb(filePath, (db) => {
        const taken = new Set(
            (
                db
                    .prepare("SELECT created_at FROM __drizzle_migrations")
                    .all() as { created_at: number }[]
            ).map((row) => Number(row.created_at)),
        );
        const later = journal.entries
            .filter((e) => e.idx >= idx && taken.has(e.when))
            .sort((a, b) => b.idx - a.idx);
        db.exec("PRAGMA foreign_keys = OFF");
        for (const entry of later) {
            const rollBack = ROLLBACKS[entry.idx];
            if (!rollBack) {
                throw new Error(
                    `No rollback for migration ${entry.tag}: add one to migrationRollback.ts`,
                );
            }
            rollBack(db);
            db.prepare(
                "DELETE FROM __drizzle_migrations WHERE created_at = ?",
            ).run(entry.when);
        }
    });
}
