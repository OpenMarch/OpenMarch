/**
 * Files migrated before a change-log trigger body changed keep the old body, because triggers use
 * IF NOT EXISTS and are rebuilt only when a migration runs. Opening such a file must bring the
 * change-log triggers up to this build's bodies.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getOrm } from "../db";
import { DrizzleMigrationService } from "../services/DrizzleMigrationService";
import { applyFileVersionDecision } from "../fileVersion";
import { recreateChangeLogTriggers } from "../migrations/triggers";

const migrationsFolder = path.resolve(__dirname, "../migrations");

describe("change-log trigger refresh on open", () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-trigger-refresh-"));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it("replaces a stale change-log trigger body even with no pending migration", async () => {
        const db = new DatabaseSync(path.join(dir, "show.dots"));
        try {
            applyFileVersionDecision(db, true);
            const orm = getOrm(db);
            await new DrizzleMigrationService(orm, db).applyPendingMigrations(
                migrationsFolder,
            );
            await DrizzleMigrationService.initializeDatabase(orm, db);

            const bodyOf = (name: string) =>
                (
                    db
                        .prepare(
                            `SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?`,
                        )
                        .get(name) as { sql: string } | undefined
                )?.sql;

            // Put the pre-fix 15-digit bodies back, as an older build left them
            db.exec(`DROP TRIGGER timeline_log_marchers_ins`);
            db.exec(`CREATE TRIGGER timeline_log_marchers_ins AFTER INSERT ON marchers
                BEGIN INSERT INTO timeline_change_log (tbl, row_id, "before", "after")
                VALUES ('marchers', NEW.id, NULL,
                        json_object('id', NEW.id, 'home', json_array(NEW.home_x, NEW.home_y))); END;`);
            db.exec(`DROP TRIGGER timeline_log_slot_destinations_upd`);
            expect(bodyOf("timeline_log_marchers_ins")).not.toContain("%!.17g");

            // No migration is pending; the open must still refresh the bodies
            await new DrizzleMigrationService(orm, db).applyPendingMigrations(
                migrationsFolder,
            );

            for (const name of [
                "timeline_log_marchers_ins",
                "timeline_log_marchers_upd",
                "timeline_log_marchers_del",
                "timeline_log_slot_destinations_ins",
                "timeline_log_slot_destinations_upd",
                "timeline_log_slot_destinations_del",
            ])
                expect(bodyOf(name), name).toContain("%!.17g");

            // And it behaves: a value needing 17 digits survives
            db.exec(
                `INSERT INTO marchers (id, section, drill_prefix, drill_order, home_x, home_y)
                 VALUES (900, 'B', 'B', 900, 0.30000000000000004, 1)`,
            );
            const row = db
                .prepare(
                    `SELECT json_extract("after", '$.home[0]') AS x FROM timeline_change_log
                     WHERE row_id = 900`,
                )
                .get() as { x: number };
            expect(Object.is(row.x, 0.1 + 0.2)).toBe(true);

            // All 15 change-log triggers exist, and an up-to-date file isn't rewritten on open
            const count = db
                .prepare(
                    `SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'timeline_log_%'`,
                )
                .get() as { n: number };
            expect(count.n).toBe(15);
            const schemaVersion = () =>
                (
                    db.prepare("PRAGMA schema_version").get() as {
                        schema_version: number;
                    }
                ).schema_version;
            // The refresh itself only rewrites stale triggers. (Opening a file still rewrites every
            // trigger today: the migration callback drops and recreates them on each open.)
            const before = schemaVersion();
            recreateChangeLogTriggers(db);
            expect(schemaVersion()).toBe(before);
        } finally {
            db.close();
        }
    });
});
