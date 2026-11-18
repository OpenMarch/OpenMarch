// @vitest-environment node
// cspell:ignore Millis
/**
 * Migration 0028 adds `timeline_route_sources`, pathways step 3c (spec v0.10 J.1, K6): the link a
 * Detached copy keeps to its group path. A new table only: a file from before it opens with every
 * other row and its version unchanged (no file version bump, see the migration's header), and the
 * links cascade when a route goes, so a build that doesn't know them leaves none dangling.
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
import { LANE_MODEL_USER_VERSION, readUserVersion } from "../../fileVersion";
import {
    createNewTimelineShow,
    migrationsFolder,
    withDb,
} from "../../__test__/convertOnOpenFixtures";
import { migrationAt } from "../../__test__/migrationRollback";

const SOURCES_MIGRATION = migrationAt(28);

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

/** Every row of the timeline tables, for "nothing else changed" */
const timelineRows = (db: DatabaseSync) =>
    Object.fromEntries(
        [
            "timelines",
            "timeline_transitions",
            "timeline_assignments",
            "timeline_slot_destinations",
            "timeline_routes",
            "timeline_lanes",
        ].map((t) => [
            t,
            db
                .prepare(`SELECT * FROM ${t} ORDER BY id`)
                .all()
                .map((r) => ({ ...r })),
        ]),
    );

/** A new show put back to before 0028: two group lanes on one route, version 11, no table */
async function fileBefore0028(file: string) {
    await createNewTimelineShow(file);
    withDb(file, (db) => {
        db.exec("DROP TABLE timeline_route_sources");
        db.prepare(
            "DELETE FROM __drizzle_migrations WHERE created_at >= ?",
        ).run(SOURCES_MIGRATION.when);
        db.exec(`
            PRAGMA foreign_keys = OFF;
            INSERT INTO marchers (id, section, drill_prefix, drill_order, home_x, home_y) VALUES (1, 'Brass', 'B', 1, 0, 0), (2, 'Brass', 'B', 2, 0, 4);
            INSERT INTO timelines (id, start_beat, end_beat) VALUES (1, 0, 8);
            INSERT INTO timeline_routes (id, geometry) VALUES (1, '${ROUTE}');
            INSERT INTO timeline_transitions (id, timeline_id, path_style, slot_count, start_beat, end_beat) VALUES (1, 1, 'direct', 2, 0, 8);
            INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES (1, 0, 40, 0), (1, 1, 40, 4);
            INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat) VALUES (1, 1, 0, 0, 8), (2, 1, 1, 0, 8);
            INSERT INTO timeline_lanes (transition_id, slot_index, route_id, offset_x, offset_y) VALUES (1, 0, 1, 0, -2), (1, 1, 1, 0, 2);
            PRAGMA user_version = 11;
        `);
    });
}

describe(`Migration ${SOURCES_MIGRATION.tag}`, () => {
    let tempDir: string;
    let file: string;
    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0028-"));
        file = path.join(tempDir, "show.dots");
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        vi.spyOn(console, "info").mockImplementation(() => {});
    });
    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("creates one table and its indexes, rebuilding nothing", () => {
        const { sql } = readTaggedMigrations(migrationsFolder).find(
            (m) => m.folderMillis === SOURCES_MIGRATION.when,
        )!;
        const statements = sql
            .join("\n")
            .split("\n")
            .filter((line) => !line.startsWith("--"))
            .join("\n");
        expect(statements).not.toMatch(
            /__new_|DROP TABLE|INSERT INTO|UPDATE `/,
        );
        expect(sql).toHaveLength(3);
    });

    it("a file from before it keeps every row and its version; opening again is a no-op", async () => {
        await fileBefore0028(file);
        const before = withDb(file, timelineRows);
        await open(file);
        withDb(file, (db) => {
            expect(timelineRows(db)).toEqual(before);
            expect(readUserVersion(db)).toBe(LANE_MODEL_USER_VERSION);
            expect(
                db.prepare("SELECT * FROM timeline_route_sources").all(),
            ).toEqual([]);
        });
        await open(file);
    });

    it("checks its kind and data, and cascades when either route goes", async () => {
        await fileBefore0028(file);
        await open(file);
        withDb(file, (db) => {
            db.exec("PRAGMA foreign_keys = ON");
            db.exec(
                `INSERT INTO timeline_routes (id, geometry) VALUES (2, '${ROUTE}')`,
            );
            expect(() =>
                db.exec(
                    "INSERT INTO timeline_route_sources (route_id, kind, source_route_id) VALUES (2, 'cloned', 1)",
                ),
            ).toThrow(/CHECK/);
            expect(() =>
                db.exec(
                    "INSERT INTO timeline_route_sources (route_id, kind, data) VALUES (2, 'recipe', 'not json')",
                ),
            ).toThrow(/CHECK/);
            db.exec(
                "INSERT INTO timeline_route_sources (route_id, kind, source_route_id) VALUES (2, 'detached_from', 1)",
            );
            // A build that doesn't know the table deletes the copy: its link goes with it
            db.exec("DELETE FROM timeline_routes WHERE id = 2");
            expect(
                db.prepare("SELECT * FROM timeline_route_sources").all(),
            ).toEqual([]);
            // ...or the group path (its lanes first, RESTRICT): links naming it go too
            db.exec(
                `INSERT INTO timeline_routes (id, geometry) VALUES (2, '${ROUTE}')`,
            );
            db.exec(
                "INSERT INTO timeline_route_sources (route_id, kind, source_route_id) VALUES (2, 'detached_from', 1)",
            );
            db.exec("DELETE FROM timeline_lanes");
            db.exec("DELETE FROM timeline_routes WHERE id = 1");
            expect(
                db.prepare("SELECT * FROM timeline_route_sources").all(),
            ).toEqual([]);
        });
    });
});
