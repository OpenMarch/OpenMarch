// cspell:ignore Millis (drizzle's `folderMillis`)
/**
 * Files as fork builds saved them, for the repair-on-open tests (ADR 0011): upstream's migrations
 * 0000-0016 from this build's folder (byte-identical to upstream's), then the fork's frozen
 * 0017-`level` the way the fork's migration service ran them, with rows in the tables each level
 * has. A page-era file (version 7) took only the fork's migrations before the page-era drop
 * (old 0020); its conversion ran the rest.
 */
import { DatabaseSync } from "node:sqlite";
import { skipsExistingColumn } from "../../migrations/addColumnGuard";
import {
    DrizzleMigrationService,
    readTaggedMigrations,
} from "../../services/DrizzleMigrationService";
import { getOrm } from "../../db";
import { migrationsFolder } from "../../__test__/convertOnOpenFixtures";
import {
    LEGACY_FORK_MIGRATIONS,
    type LegacyForkMigration,
} from "../legacyForkMigrations";
import { UPSTREAM_LAST_MIGRATION_MS } from "../legacyForkRepair";

/** The fork migration with journal index `idx` (17-32). */
export const forkMigration = (idx: number): LegacyForkMigration =>
    LEGACY_FORK_MIGRATIONS[idx - 17]!;

const MIGRATIONS_TABLE_SQL =
    "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)";

const statementsOf = (sql: string) =>
    sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

const columnsOf = (db: DatabaseSync) => (table: string) =>
    (
        db.prepare("SELECT name FROM pragma_table_info(?)").all(table) as {
            name: string;
        }[]
    ).map((c) => c.name);

/** Runs one migration's statements and records it, as the migration service does. */
export function runAndRecord(
    db: DatabaseSync,
    statements: readonly string[],
    hash: string,
    when: number,
): void {
    for (const statement of statements) {
        db.exec("PRAGMA foreign_keys = OFF");
        if (skipsExistingColumn(statement, columnsOf(db))) continue;
        db.exec(statement);
    }
    db.exec("PRAGMA foreign_keys = ON");
    db.prepare(
        'INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES (?, ?)',
    ).run(hash, when);
}

/** Upstream's migrations 0000-0016 on an empty file at `userVersion`. */
export function upstreamFile(db: DatabaseSync, userVersion: 7 | 8): void {
    db.exec(`PRAGMA user_version = ${userVersion}`);
    db.exec(MIGRATIONS_TABLE_SQL);
    for (const m of readTaggedMigrations(migrationsFolder))
        if (m.folderMillis <= UPSTREAM_LAST_MIGRATION_MS)
            runAndRecord(db, m.sql, m.hash, m.folderMillis);
}

/** The fork's migrations 0017-`level` (skipping `skip`), as a fork build ran them. */
export function forkMigrations(
    db: DatabaseSync,
    level: number,
    { from = 17, skip = [] }: { from?: number; skip?: number[] } = {},
): void {
    for (let idx = from; idx <= level; idx++) {
        if (skip.includes(idx)) continue;
        const m = forkMigration(idx);
        runAndRecord(db, statementsOf(m.sql), m.hash, m.when);
    }
}

/** The upstream rows every fork file has: beats, a measure, pages, marchers, a tag. */
function upstreamRows(db: DatabaseSync): void {
    db.exec(`
        INSERT INTO beats (id, duration, position, include_in_measure) VALUES
            (1, 0.5, 1, 1), (2, 0.5, 2, 1), (3, 0.5, 3, 1), (4, 0.5, 4, 1),
            (5, 0.5, 5, 1), (6, 0.5, 6, 1), (7, 0.5, 7, 1), (8, 0.5, 8, 1);
        INSERT INTO measures (id, start_beat, rehearsal_mark) VALUES (1, 1, 'A');
        INSERT INTO pages (id, start_beat, is_subset) VALUES (1, 5, 0);
        INSERT INTO marchers (id, name, section, drill_prefix, drill_order) VALUES
            (1, 'Ann', 'Trumpet', 'T', 1), (2, 'Bo', 'Trumpet', 'T', 2);
        INSERT INTO tags (id, name) VALUES (1, 'Front');
        INSERT INTO marcher_tags (id, marcher_id, tag_id) VALUES (1, 1, 1);
        INSERT INTO field_properties (id, json_data) VALUES (1, '{"name":"field"}');
        INSERT INTO workspace_settings (id, json_data) VALUES (1, '{"defaultTempo":120}');
    `);
}

