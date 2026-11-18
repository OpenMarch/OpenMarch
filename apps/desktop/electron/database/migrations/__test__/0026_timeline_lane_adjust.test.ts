// @vitest-environment node
// cspell:ignore Millis
/**
 * Migration 0026 adds `timeline_lanes.adjust`, pathways step 3b (ADR 0017 §9, spec J.1, QA-MIG-L1,
 * QA-FV-L1): a nullable column in place, no table rebuilt; a file with lanes keeps them and stays
 * at 11 until its first Adjust; a build that doesn't know Adjust refuses a version-12 file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getOrm } from "../../db";
import {
    DrizzleMigrationService,
    readTaggedMigrations,
} from "../../services/DrizzleMigrationService";
import {
    ADJUST_MODEL_USER_VERSION,
    decideFileVersion,
    LANE_MODEL_USER_VERSION,
    readUserVersion,
} from "../../fileVersion";
import {
    createNewTimelineShow,
    migrationsFolder,
    withDb,
} from "../../__test__/convertOnOpenFixtures";
import { migrationAt } from "../../__test__/migrationRollback";

const ADJUST_MIGRATION = migrationAt(26);

const open = async (file: string) => {
    const db = new DatabaseSync(file);
    try {
        await new DrizzleMigrationService(
            getOrm(db),
            db,
        ).applyPendingMigrations(migrationsFolder);
    } finally {
        db.close();
    }
};

const ROUTE = JSON.stringify({
    v: 1,
    from: [0, 0],
    to: [40, 0],
    points: [{ id: "p", at: [20, 15] }],
});

/** A new show put back to before 0026: a group lane, version 11, the column gone */
async function fileBefore0026(file: string) {
    await createNewTimelineShow(file);
    withDb(file, (db) => {
        db.exec(`
            DROP VIEW IF EXISTS timeline_route_violations;
            DROP TRIGGER IF EXISTS timeline_log_lanes_ins;
            DROP TRIGGER IF EXISTS timeline_log_lanes_upd;
            DROP TRIGGER IF EXISTS timeline_log_lanes_del;
        `);
        db.exec("ALTER TABLE timeline_lanes DROP COLUMN adjust");
        // 0026 and every later migration: drizzle applies only what is newer than the last one
        // recorded. 0027 (trails) rebuilds `timeline_transitions` and is safe to run again
        db.prepare(
            "DELETE FROM __drizzle_migrations WHERE created_at >= ?",
        ).run(ADJUST_MIGRATION.when);
        db.exec(`
            PRAGMA foreign_keys = OFF;
            INSERT INTO marchers (id, section, drill_prefix, drill_order, home_x, home_y) VALUES (1, 'Brass', 'B', 1, 0, 0);
            INSERT INTO timelines (id, start_beat, end_beat) VALUES (1, 0, 8);
            INSERT INTO timeline_routes (id, geometry) VALUES (1, '${ROUTE}');
            INSERT INTO timeline_transitions (id, timeline_id, path_style, slot_count, start_beat, end_beat) VALUES (1, 1, 'direct', 1, 0, 8);
            INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (1, 0, 40, 0);
            INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat) VALUES (1, 1, 0, 0, 8);
            INSERT INTO timeline_lanes (transition_id, slot_index, route_id, offset_x, offset_y) VALUES (1, 0, 1, 1, 2);
            PRAGMA user_version = 11;
        `);
    });
}

describe(`Migration ${ADJUST_MIGRATION.tag}`, () => {
    let tempDir: string;
    let file: string;
    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0026-"));
        file = path.join(tempDir, "show.dots");
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        vi.spyOn(console, "info").mockImplementation(() => {});
    });
    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("adds the column in place: no rebuild, one statement, a CHECK on valid JSON", () => {
        const { sql } = readTaggedMigrations(migrationsFolder).find(
            (m) => m.folderMillis === ADJUST_MIGRATION.when,
        )!;
        expect(sql.join("\n")).not.toMatch(/__new_|DROP TABLE/);
        expect(sql).toHaveLength(1);
    });

    it("a new file has the column, stays a timeline file, and its view reads it", async () => {
        await createNewTimelineShow(file);
        withDb(file, (db) => {
            expect(readUserVersion(db)).toBe(8);
            expect(
                db.prepare("SELECT * FROM timeline_route_violations").all(),
            ).toEqual([]);
        });
    });

    it("a file with lanes keeps every lane, adjust NULL, and stays at 11", async () => {
        await fileBefore0026(file);
        await open(file);
        withDb(file, (db) => {
            expect(
                db
                    .prepare(
                        "SELECT transition_id, slot_index, route_id, offset_x, offset_y, adjust FROM timeline_lanes",
                    )
                    .all()
                    .map((r) => ({ ...r })),
            ).toEqual([
                {
                    transition_id: 1,
                    slot_index: 0,
                    route_id: 1,
                    offset_x: 1,
                    offset_y: 2,
                    adjust: null,
                },
            ]);
            expect(readUserVersion(db)).toBe(LANE_MODEL_USER_VERSION);
            // The change-log trigger was rebuilt with the column (J.1)
            db.exec(
                `UPDATE timeline_lanes SET adjust = '{"v":1,"keys":[]}' WHERE id = 1`,
            );
            const log = db
                .prepare(
                    `SELECT "after" FROM timeline_change_log WHERE tbl = 'lanes' ORDER BY rowid DESC LIMIT 1`,
                )
                .get() as { after: string };
            expect(JSON.parse(log.after).adjust).toEqual({ v: 1, keys: [] });
            expect(() =>
                db.exec(
                    `UPDATE timeline_lanes SET adjust = 'not json' WHERE id = 1`,
                ),
            ).toThrow(/CHECK/);
        });
        // Opening again is a no-op: the column isn't added twice
        await open(file);
    });

    it("QA-FV-L1: 12 is past what the lane build opened, so it refuses; this build opens it", () => {
        expect(ADJUST_MODEL_USER_VERSION).toBe(12);
        expect(ADJUST_MODEL_USER_VERSION).toBeGreaterThan(
            LANE_MODEL_USER_VERSION,
        );
        expect(decideFileVersion(12, false).action).toBe("accept");
        expect(decideFileVersion(15, false).action).toBe("refuse-too-new");
    });
});
