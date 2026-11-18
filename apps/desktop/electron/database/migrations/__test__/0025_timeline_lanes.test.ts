// @vitest-environment node
/**
 * Migration 0025 adds lanes, pathways step 24 (ADR 0017, spec v0.10 J.1). QA-MIG-L2: a file a
 * step-15 lab build wrote (file version 10, `route` transitions, one per member) opens with each
 * route transition moved to a lane on its slot 0 and made `direct`, plays exactly as before, is
 * written as version 11 (QA-FV-L1: a step-15 build refuses it then) and its old undo steps,
 * which name the old storage, are cleared. QA-MIG-L1: a v0.1.7 release file opens with no lanes
 * and its version and history untouched by 0025.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    groupMemberWalk,
    groupPoint,
    groupSchedule,
    routePath,
    routePoint,
    type XY,
} from "@openmarch/core";
import { getOrm } from "../../db";
import { DrizzleMigrationService } from "../../services/DrizzleMigrationService";
import { LANE_MODEL_USER_VERSION, readUserVersion } from "../../fileVersion";
import {
    createNewTimelineShow,
    migrationsFolder,
    withDb,
} from "../../__test__/convertOnOpenFixtures";
import { migrationAt } from "../../__test__/migrationRollback";

const LANES_MIGRATION = migrationAt(25);

const ROUTE_OWN = {
    v: 1,
    from: [0, 0],
    to: [40, 0],
    points: [{ id: "a", at: [20, 15], tension: 1 }],
};
const ROUTE_GROUP = {
    v: 1,
    from: [5, 50],
    to: [45, 60],
    points: [
        { id: "p", at: [20, 80] },
        { id: "q", at: [35, 70], tension: 1.2 },
    ],
};

/**
 * A new show, then rows as a step-15 build stored them (with an undo trigger, as a real file
 * has): marcher 1 on an own route, marchers 2
 * and 3 on one group route, each alone in a one-slot `route` transition; 0025 unrecorded and its
 * table gone, version 10, and one stored undo step.
 */
async function stepFifteenFile(file: string) {
    await createNewTimelineShow(file);
    withDb(file, (db) => {
        db.exec("PRAGMA foreign_keys = OFF");
        db.exec("DROP TABLE timeline_lanes");
        // 0026 goes with it: drizzle runs only migrations newer than a file's newest
        db.prepare(
            "DELETE FROM __drizzle_migrations WHERE created_at >= ?",
        ).run(LANES_MIGRATION.when);
        // the commit and change-log triggers go with the table drop; the rows below are raw
        db.exec(`
            DELETE FROM timeline_change_log;
            INSERT INTO marchers (id, section, drill_prefix, drill_order, home_x, home_y) VALUES
              (1, 'Brass', 'B', 1, 0, 0), (2, 'Brass', 'B', 2, 4, 50), (3, 'Brass', 'B', 3, 6, 50);
            INSERT INTO timelines (id, start_beat, end_beat) VALUES (1, 0, 8);
            INSERT INTO timeline_routes (id, geometry) VALUES
              (1, '${JSON.stringify(ROUTE_OWN)}'), (2, '${JSON.stringify(ROUTE_GROUP)}');
            INSERT INTO timeline_transitions (id, timeline_id, path_style, path_params, route_id, slot_count, start_beat, end_beat) VALUES
              (1, 1, 'route', NULL, 1, 1, 0, 8),
              (2, 1, 'route', '{"offset":[-1,0]}', 2, 1, 0, 8),
              (3, 1, 'route', '{"offset":[1,0]}', 2, 1, 0, 8);
            INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) VALUES
              (1, 0, 40, 0), (2, 0, 44, 60), (3, 0, 46, 60);
            INSERT INTO timeline_assignments (marcher_id, transition_id, slot_index, start_beat, end_beat) VALUES
              (1, 1, 0, 0, 8), (2, 2, 0, 0, 8), (3, 3, 0, 0, 8);
            INSERT INTO history_undo (history_group, sql) VALUES (1, 'DELETE FROM timeline_routes WHERE rowid=2');
            -- A real file keeps the renderer's undo triggers across migrations: one that logs an
            -- update, so 0025's own UPDATE would leave an undo step back to route transitions
            -- if the history were cleared before it (review of #734)
            CREATE TRIGGER IF NOT EXISTS timeline_transitions_ut AFTER UPDATE ON timeline_transitions
            BEGIN
              INSERT INTO history_undo (history_group, sql) VALUES (2, 'UPDATE timeline_transitions SET path_style=''route'' WHERE rowid=' || OLD.id);
            END;
            PRAGMA user_version = 10;
        `);
    });
}

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