/** Rows in the tables of the fork's migrations up to `level`. */
function forkRows(db: DatabaseSync, level: number): void {
    // 0017: a move of both marchers to two destinations, their homes
    db.exec(`
        UPDATE marchers SET home_x = 10, home_y = 20 WHERE id = 1;
        INSERT INTO timelines (id, name, start_beat, end_beat) VALUES (1, 'Opener', 0, 8);
        INSERT INTO timeline_shapes (id, name, kind, geometry) VALUES (1, 'Arc', 'line', '{"points":[]}');
        INSERT INTO timeline_transitions (id, timeline_id, dest_shape_id, slot_count, start_beat, end_beat)
            VALUES (1, 1, NULL, 2, 0, 8);
        INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (1, 0, 100, 50), (1, 1, 120, 50);
        INSERT INTO timeline_assignments (id, marcher_id, transition_id, slot_index, start_beat, end_beat)
            VALUES (1, 1, 1, 0, 0, 8), (2, 2, 1, 1, 0, 8);
    `);
    // 0018: a kept spot (removed in 0029)
    if (level >= 18 && level < 29)
        db.exec(
            "INSERT INTO timeline_kept_assignments (assignment_id) VALUES (1)",
        );
    if (level >= 19)
        db.exec(
            `INSERT INTO view3d_venue (id, json_data) VALUES (1, '{"venue":"stadium"}')`,
        );
    if (level >= 21)
        db.exec(`
            INSERT INTO library_blobs (hash, data) VALUES ('${"b".repeat(64)}', x'0102');
            INSERT INTO library_items (item_id, version_hash, kind, name, parts, metadata)
                VALUES ('11111111-1111-4111-8111-111111111111', '${"a".repeat(64)}', 'model', 'Riser', '{}', '{}');
        `);
    if (level >= 22)
        db.exec(`
            INSERT INTO cues (id, channel, kind, target_kind, beat_id, value) VALUES (1, 'feet', 'state', 'band', 2, 'builtin:mark_time');
            INSERT INTO page_performer_settings (page_id, dot_mode) VALUES (1, 'body');
        `);
    if (level >= 23)
        db.exec(
            `INSERT INTO view3d_cameras (id, json_data) VALUES (1, '{"cameras":[]}')`,
        );
    if (level >= 24)
        db.exec(`
            INSERT INTO marchers (id, name, section, drill_prefix, drill_order, type) VALUES (3, 'Riser', 'Prop', 'PROP', 1, 'item');
            INSERT INTO items (id, marcher_id, kind, surface_type, library_item_id, library_version_hash)
                VALUES (1, 3, 'prop', 'platform', '11111111-1111-4111-8111-111111111111', '${"a".repeat(64)}');
            INSERT INTO item_geometry (id, item_id, beat_id, outline_type, width, depth, height)
                VALUES (1, 1, 1, 'rectangle', 2.4, 1.2, 0.5), (2, 1, 4, 'circle', 1, 1, 0);
        `);
    if (level >= 25)
        db.exec(
            "INSERT INTO item_placements (id, item_id, beat_id, state) VALUES (1, 1, 2, 'placed')",
        );
    if (level >= 26)
        db.exec(
            "INSERT INTO item_artwork_slots (id, item_id, beat_id, slot) VALUES (1, 1, 2, 'front')",
        );
    if (level >= 27)
        db.exec(`
            INSERT INTO timeline_shape_recipes (id, timeline_id, kind, kind_version, params, order_mode)
                VALUES (1, 1, 'line', 1, '{"spacing":2}', 'nearest');
            INSERT INTO timeline_shape_recipe_marchers (recipe_id, marcher_id, slot, x, y)
                VALUES (1, 1, 0, 100, 50), (1, 2, 1, 120, 50);
        `);
    if (level >= 28)
        db.exec(
            "INSERT INTO saved_shapes (id, name, kind, kind_version, intervals) VALUES ('s1', 'Wedge', 'line', 1, '[1,2]')",
        );
    if (level >= 30)
        db.exec(
            "INSERT INTO timeline_held_marks (id, marcher_id, start_beat, end_beat) VALUES (1, 1, 8, 12)",
        );
    if (level >= 31)
        db.exec("UPDATE items SET color = 'rgba(200, 10, 10, 1)' WHERE id = 1");
    if (level >= 32)
        db.exec(`
            UPDATE beats SET tempo_hold = 1 WHERE id = 3;
            UPDATE beats SET tempo_change = 1 WHERE id = 5;
            UPDATE measures SET number_override = 12, meter = '3/4', grouping = '[2,1]' WHERE id = 1;
            INSERT INTO tempo_settings (id, audio_offset_seconds) VALUES (0, 0.25);
        `);
    // Undo history that names a parked table and the Library columns
    db.exec(`
        INSERT INTO history_undo (history_group, sql) VALUES (1, 'DELETE FROM "cues" WHERE rowid=1');
        INSERT INTO history_redo (history_group, sql) VALUES (1, 'UPDATE "items" SET "library_item_id"=NULL');
        UPDATE history_stats SET cur_undo_group = 2, cur_redo_group = 2;
    `);
}

