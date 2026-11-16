// @vitest-environment node
// cspell:ignore Millis
/**
 * Migration 0027 lets a follow-the-leader transition have a trail route in place of a
 * destination shape, pathways step 4 (spec I-T5′, Appendix K, QA-MIG-T1, QA-FV-T1). It rebuilds
 * `timeline_transitions` to change one CHECK: every row keeps its id and values, no assignment,
 * destination or lane is lost, and the file's version is left alone.
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
    readUserVersion,
    TRAIL_MODEL_USER_VERSION,
} from "../../fileVersion";
import {
    createNewTimelineShow,
    migrationsFolder,
    withDb,
} from "../../__test__/convertOnOpenFixtures";
import { migrationAt } from "../../__test__/migrationRollback";

const TRAIL_MIGRATION = migrationAt(27);

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

const NEW_CHECK =
    "CHECK(dest_shape_id IS NOT NULL OR route_id IS NOT NULL OR path_style";
const OLD_CHECK = "CHECK(dest_shape_id IS NOT NULL OR path_style";

const tableSql = (db: DatabaseSync) =>
    (
        db
            .prepare(
                "SELECT sql FROM sqlite_schema WHERE name = 'timeline_transitions'",
            )
            .get() as { sql: string }
    ).sql;

const rowsOf = (db: DatabaseSync, table: string) =>
    db
        .prepare(`SELECT * FROM ${table} ORDER BY 1, 2`)
        .all()
        .map((r) => ({ ...r }));

const TABLES = [
    "timeline_transitions",
    "timeline_assignments",
    "timeline_slot_destinations",
    "timeline_lanes",
    "timeline_routes",
];

/**
 * A new show put back to before 0027: the older CHECK on `timeline_transitions`, a laned move
 * with an Adjust, version 12
 */