/** Step 15's R-14, written out: where each marcher is at beat `b` (from the stored rows). */
const stepFifteen = (m: number, b: number): XY => {
    const p = Math.min(1, Math.max(0, b / 8));
    if (m === 1)
        return routePoint(
            routePath(
                [0, 0],
                ROUTE_OWN.points as never,
                [40, 0],
                ROUTE_OWN as never,
            ),
            p,
        );
    const [A, B, o]: [XY, XY, XY] =
        m === 2
            ? [
                  [4, 50],
                  [44, 60],
                  [-1, 0],
              ]
            : [
                  [6, 50],
                  [46, 60],
                  [1, 0],
              ];
    return groupPoint(
        groupMemberWalk(groupSchedule(ROUTE_GROUP as never), A, B, o),
        p,
    );
};

describe(`Migration ${LANES_MIGRATION.tag} (QA-MIG-L1, QA-MIG-L2, QA-FV-L1)`, () => {
    let tempDir: string;
    let file: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0025-"));
        file = path.join(tempDir, "show.dots");
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        vi.spyOn(console, "info").mockImplementation(() => {});
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("a new file has the lanes table, empty, and stays a timeline file (8)", async () => {
        await createNewTimelineShow(file);
        withDb(file, (db) => {
            expect(
                db.prepare("SELECT count(*) AS n FROM timeline_lanes").get(),
            ).toEqual({ n: 0 });
            expect(readUserVersion(db)).toBe(8);
        });
    });

    it("moves a step-15 file's route transitions to lanes; it plays the same, bit for bit, and is written as 11", async () => {
        await stepFifteenFile(file);
        await open(file);
        const { readTimelineTables } = await import("@/timeline/timelineRows");
        const { createResolver } = await import("@openmarch/core");
        await (async () => {
            const db = new DatabaseSync(file);
            try {
                expect(
                    db
                        .prepare(
                            "SELECT transition_id, slot_index, route_id, offset_x, offset_y FROM timeline_lanes ORDER BY id",
                        )
                        .all()
                        .map((r) => ({ ...r })),
                ).toEqual([
                    {
                        transition_id: 1,
                        slot_index: 0,
                        route_id: 1,
                        offset_x: null,
                        offset_y: null,
                    },
                    {
                        transition_id: 2,
                        slot_index: 0,
                        route_id: 2,
                        offset_x: -1,
                        offset_y: 0,
                    },
                    {
                        transition_id: 3,
                        slot_index: 0,
                        route_id: 2,
                        offset_x: 1,
                        offset_y: 0,
                    },
                ]);
                expect(
                    db
                        .prepare(
                            "SELECT DISTINCT path_style, path_params, route_id FROM timeline_transitions",
                        )
                        .all()
                        .map((r) => ({ ...r })),
                ).toEqual([
                    { path_style: "direct", path_params: null, route_id: null },
                ]);
                expect(
                    db.prepare("SELECT * FROM timeline_route_violations").all(),
                ).toEqual([]);
                expect(
                    db.prepare("SELECT count(*) AS n FROM history_undo").get(),
                ).toEqual({ n: 0 });
                expect(readUserVersion(db)).toBe(LANE_MODEL_USER_VERSION);
                // QA-FV-L1: past the newest version a step-15 build opens (10), so it refuses it
                expect(readUserVersion(db)).toBeGreaterThan(10);
                const { snapshot } = await readTimelineTables(
                    getOrm(db) as never,
                );
                const r = createResolver(snapshot);
                for (const m of [1, 2, 3])
                    for (let b = -1; b <= 9; b += 0.125) {
                        const got = r.positionAt(m, b);
                        const want = stepFifteen(m, b);
                        expect(
                            Object.is(got[0], want[0]) &&
                                Object.is(got[1], want[1]),
                            `M${m}@${b}: ${got} vs ${want}`,
                        ).toBe(true);
                    }
            } finally {
                db.close();
            }
        })();
        // Opening again moves nothing twice
        await open(file);
        withDb(file, (db) =>
            expect(
                db.prepare("SELECT count(*) AS n FROM timeline_lanes").get(),
            ).toEqual({ n: 3 }),
        );
    });
});