/**
 * A timeline file (version 8) a fork build saved with migrations 0017-`level`, with rows in
 * every table it has.
 */
export function createForkTimelineFile(filePath: string, level: number) {
    const db = new DatabaseSync(filePath);
    try {
        upstreamFile(db, 8);
        forkMigrations(db, level);
        upstreamRows(db);
        forkRows(db, level);
    } finally {
        db.close();
    }
}

/**
 * A page-era file (version 7) a fork build opened, which ran the fork's migrations before the
 * page-era drop (0017-`level`, at most 0019), with marchers on pages 0 and 1.
 */
export function createForkPageEraFile(filePath: string, level: 17 | 18 | 19) {
    const db = new DatabaseSync(filePath);
    try {
        upstreamFile(db, 7);
        forkMigrations(db, level);
        upstreamRows(db);
        db.exec(`
            INSERT INTO marcher_pages (marcher_id, page_id, x, y) VALUES
                (1, 0, 0, 0), (2, 0, 10, 0), (1, 1, 40, 8), (2, 1, 50, 8);
        `);
    } finally {
        db.close();
    }
}

/** Every row of `table`, by rowid, or null when the table is missing. */
export function rowsOf(
    db: DatabaseSync,
    table: string,
): Record<string, unknown>[] | null {
    const exists = db
        .prepare(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get(table);
    if (!exists) return null;
    return db
        .prepare(`SELECT * FROM "${table}" ORDER BY rowid`)
        .all() as Record<string, unknown>[];
}

/** The file's tables and indexes, whitespace collapsed, by type and name. */
export function normalizedSchema(db: DatabaseSync): string[] {
    return (
        db
            .prepare(
                "SELECT type, name, sql FROM sqlite_master WHERE type IN ('table', 'index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name",
            )
            .all() as { type: string; name: string; sql: string }[]
    ).map((r) => `${r.type} ${r.name}: ${r.sql.replace(/\s+/g, " ")}`);
}

/** Opens `filePath` and runs its pending migrations as the app's open does, then closes it. */
export async function migrateFile(filePath: string): Promise<void> {
    const db = new DatabaseSync(filePath);
    try {
        await new DrizzleMigrationService(
            getOrm(db),
            db,
        ).applyPendingMigrations(migrationsFolder);
    } finally {
        db.close();
    }
}