async function fileBefore0027(file: string) {
    await createNewTimelineShow(file);
    withDb(file, (db) => {
        const triggers = db
            .prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger'")
            .all() as { name: string }[];
        for (const { name } of triggers) db.exec(`DROP TRIGGER \`${name}\``);
        const views = db
            .prepare("SELECT name FROM sqlite_schema WHERE type = 'view'")
            .all() as { name: string }[];
        for (const { name } of views) db.exec(`DROP VIEW \`${name}\``);
        const sql = tableSql(db);
        expect(sql).toContain(NEW_CHECK);
        db.exec("PRAGMA foreign_keys = OFF");
        db.exec("PRAGMA legacy_alter_table = ON");
        db.exec(
            "ALTER TABLE timeline_transitions RENAME TO timeline_transitions_rollback",
        );
        db.exec("PRAGMA legacy_alter_table = OFF");
        db.exec(
            sql
                .replace(NEW_CHECK, OLD_CHECK)
                .replace(
                    /CREATE TABLE [`"]timeline_transitions[`"]/,
                    "CREATE TABLE `timeline_transitions`",
                ),
        );
        db.exec("DROP TABLE timeline_transitions_rollback");
        db.exec(
            "CREATE INDEX `timeline_idx_tr_shape` ON `timeline_transitions` (`dest_shape_id`)",
        );
        db.exec(
            "CREATE INDEX `timeline_idx_tr_route` ON `timeline_transitions` (`route_id`)",
        );
        db.exec(
            "CREATE INDEX `timeline_idx_tr_timeline` ON `timeline_transitions` (`timeline_id`)",
        );
        db.prepare("DELETE FROM __drizzle_migrations WHERE created_at = ?").run(
            TRAIL_MIGRATION.when,
        );
        db.exec(`
            INSERT INTO marchers (id, section, drill_prefix, drill_order, home_x, home_y) VALUES (1, 'Brass', 'B', 1, 0, 0), (2, 'Brass', 'B', 2, 4, 0);
            INSERT INTO timelines (id, start_beat, end_beat) VALUES (7, 0, 8);
            INSERT INTO timeline_routes (id, geometry) VALUES (3, '${ROUTE}');
            INSERT INTO timeline_transitions (id, timeline_id, path_style, slot_count, start_beat, end_beat) VALUES (5, 7, 'direct', 2, 0, 8);
            INSERT INTO timeline_transitions (id, timeline_id, path_style, path_params, slot_count, start_beat, end_beat) VALUES (9, 7, 'arc', '{"bulge":0.25}', 1, 0, 8);
            INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (5, 0, 40, 0), (5, 1, 44, 0), (9, 0, 1, 1);
            INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat) VALUES (1, 5, 0, 0, 8), (2, 5, 1, 0, 8);
            INSERT INTO timeline_lanes (transition_id, slot_index, route_id, offset_x, offset_y, adjust) VALUES (5, 0, 3, -2, 0, NULL), (5, 1, 3, 2, 0, '{"v":1,"keys":[]}');
            PRAGMA user_version = ${ADJUST_MODEL_USER_VERSION};
        `);
    });
}

describe(`Migration ${TRAIL_MIGRATION.tag}`, () => {
    let tempDir: string;
    let file: string;
    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0027-"));
        file = path.join(tempDir, "show.dots");
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        vi.spyOn(console, "info").mockImplementation(() => {});
    });
    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("rebuilds only timeline_transitions and copies every column", () => {
        const { sql } = readTaggedMigrations(migrationsFolder).find(
            (m) => m.folderMillis === TRAIL_MIGRATION.when,
        )!;
        const text = sql.join("\n");
        expect(text.match(/DROP TABLE `(\w+)`/g)).toEqual([
            "DROP TABLE `timeline_transitions`",
        ]);
        expect(text).toContain(
            'SELECT "id", "timeline_id", "dest_shape_id", "path_style", "path_params", "route_id", "order_mode", "slot_count", "start_beat", "end_beat" FROM `timeline_transitions`',
        );
        expect(text).toContain(NEW_CHECK);
    });

    it("QA-MIG-T1: a file with moves, lanes and an Adjust keeps every row and id, and its version", async () => {
        await fileBefore0027(file);
        const before = withDb(file, (db) => {
            expect(tableSql(db)).toContain(OLD_CHECK);
            return TABLES.map((t) => rowsOf(db, t));
        });
        await open(file);
        withDb(file, (db) => {
            expect(tableSql(db)).toContain(NEW_CHECK);
            expect(TABLES.map((t) => rowsOf(db, t))).toEqual(before);
            expect(before[0]).toHaveLength(2);
            expect(before[1]).toHaveLength(2);
            expect(readUserVersion(db)).toBe(ADJUST_MODEL_USER_VERSION);
            expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
            expect(
                db.prepare("SELECT * FROM timeline_route_violations").all(),
            ).toEqual([]);
            // The change-log trigger is back on the rebuilt table
            db.exec(
                "UPDATE timeline_transitions SET path_params = '{\"bulge\":0.1}' WHERE id = 9",
            );
            const log = db
                .prepare(
                    `SELECT "after" FROM timeline_change_log WHERE tbl = 'transitions' ORDER BY rowid DESC LIMIT 1`,
                )
                .get() as { after: string };
            expect(JSON.parse(log.after).params).toEqual({ bulge: 0.1 });
        });
        // Opening again is a no-op
        await open(file);
        withDb(file, (db) =>
            expect(TABLES.map((t) => rowsOf(db, t))[1]).toEqual(before[1]),
        );
    });

    it("I-T5′: follow the leader needs a shape or a trail route", async () => {
        await createNewTimelineShow(file);
        withDb(file, (db) => {
            db.exec(`
                INSERT INTO timelines (id, start_beat, end_beat) VALUES (7, 0, 8);
                INSERT INTO timeline_routes (id, geometry) VALUES (3, '${ROUTE}');
            `);
            expect(() =>
                db.exec(
                    "INSERT INTO timeline_transitions (id, timeline_id, path_style, path_params, slot_count, start_beat, end_beat) VALUES (5, 7, 'follow_the_leader', '{\"waypoints\":[]}', 1, 0, 8)",
                ),
            ).toThrow(/CHECK/);
            db.exec(
                "INSERT INTO timeline_transitions (id, timeline_id, path_style, path_params, route_id, order_mode, slot_count, start_beat, end_beat) VALUES (5, 7, 'follow_the_leader', '{\"waypoints\":[]}', 3, 'slot', 1, 0, 8)",
            );
            // The trail can't be taken away while the move still follows the leader
            expect(() =>
                db.exec(
                    "UPDATE timeline_transitions SET route_id = NULL WHERE id = 5",
                ),
            ).toThrow(/CHECK/);
        });
    });

    it("QA-FV-T1: 13 is past what the Adjust build opened, so it refuses; this build opens it", () => {
        expect(TRAIL_MODEL_USER_VERSION).toBe(13);
        expect(TRAIL_MODEL_USER_VERSION).toBeGreaterThan(
            ADJUST_MODEL_USER_VERSION,
        );
        expect(decideFileVersion(13, false).action).toBe("accept");
        // 14 is arc legs (step 10a); what's past this build is refused
        expect(decideFileVersion(15, false).action).toBe("refuse-too-new");
    });
});
