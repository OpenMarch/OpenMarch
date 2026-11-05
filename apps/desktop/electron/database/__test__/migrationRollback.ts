// cspell:ignore Millis (drizzle's `folderMillis`)
/**
 * Turns a fully migrated test file back into one from before a migration. Drizzle applies only
 * migrations newer than the last one a file records, so a test of migration N on a file from
 * before it has to undo N and every later one; opening the file then applies them all again, as
 * it would for a real older file.
 *
 * Each migration from 0017 on registers how a test rolls it back here. Before 0017 a file is
 * upstream's 0016, so both rollbacks restore what they changed from a file built with upstream's
 * migrations 0000-0016.
 */
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as path from "path";
import { migrationsFolder, withDb } from "./convertOnOpenFixtures";
import { readTaggedMigrations } from "../services/DrizzleMigrationService";

type Journal = { entries: { idx: number; tag: string; when: number }[] };
export const journal: Journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf-8"),
);
export const migrationAt = (idx: number) =>
    journal.entries.find((e) => e.idx === idx)!;

/** The tables and indexes of a file at upstream's 0016, by name. */
function upstream0016Schema(): Map<
    string,
    { type: string; tbl: string; sql: string }
> {
    const db = new DatabaseSync(":memory:");
    try {
        const last = migrationAt(16).when;
        for (const m of readTaggedMigrations(migrationsFolder))
            if (m.folderMillis <= last)
                for (const statement of m.sql) {
                    // As the migration service runs them: a table rebuild would cascade
                    db.exec("PRAGMA foreign_keys = OFF");
                    db.exec(statement);
                }
        return new Map(
            (
                db
                    .prepare(
                        "SELECT type, name, tbl_name AS tbl, sql FROM sqlite_schema WHERE sql IS NOT NULL",
                    )
                    .all() as {
                    type: string;
                    name: string;
                    tbl: string;
                    sql: string;
                }[]
            ).map((r) => [r.name, r]),
        );
    } finally {
        db.close();
    }
}

const dropTables = (db: DatabaseSync, tables: readonly string[]) => {
    for (const table of tables) db.exec(`DROP TABLE ${table}`);
};

/** Drops every trigger: they name columns a rollback removes. The migration service recreates them. */
const dropTriggers = (db: DatabaseSync) => {
    const triggers = db
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger'")
        .all() as { name: string }[];
    for (const { name } of triggers) db.exec(`DROP TRIGGER \`${name}\``);
};

/** Rebuilds `table` as upstream's 0016 has it, keeping its rows and its indexes. */
const restoreUpstreamTable = (db: DatabaseSync, table: string) => {
    const schema = upstream0016Schema();
    const create = schema.get(table)!.sql;
    const columns = new Set(
        (
            db.prepare("SELECT name FROM pragma_table_info(?)").all(table) as {
                name: string;
            }[]
        ).map((c) => c.name),
    );
    // Other tables name this one; set it aside without rewriting them
    db.exec("PRAGMA legacy_alter_table = ON");
    db.exec(`ALTER TABLE \`${table}\` RENAME TO \`${table}_rollback\``);
    db.exec("PRAGMA legacy_alter_table = OFF");
    db.exec(create);
    const kept = (
        db.prepare("SELECT name FROM pragma_table_info(?)").all(table) as {
            name: string;
        }[]
    )
        .map((c) => c.name)
        .filter((c) => columns.has(c))
        .map((c) => `\`${c}\``)
        .join(", ");
    db.exec(
        `INSERT INTO \`${table}\` (${kept}) SELECT ${kept} FROM \`${table}_rollback\``,
    );
    db.exec(`DROP TABLE \`${table}_rollback\``);
    for (const object of schema.values())
        if (object.type === "index" && object.tbl === table)
            db.exec(object.sql);
};

const PAGE_ERA_TABLES = [
    "marcher_pages",
    "midsets",
    "pathways",
    "shape_page_marchers",
    "shape_pages",
    "shapes",
];

const ROLLBACKS: Record<number, (db: DatabaseSync) => void> = {
    // The fork's schema, collapsed (ADR 0011): its tables, and the columns it adds to marchers
    // (homes, type), beats (tempo holds and changes) and measures (numbers, meters)
    17: (db) => {
        dropTriggers(db);
        dropTables(db, [
            "item_geometry",
            "items",
            "tempo_settings",
            "timeline_assignments",
            "timeline_change_log",
            "timeline_held_marks",
            "timeline_shape_recipe_marchers",
            "timeline_shape_recipes",
            "timeline_slot_destinations",
            "timeline_transitions",
            "timeline_shapes",
            "timelines",
            "view3d_cameras",
            "view3d_venue",
        ]);
        db.exec("DROP VIEW IF EXISTS timeline_commit_violations");
        db.exec("DROP VIEW IF EXISTS timeline_held_violations");
        for (const table of ["marchers", "beats", "measures"])
            restoreUpstreamTable(db, table);
    },
    // The page-era drop: the tables come back empty, as upstream's 0016 has them
    18: (db) => {
        const schema = upstream0016Schema();
        for (const table of PAGE_ERA_TABLES) db.exec(schema.get(table)!.sql);
        for (const object of schema.values())
            if (object.type === "index" && PAGE_ERA_TABLES.includes(object.tbl))
                db.exec(object.sql);
    },
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
