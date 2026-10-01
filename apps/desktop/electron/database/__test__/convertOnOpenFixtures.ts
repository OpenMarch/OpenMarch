/**
 * Shared fixtures for the convert-on-open tests (P9.3): real `.dots` files
 * built through the migrations, and readers for what the tests compare.
 */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { getOrm } from "../db";
import { DrizzleMigrationService } from "../services/DrizzleMigrationService";
import { applyFileVersionDecision, readUserVersion } from "../fileVersion";
import { BACKUP_NAME_SUFFIX } from "../backup";
import { CONVERT_ON_OPEN_ENV } from "../convertOnOpenGate";

export const migrationsFolder = path.resolve(__dirname, "../migrations");
export const GATE_ON = { [CONVERT_ON_OPEN_ENV]: "1" };

const showSql = fs.readFileSync(
    path.resolve(
        __dirname,
        "../../../src/test/mock-data/marchers-and-pages.sql",
    ),
    "utf-8",
);

export const sha256 = (filePath: string) =>
    createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

/** Runs `fn` on a fresh connection to `filePath`. */
export function withDb<T>(filePath: string, fn: (db: DatabaseSync) => T): T {
    const db = new DatabaseSync(filePath);
    try {
        return fn(db);
    } finally {
        db.close();
    }
}

const count = (db: DatabaseSync, table: string) =>
    Number(
        (
            db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {
                n: number;
            }
        ).n,
    );

export interface FileState {
    userVersion: number;
    timelines: number;
    transitions: number;
    assignments: number;
    timelineMode: unknown;
    settingsJson: string | undefined;
    history: unknown[];
    historyStats: unknown;
    changeLog: number;
    marcherPages: number;
    homes: unknown[];
    triggers: string[];
}

export function stateOf(filePath: string): FileState {
    return withDb(filePath, (db) => {
        const settings = db
            .prepare("SELECT json_data FROM workspace_settings")
            .get() as { json_data: string } | undefined;
        let timelineMode: unknown;
        try {
            timelineMode = settings
                ? (JSON.parse(settings.json_data) as Record<string, unknown>)
                      .timelineMode
                : undefined;
        } catch {
            timelineMode = undefined;
        }
        return {
            userVersion: readUserVersion(db),
            timelines: count(db, "timelines"),
            transitions: count(db, "timeline_transitions"),
            assignments: count(db, "timeline_assignments"),
            timelineMode,
            settingsJson: settings?.json_data,
            history: db
                .prepare(
                    "SELECT 'undo' AS t, sequence, history_group, sql FROM history_undo UNION ALL SELECT 'redo', sequence, history_group, sql FROM history_redo ORDER BY 1, 2",
                )
                .all(),
            historyStats: db.prepare("SELECT * FROM history_stats").get(),
            changeLog: count(db, "timeline_change_log"),
            marcherPages: count(db, "marcher_pages"),
            homes: db
                .prepare("SELECT id, home_x, home_y FROM marchers ORDER BY id")
                .all(),
            triggers: (
                db
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name",
                    )
                    .all() as { name: string }[]
            ).map((t) => t.name),
        };
    });
}

/** A migrated, initialized show file at version 7, as the app creates one. */
export async function createBlankShow(filePath: string) {
    const db = new DatabaseSync(filePath);
    try {
        applyFileVersionDecision(db, true);
        const orm = getOrm(db);
        await new DrizzleMigrationService(orm, db).applyPendingMigrations(
            migrationsFolder,
        );
        await DrizzleMigrationService.initializeDatabase(orm, db);
    } finally {
        db.close();
    }
}

/**
 * A version-7 show with 76 marchers on 6 pages, undo triggers (as the
 * renderer creates them on open), and some undo and redo history. With
 * `undoTriggers: false` it skips the triggers, and so loads no renderer module.
 */
export async function createPageShow(
    filePath: string,
    { undoTriggers = true }: { undoTriggers?: boolean } = {},
) {
    await createBlankShow(filePath);
    const db = new DatabaseSync(filePath);
    try {
        db.exec(showSql);
        if (undoTriggers) {
            // The renderer creates the undo triggers on every open.
            const { createAllUndoTriggers } =
                await import("@/db-functions/history");
            await createAllUndoTriggers(getOrm(db) as never);
        }
        db.exec(
            "INSERT INTO history_undo (history_group, sql) VALUES (1, 'SELECT 1')",
        );
        db.exec(
            "INSERT INTO history_redo (history_group, sql) VALUES (1, 'SELECT 2')",
        );
        db.exec(
            "UPDATE history_stats SET cur_undo_group = 3, cur_redo_group = 2",
        );
    } finally {
        db.close();
    }
}

/**
 * A version-7 show with `marchers` marchers on pages 0 to `pages` (8 beats a
 * page), every marcher on every page, and the undo triggers. For the
 * performance checks (P9.8): 400 by 100 is the size the phase file names.
 */
export async function createLargePageShow(
    filePath: string,
    { marchers, pages }: { marchers: number; pages: number },
) {
    await createBlankShow(filePath);
    const db = new DatabaseSync(filePath);
    try {
        db.exec("BEGIN");
        const beat = db.prepare(
            "INSERT INTO beats (duration, position, include_in_measure) VALUES (0.5, ?, 1) RETURNING id",
        );
        const page = db.prepare(
            "INSERT INTO pages (id, is_subset, start_beat) VALUES (?, 0, ?)",
        );
        for (let p = 1; p <= pages; p++) {
            let first = 0;
            for (let b = 0; b < 8; b++) {
                const row = beat.get((p - 1) * 8 + b + 1) as { id: number };
                if (b === 0) first = row.id;
            }
            page.run(p, first);
        }
        const marcher = db.prepare(
            "INSERT INTO marchers (id, section, drill_prefix, drill_order) VALUES (?, 'Trumpet', 'T', ?)",
        );
        const position = db.prepare(
            "INSERT INTO marcher_pages (marcher_id, page_id, x, y) VALUES (?, ?, ?, ?) ON CONFLICT (marcher_id, page_id) DO UPDATE SET x = excluded.x, y = excluded.y",
        );
        for (let m = 1; m <= marchers; m++) {
            marcher.run(m, m);
            for (let p = 0; p <= pages; p++)
                position.run(
                    m,
                    p,
                    (m * 7 + p * 13) % 1000,
                    (m * 3 + p * 5) % 500,
                );
        }
        db.exec("COMMIT");
        const { createAllUndoTriggers } =
            await import("@/db-functions/history");
        await createAllUndoTriggers(getOrm(db) as never);
    } finally {
        db.close();
    }
}

export const backupsIn = (dir: string) =>
    fs
        .readdirSync(dir)
        .filter((f) => f.includes(BACKUP_NAME_SUFFIX))
        .sort();
